/**
 * Background service worker for PopShot extension
 * Handles screenshot capture, API requests, and coordinates messaging between components
 */

const FIZZY_API_BASE = 'https://app.fizzy.do'

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

  if (message.action === 'getTabViewport') {
    getTabViewport()
      .then((viewport) => {
        sendResponse({ success: true, viewport })
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message })
      })
    
    return true
  }

  // Proxy API requests through service worker to avoid CORS
  if (message.action === 'apiRequest') {
    handleApiRequest(message)
      .then((result) => {
        sendResponse({ success: true, data: result.data, location: result.location })
      })
      .catch((error) => {
        console.error('API request failed:', error)
        sendResponse({ success: false, error: error.message, status: error.status })
      })
    
    return true
  }

  // Show success notification and save to history
  if (message.action === 'showSuccessNotification') {
    showSuccessNotification(message.cardUrl, message.title)
    addToHistory(message.title, message.cardUrl)
    sendResponse({ success: true })
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

/**
 * Get viewport dimensions from the active tab by injecting a script
 */
async function getTabViewport(): Promise<{ width: number; height: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  
  if (!tab?.id) {
    throw new Error('No active tab found')
  }

  // Can't inject into chrome:// or extension pages
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    throw new Error('Cannot get viewport from browser internal pages')
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  })

  if (results && results[0]?.result) {
    return results[0].result
  }

  throw new Error('Failed to get viewport dimensions')
}

/**
 * Handle API requests proxied through the service worker
 * This avoids CORS issues since service workers have host_permissions
 */
interface ApiRequestMessage {
  action: 'apiRequest'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  headers: Record<string, string>
  body?: string
}

interface ApiResult {
  data: unknown
  location?: string
}

async function handleApiRequest(message: ApiRequestMessage): Promise<ApiResult> {
  const { method, url, headers, body } = message
  
  // Add Origin header matching the API to satisfy Rails CSRF protection
  // Chrome extensions with host_permissions can set custom origins
  const headersWithOrigin = {
    ...headers,
    'Origin': FIZZY_API_BASE,
  }
  
  const response = await fetch(url, {
    method,
    headers: headersWithOrigin,
    body: body || undefined,
    credentials: 'omit', // Don't send cookies - use only Bearer token auth
  })
  
  const location = response.headers.get('Location') || undefined
  
  if (!response.ok) {
    const rawBody = await response.text()
    let errorMessage = `API error: ${response.status} ${response.statusText}`
    try {
      const errorData = JSON.parse(rawBody)
      if (typeof errorData === 'object' && errorData !== null) {
        errorMessage = Object.entries(errorData as Record<string, unknown>)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ')
      }
    } catch {
      // If not JSON, use raw body
      if (rawBody) {
        errorMessage = rawBody.substring(0, 500)
      }
    }
    
    const error = new Error(errorMessage) as Error & { status: number }
    error.status = response.status
    throw error
  }
  
  // Handle empty responses (like 201 Created or 204 No Content)
  const contentLength = response.headers.get('Content-Length')
  if (response.status === 204 || contentLength === '0') {
    return { data: null, location }
  }
  
  const data = await response.json()
  return { data, location }
}

/**
 * Show a success notification after card creation
 */
function showSuccessNotification(cardUrl: string, title: string) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icons/icon-128.png'),
    title: 'Feedback Submitted!',
    message: title || 'Your card has been created in Fizzy.',
    buttons: [{ title: 'View Card' }],
    requireInteraction: false,
  }, (notificationId) => {
    // Store the card URL so we can open it when clicked
    if (notificationId) {
      chrome.storage.session.set({ [`notification_${notificationId}`]: cardUrl })
    }
  })
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // "View Card" button clicked
    chrome.storage.session.get(`notification_${notificationId}`).then((data) => {
      const cardUrl = data[`notification_${notificationId}`]
      if (cardUrl) {
        chrome.tabs.create({ url: cardUrl })
        chrome.storage.session.remove([`notification_${notificationId}`])
      }
    })
  }
  chrome.notifications.clear(notificationId)
})

