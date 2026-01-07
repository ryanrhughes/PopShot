/**
 * Background service worker for Fizzy Feedback extension
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
  
  console.log(`[Fizzy SW] ${method} ${url}`)
  console.log(`[Fizzy SW] Request headers:`)
  Object.entries(headers).forEach(([key, value]) => {
    // Don't log full auth token
    const displayValue = key.toLowerCase() === 'authorization' ? value.substring(0, 20) + '...' : value
    console.log(`  ${key}: ${displayValue}`)
  })
  if (body) {
    console.log(`[Fizzy SW] Body: ${body}`)
  }
  
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
  
  console.log(`[Fizzy SW] Response: ${response.status} ${response.statusText}`)
  
  // Log all response headers for debugging
  console.log(`[Fizzy SW] Response headers:`)
  response.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`)
  })
  
  const location = response.headers.get('Location') || undefined
  
  if (!response.ok) {
    // Read the raw response body for debugging
    const rawBody = await response.text()
    console.log(`[Fizzy SW] Error response body: ${rawBody}`)
    
    let errorMessage = `API error: ${response.status} ${response.statusText}`
    try {
      const errorData = JSON.parse(rawBody)
      console.log(`[Fizzy SW] Parsed error data:`, errorData)
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

// Log when service worker starts
console.log('Fizzy Feedback service worker started')
