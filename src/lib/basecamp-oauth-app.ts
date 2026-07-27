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
 * Which one a build gets is decided by Vite's mode - the same signal that
 * decides whether the manifest carries the dev key, so the redirect URI and the
 * credentials can never disagree.
 */

export interface BasecampOAuthApp {
  clientId: string
  clientSecret: string
}

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

/**
 * Keyed off MODE, not PROD. `import.meta.env.PROD` follows NODE_ENV, which
 * `vite build` pins to production even under `--mode development` - that would
 * hand a dev-ID build the production credentials and fail the redirect URI
 * check. MODE is the same value manifest.config.ts uses to decide the dev key,
 * so the extension ID and the credentials always agree.
 */
export const BASECAMP_OAUTH_APP: BasecampOAuthApp =
  import.meta.env.MODE === 'production' ? PRODUCTION_APP : DEVELOPMENT_APP

/**
 * Whether this build shipped usable credentials. False only in a build with
 * the constants blanked out, in which case callers fall back to a client
 * id/secret stored via the Settings override.
 */
export function hasBuiltInOAuthApp(): boolean {
  return Boolean(BASECAMP_OAUTH_APP.clientId && BASECAMP_OAUTH_APP.clientSecret)
}

/**
 * Resolve the credentials to authorize with: the built-in app unless the user
 * has supplied their own via the Settings override, which wins so anyone
 * running their own Basecamp integration keeps working.
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
  // The built-in apps are registered against the extension's own
  // chromiumapp.org URI, so it is never configurable here.
  return { ...BASECAMP_OAUTH_APP, redirectUri: getBasecampRedirectUri() }
}

/**
 * The redirect URI to register with Basecamp. Derived from the extension ID at
 * runtime, so it needs no per-environment configuration.
 */
export function getBasecampRedirectUri(): string {
  return chrome.identity.getRedirectURL()
}
