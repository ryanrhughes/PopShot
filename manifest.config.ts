import { defineManifest } from '@crxjs/vite-plugin'

/**
 * Public key pinning the extension ID for development builds.
 *
 * Without a key, Chrome derives an unpacked extension's ID from its install
 * path, so every machine and every checkout location produces a different ID -
 * and therefore a different chromiumapp.org redirect URI. Basecamp's OAuth app
 * registration only matches a fixed redirect URI, so the ID has to be stable
 * across the whole team for a shared dev OAuth app to work.
 *
 * Production omits this: the Chrome Web Store holds the signing key that
 * determines the published ID.
 */
const DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwKjfRI2hhcQYOjaFw1AIMJhWUM8oOCJtBXYHme/PL2OC+Xtphlm/FdlR/b8K7GuC43WQpOmqEoGpThQLi2ob8tzJR7TzHQy4ELxV0VT4mHOCKFVZHU1wWR5kbAPB+blg4nMeRWlwOerXkrUMOStSEmc4imhC5df5Q1PTrJ0VuuIug3qfyMbN98aVVRROAl5kywRwQ791LmUk2AKBN/lWP0XDDZ5mYiBJHO1+UNGUTz9aM9rV37oXp9aIel49Acey2mnZIFkn75I5g/UrfDKmUArVy2pQZNKpXRHSfgLu+0VRCtgJGtpa+719fCm1r7QsHtswmA5acfnPgpaVu28oKQIDAQAB'

export const buildManifest = (mode: string) => defineManifest({
  ...(mode === 'production' ? {} : { key: DEV_KEY }),

  manifest_version: 3,
  name: 'PopShot',
  description: 'Capture, annotate, and send screenshot feedback to Fizzy or Basecamp',
  version: '0.4.0',
  
  // Extension icon
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },

  // Extension icon - no popup, triggers screenshot capture directly
  action: {
    default_icon: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
    default_title: 'Capture Screenshot (Alt+Shift+S)',
  },

  // Keyboard shortcut for screenshot capture
  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Alt+Shift+S',
        mac: 'Alt+Shift+S',
      },
      description: 'Capture screenshot',
    },
  },

  // Options page for settings
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },

  // Background service worker
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  // Permissions
  permissions: [
    'activeTab',      // Capture screenshot of current tab
    'storage',        // Store API key and preferences
    'scripting',      // Inject scripts to get viewport dimensions
    'notifications',  // Show success notifications
    'contextMenus',   // Right-click menu for History/Settings
    'declarativeNetRequest',  // Modify headers for API requests
    'identity',       // OAuth flows with chrome.identity.launchWebAuthFlow
  ],

  // Host permissions for API requests (required for service worker fetch requests)
  host_permissions: [
    'https://app.fizzy.do/*',
    'https://3.basecampapi.com/*',
    'https://launchpad.37signals.com/*',
  ],

  // Declarative net request rules to fix Origin header for Fizzy API
  declarative_net_request: {
    rule_resources: [
      {
        id: 'ruleset_1',
        enabled: true,
        path: 'public/rules.json',
      },
    ],
  },
})

export default buildManifest
