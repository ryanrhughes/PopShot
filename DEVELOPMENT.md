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

Basecamp uses OAuth 2.0, which requires registering an application.

#### Step 1: Register a Basecamp App

1. Go to [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations)
2. Sign in with your Basecamp account
3. Click **Register your application**
4. Fill in the details:
   - **Name**: PopShot (Development) or similar
   - **Company**: Your company/name
   - **Website URL**: Your website or GitHub repo
   - **Redirect URI**: See below

#### Step 2: Configure Redirect URI

The redirect URI format for Chrome extensions is:
```
https://<extension-id>.chromiumapp.org/
```

**Important**: Your local extension ID is different from the published extension ID.

- **Published extension ID**: `hkojmgeacmocafnaiallhmkfjcimafok`
- **Local extension ID**: Found at `chrome://extensions/` after loading the unpacked extension

For local development, you need to register your **local** extension's redirect URI:
```
https://<your-local-extension-id>.chromiumapp.org/
```

You can register **multiple redirect URIs** in your Basecamp app if you want to support both local and published versions.

#### Step 3: Get Your Credentials

After registration, Basecamp will show you:
- **Client ID**: Public identifier (safe to share)
- **Client Secret**: Private key (keep secure, shown only once)

Save these somewhere secure - you'll need them for testing.

#### Step 4: Configure PopShot for Local Development

1. Open PopShot Options page
2. Go to the Basecamp section
3. Enter your **Client Secret**
4. Expand **Advanced Settings**
5. Update the **Redirect URI** to match your local extension:
   ```
   https://<your-local-extension-id>.chromiumapp.org/
   ```
6. Optionally update the **Client ID** if you're using your own Basecamp app
7. Click **Connect to Basecamp**

### Switching Between Local and Production

When switching between local development and testing the published extension:

1. Update the **Redirect URI** in Advanced Settings to match the extension you're using
2. Make sure that redirect URI is registered in your Basecamp app at launchpad.37signals.com

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
2. Or run `npm run build` and reload the extension

## Publishing

1. Update version in `manifest.config.ts`
2. Run `npm run build`
3. Zip the `dist` folder
4. Upload to Chrome Web Store

Before publishing with Basecamp support:
- Ensure the published extension's redirect URI is registered in Basecamp
- Consider hardcoding OAuth credentials for seamless user experience
