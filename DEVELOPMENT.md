# PopShot Development Guide

This guide covers how to set up and develop PopShot locally, including configuring integrations for testing.

## Prerequisites

- Node.js 18+
- npm or yarn
- Chrome browser

## Getting Started

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist` folder in the project directory
5. Note your **Extension ID** - you'll need this for OAuth configuration

Your local extension ID will be different from the published extension ID. It looks like a 32-character string, e.g., `mgpdinnhmnednegeiphfppmlagfekjmb`.

## Debugging

### Service Worker

1. Go to `chrome://extensions/`
2. Find PopShot
3. Click **"service worker"** link to open DevTools
4. Check Console for logs and errors

### Options Page / Popup / Annotate Page

Right-click on the page and select **Inspect** to open DevTools.

### Reloading After Changes

- **Development mode** (`npm run dev`): Changes auto-reload, but you may need to refresh the extension page
- **After build**: Click the refresh icon on the extension card at `chrome://extensions/`

## Configuring Integrations

### Fizzy Integration

1. Go to [app.fizzy.do](https://app.fizzy.do) and sign in
2. Navigate to **My Profile** > **Developer** > **Personal access tokens**
3. Generate a new token with **Read + Write** permissions
4. Enter the token in PopShot Options > Fizzy section

### Basecamp Integration

Basecamp OAuth credentials ship with the extension - contributors do **not**
register their own app. Two apps are registered at launchpad.37signals.com, one
per environment, because each extension ID gets its own redirect URI:

| Environment | Extension ID | Redirect URI |
|---|---|---|
| Production | `hkojmgeacmocafnaiallhmkfjcimafok` (Chrome Web Store) | `https://hkojmgeacmocafnaiallhmkfjcimafok.chromiumapp.org/` |
| Development | `njnjmoplkkjcfjiojcdkdllmfphefbdj` (pinned, see below) | `https://njnjmoplkkjcfjiojcdkdllmfphefbdj.chromiumapp.org/` |

The credentials live in `src/lib/basecamp-oauth-app.ts`. Launchpad has no PKCE
and no public-client support, so the client secret has to ship in the bundle;
37signals do the same in their own `basecamp-cli`, where the equivalent
constants are commented "public client credentials for the native CLI app, not
secrets". What actually scopes an authorization is the registered redirect URI,
which nobody else can claim.

#### Why the development ID is pinned

Without a `key` in the manifest, Chrome derives an unpacked extension's ID from
its install path, so every machine and checkout would get a different ID and a
different redirect URI. `manifest.config.ts` injects a fixed public key for
non-production builds, giving every developer the same ID. Production omits it -
the Web Store holds the signing key.

#### How the right credentials are chosen

The OAuth app is selected at **runtime** from `chrome.runtime.id` (see
`resolveOAuthApp` in `src/lib/basecamp-oauth-app.ts`): whatever identity Chrome
gave the install picks the app registered against that identity. Since the
redirect URI is also derived from the runtime ID, the two can never disagree.
An install whose ID matches neither registration (e.g. a production build
loaded unpacked, which has no pinned key and gets a path-derived ID) fails
fast with an error explaining exactly that, instead of Launchpad's opaque
authorization error.

#### Building for local development

```bash
npm run dev        # watch + HMR, keeps dist/ updated (preferred)
npm run build:dev  # one-shot development build
```

Build outputs are separated by mode so a release build can never poison the
load-unpacked folder:

| Command | Mode | Output | Manifest key |
|---|---|---|---|
| `npm run dev` / `npm run build:dev` | development | `dist/` | pinned dev key |
| `npm run build` / `npm run release` | production | `dist-release/` | none (Web Store signs) |

`dist/` is the only folder you ever Load unpacked, and only development builds
write to it.

#### Troubleshooting

**"Authorization page could not be loaded" or an extension-ID mismatch error** -
the install's ID matches neither OAuth registration. Rebuild with
`npm run build:dev` and reload from `dist/`. Verify the manifest carries the
pinned key:

```bash
node -e "console.log(!!require('./dist/manifest.json').key)"   # true = dev build
```

The service worker logs the pairing on every connect attempt:

```
[Basecamp] Authorizing with client e81e2767... redirect https://njnjmoplkkjcfjiojcdkdllmfphefbdj.chromiumapp.org/
```

**Toggle greyed out in `chrome://extensions`** - Chrome disabled the extension
after a failed reload (Vite empties `dist/` on each build). Remove the extension
and re-add it with Load unpacked; the pinned key keeps the ID stable.

#### Using your own Basecamp app

A `clientId` + `clientSecret` stored in `integrationCredentials.basecamp`
overrides the built-in app (see `resolveOAuthApp`). Connections made before the
built-in app existed keep working this way. There is no UI for setting it.

## Project Structure

```
PopShot/
├── src/
│   ├── annotate/          # Screenshot annotation page
│   │   ├── AnnotatePage.tsx
│   │   ├── DestinationSelector.tsx
│   │   ├── IntegrationSelector.tsx
│   │   └── ...
│   ├── background/        # Service worker
│   │   └── service-worker.ts
│   ├── history/           # Submission history page
│   ├── lib/               # Shared libraries
│   │   ├── integrations/  # Integration abstraction layer
│   │   │   ├── types.ts   # Common interfaces
│   │   │   ├── fizzy.ts   # Fizzy integration
│   │   │   ├── basecamp.ts # Basecamp integration
│   │   │   └── registry.ts # Integration registry
│   │   ├── fizzy-api.ts   # Fizzy API client
│   │   ├── basecamp-api.ts # Basecamp API client
│   │   ├── storage.ts     # Chrome storage utilities
│   │   └── ...
│   ├── options/           # Settings/options page
│   ├── popup/             # Extension popup
│   └── test/              # Test utilities
├── public/                # Static assets
├── manifest.config.ts     # Extension manifest
└── vite.config.ts         # Vite configuration
```

## Integration Architecture

PopShot uses an abstraction layer to support multiple integrations:

### Key Interfaces (`src/lib/integrations/types.ts`)

- **Integration**: Common interface all integrations implement
- **Destination**: Where to send reports (Fizzy Board / Basecamp Project)
- **SubDestination**: Secondary selection (Basecamp To-do List)
- **BugReport**: The report being submitted
- **SubmissionResult**: Result after submission

### Adding a New Integration

1. Create a new file in `src/lib/integrations/` (e.g., `jira.ts`)
2. Implement the `Integration` interface
3. Register it in `src/lib/integrations/registry.ts`
4. Add credential types to `src/lib/integrations/types.ts`
5. Add storage functions in `src/lib/storage.ts`
6. Add UI configuration in `src/options/Options.tsx`

## OAuth Flow (Basecamp)

The Basecamp OAuth flow works as follows:

1. User clicks "Connect to Basecamp" in Options
2. Options page sends `basecampOAuthStart` message to service worker
3. Service worker calls `chrome.identity.launchWebAuthFlow()` with the auth URL
4. User authorizes in the popup window
5. Basecamp redirects to `https://<extension-id>.chromiumapp.org/?code=...`
6. Service worker extracts the code and exchanges it for tokens
7. Tokens are stored in `chrome.storage.local`

### Token Refresh

Basecamp tokens expire after 2 weeks. The `BasecampApiClient` automatically refreshes tokens when needed using the stored refresh token.

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/lib/storage.test.ts
```

## Common Issues

### "Authorization page could not be loaded"

The redirect URI doesn't match what's registered in Basecamp. Check:
1. Your extension ID at `chrome://extensions/`
2. The redirect URI in PopShot Options > Advanced Settings
3. The redirect URIs registered in your Basecamp app

### Service worker not responding

1. Go to `chrome://extensions/`
2. Click the refresh icon on PopShot
3. Try again

### "Extension context invalidated" in tests

This is expected - it's logged when the Chrome mock simulates API errors. The tests still pass.

### Changes not reflecting

1. Make sure `npm run dev` is running (for development)
2. Or run `npm run build:dev` and reload the extension

## Publishing

1. Update version in `manifest.config.ts` and `package.json`
2. Run `npm run release` - builds production into `dist-release/` and zips it
   into `popshot.zip`
3. Upload `popshot.zip` to the Chrome Web Store

The production OAuth app is already registered against the Web Store extension
ID; nothing OAuth-related needs configuring per release.
