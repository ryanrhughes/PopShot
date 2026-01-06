import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Fizzy Feedback',
  description: 'Capture screenshots and submit feedback directly to Fizzy boards',
  version: '0.1.0',
  
  // Extension icon
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },

  // Popup when clicking extension icon
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
    default_title: 'Fizzy Feedback',
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
  ],

  // Host permissions for Fizzy API
  host_permissions: [
    'https://app.fizzy.do/*',
    'https://*.fizzy.do/*',
  ],
})
