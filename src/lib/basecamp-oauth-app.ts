/**
 * Built-in Basecamp OAuth app credentials.
 *
 * Launchpad has no PKCE and no public-client support, so the client secret is
 * required at token exchange and has to ship inside the extension. 37signals
 * do the same in their own basecamp-cli, where the equivalent constants are
 * commented "public client credentials for the native CLI app, not secrets".
 * What actually scopes an authorization is the redirect URI registered against
 * the app, which Chrome derives from the extension ID and nobody else can claim.
 *
 * Dev and production are separate registrations because each extension ID
 * produces its own chromiumapp.org redirect URI:
 *
 *   production  hkojmgeacmocafnaiallhmkfjcimafok  (Chrome Web Store)
 *   development njnjmoplkkjcfjiojcdkdllmfphefbdj  (pinned by DEV_KEY in manifest.config.ts)
 *
 * Which app a given install uses is decided at RUNTIME from chrome.runtime.id,
 * not at build time from Vite's mode. The redirect URI is derived from the
 * runtime ID, so keying the credentials off anything else lets them disagree -
 * exactly what happened when a production build (no dev key, production
 * credentials) was loaded unpacked and got a path-derived ID that matched
 * neither registration. Selecting by the actual ID makes disagreement
 * impossible: whatever identity Chrome gave this install picks the app
 * registered against that identity, or fails fast with an actionable error.
 */

export interface BasecampOAuthApp {
  clientId: string
  clientSecret: string
}

/** The ID the Chrome Web Store's signing key produces. */
export const PRODUCTION_EXTENSION_ID = 'hkojmgeacmocafnaiallhmkfjcimafok'

/** The ID pinned by DEV_KEY in manifest.config.ts for unpacked dev builds. */
export const DEVELOPMENT_EXTENSION_ID = 'njnjmoplkkjcfjiojcdkdllmfphefbdj'

/** Registered against the Chrome Web Store extension ID. */
const PRODUCTION_APP: BasecampOAuthApp = {
  clientId: '0cefe54a70d043a08bc17a0c70139ae6b94f16b0',
  clientSecret: '1bd82727a8a336e006dab9225824cd89c3c34766',
}

/** Registered against the pinned development extension ID. */
const DEVELOPMENT_APP: BasecampOAuthApp = {
  clientId: 'e81e2767a52c693d6a0790d2da10a5d8aa86d390',
  clientSecret: '41f9c6452915d35f607ffafbe25851471d786b00',
}

const BUILT_IN_APPS: Record<string, BasecampOAuthApp> = {
  [PRODUCTION_EXTENSION_ID]: PRODUCTION_APP,
  [DEVELOPMENT_EXTENSION_ID]: DEVELOPMENT_APP,
}

/**
 * The built-in app registered against this install's actual extension ID, or
 * null when the ID matches neither registration (a production build loaded
 * unpacked, or a fork that hasn't registered its own apps).
 */
export function builtInOAuthApp(): BasecampOAuthApp | null {
  return BUILT_IN_APPS[chrome.runtime.id] ?? null
}

/**
 * Whether this install has usable built-in credentials. False when the
 * extension ID matches neither registration, in which case callers fall back
 * to a client id/secret stored via the Settings override.
 */
export function hasBuiltInOAuthApp(): boolean {
  return builtInOAuthApp() !== null
}

/**
 * Resolve the credentials to authorize with: the built-in app for this
 * install's extension ID unless the user has supplied their own via the
 * Settings override, which wins so anyone running their own Basecamp
 * integration keeps working.
 *
 * Throws with a diagnosis when neither is available - Launchpad's own failure
 * for this case is an opaque "authorization error" that gives the developer
 * nothing to go on.
 */
export function resolveOAuthApp(stored?: {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}): BasecampOAuthApp & { redirectUri: string } {
  if (stored?.clientId && stored?.clientSecret) {
    return {
      clientId: stored.clientId,
      clientSecret: stored.clientSecret,
      // A user-supplied app registers its own redirect URI; fall back to the
      // extension default when they left it blank.
      redirectUri: stored.redirectUri || getBasecampRedirectUri(),
    }
  }

  const builtIn = builtInOAuthApp()
  if (!builtIn) {
    throw new Error(
      `This install's extension ID (${chrome.runtime.id}) matches neither the ` +
        `production (${PRODUCTION_EXTENSION_ID}) nor the development ` +
        `(${DEVELOPMENT_EXTENSION_ID}) OAuth registration, so Basecamp cannot ` +
        `redirect back to it. This usually means a production build was loaded ` +
        `unpacked - production builds omit the key that pins the development ID. ` +
        `Rebuild with \`npm run dev\` or \`npm run build:dev\` and reload the ` +
        `extension from dist/, or supply your own OAuth app in Settings.`
    )
  }

  // The built-in apps are registered against the extension's own
  // chromiumapp.org URI, so it is never configurable here.
  return { ...builtIn, redirectUri: getBasecampRedirectUri() }
}

/**
 * The redirect URI to register with Basecamp. Derived from the extension ID at
 * runtime, so it needs no per-environment configuration.
 */
export function getBasecampRedirectUri(): string {
  return chrome.identity.getRedirectURL()
}
