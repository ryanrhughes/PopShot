import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'PopShot',
  description: 'Capture, annotate, and send screenshot feedback directly to Fizzy',
  version: '0.1.0',
  
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
    default_title: 'Capture Screenshot',
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
  ],

  // Host permissions for Fizzy API (required for service worker fetch requests)
  host_permissions: [
    'https://app.fizzy.do/*',
  ],
})
