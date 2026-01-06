/**
 * Background service worker for Fizzy Feedback extension
 * Handles screenshot capture and coordinates messaging between components
 */

// Listen for messages from popup and other components
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    captureScreenshot()
      .then((dataUrl) => {
        sendResponse({ success: true, dataUrl })
      })
      .catch((error) => {
        console.error('Screenshot capture failed:', error)
        sendResponse({ success: false, error: error.message })
      })
    
    // Return true to indicate we'll send response asynchronously
    return true
  }

  if (message.action === 'getCurrentTab') {
    getCurrentTab()
      .then((tab) => {
        sendResponse({ success: true, tab })
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message })
      })
    
    return true
  }
})

/**
 * Capture screenshot of the currently active tab
 */
async function captureScreenshot(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  
  if (!tab?.id) {
    throw new Error('No active tab found')
  }

  // Check if we can capture this tab (some pages like chrome:// are restricted)
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    throw new Error('Cannot capture screenshots of browser internal pages')
  }

  // Capture the visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 100,
  })

  return dataUrl
}

/**
 * Get information about the currently active tab
 */
async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

// Log when service worker starts
console.log('Fizzy Feedback service worker started')