// Handle notification click (on the notification itself)
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.session.get(`notification_${notificationId}`).then((data) => {
    const cardUrl = data[`notification_${notificationId}`]
    if (cardUrl) {
      chrome.tabs.create({ url: cardUrl })
      chrome.storage.session.remove([`notification_${notificationId}`])
    }
  })
  chrome.notifications.clear(notificationId)
})

// ============================================================================
// Extension Icon Click Handler
// ============================================================================

// Handle extension icon click - immediately capture screenshot
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Check if API key is configured
    const { apiKey } = await chrome.storage.local.get('apiKey')
    if (!apiKey) {
      // Open settings page if no API key
      chrome.runtime.openOptionsPage()
      return
    }

    // Check if we can capture this tab
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('public/icons/icon-128.png'),
        title: 'Cannot Capture',
        message: 'Screenshots cannot be taken on browser internal pages.',
      })
      return
    }

    // Capture screenshot
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, {
      format: 'png',
      quality: 100,
    })

    // Get viewport dimensions from the tab
    let dimensions = { 
      viewportWidth: 0, 
      viewportHeight: 0,
      devicePixelRatio: 1,
    }
    if (tab.id) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({ 
            viewportWidth: window.innerWidth, 
            viewportHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          }),
        })
        if (results?.[0]?.result) {
          dimensions = results[0].result
        }
      } catch {
        // Ignore dimension errors
      }
    }

    // Store session data and open annotation page
    await chrome.storage.session.set({
      annotationSession: {
        imageDataUrl: dataUrl,
        metadata: {
          url: tab.url || 'Unknown',
          title: tab.title || 'Unknown',
          browser: 'Chrome',
          browserVersion: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || 'Unknown',
          viewportWidth: dimensions.viewportWidth,
          viewportHeight: dimensions.viewportHeight,
          devicePixelRatio: dimensions.devicePixelRatio,
        },
      }
    })

    // Open annotation page
    const annotateUrl = chrome.runtime.getURL('src/annotate/index.html')
    await chrome.tabs.create({ url: annotateUrl })

  } catch (error) {
    console.error('Screenshot capture failed:', error)
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icons/icon-128.png'),
      title: 'Capture Failed',
      message: error instanceof Error ? error.message : 'Failed to capture screenshot',
    })
  }
})

// ============================================================================
// Context Menu Setup
// ============================================================================

// Create context menu items on install
chrome.runtime.onInstalled.addListener(() => {
  // Remove any existing menu items first
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'fizzy-history',
      title: 'History',
      contexts: ['action'],
    })
    chrome.contextMenus.create({
      id: 'fizzy-settings',
      title: 'Settings',
      contexts: ['action'],
    })
  })
})

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'fizzy-history') {
    const historyUrl = chrome.runtime.getURL('src/history/index.html')
    chrome.tabs.create({ url: historyUrl })
  } else if (info.menuItemId === 'fizzy-settings') {
    chrome.runtime.openOptionsPage()
  }
})

// ============================================================================
// History Management
// ============================================================================

interface HistoryEntry {
  title: string
  cardUrl: string
  timestamp: number
}

const MAX_HISTORY_ENTRIES = 50

async function addToHistory(title: string, cardUrl: string) {
  const { submissionHistory = [] } = await chrome.storage.local.get('submissionHistory')
  
  const entry: HistoryEntry = {
    title,
    cardUrl,
    timestamp: Date.now(),
  }
  
  // Add to beginning, limit to MAX entries
  const newHistory = [entry, ...submissionHistory].slice(0, MAX_HISTORY_ENTRIES)
  await chrome.storage.local.set({ submissionHistory: newHistory })
}

// Log when service worker starts
console.log('PopShot service worker started')
