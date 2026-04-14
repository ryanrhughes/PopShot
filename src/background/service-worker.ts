/**
 * Background service worker for PopShot extension
 * Handles screenshot capture, API requests, and coordinates messaging between components
 */

import { parseApiErrorMessage } from './api-error'
import { parseOAuthErrorCode, type OAuthErrorCode } from './oauth-error'

const FIZZY_API_BASE = 'https://app.fizzy.do'
const BASECAMP_API_BASE = 'https://3.basecampapi.com'
const BASECAMP_AUTH_BASE = 'https://launchpad.37signals.com'

// Listen for messages from popup and other components
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Service Worker] Received message:', message.action)
  
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
        // Don't log 403 errors - these are expected for archived/inaccessible accounts
        if (error.status !== 403) {
          console.error('API request failed:', error)
        }
        sendResponse({
          success: false,
          error: error.message,
          status: error.status,
          // errorCode is populated only for OAuth token-endpoint failures so
          // callers can distinguish invalid_grant (inline reconnect) from
          // invalid_client (must reconfigure in Settings).
          errorCode: error.errorCode,
        })
      })

    return true
  }

  // Show success notification and save to history
  if (message.action === 'showSuccessNotification') {
    showSuccessNotification(message.cardUrl, message.title, message.integration)
    addToHistory(message.title, message.cardUrl, message.integration)
    sendResponse({ success: true })
    return true
  }

  // Handle Basecamp OAuth code exchange
  if (message.action === 'basecampOAuthExchange') {
    handleBasecampOAuthExchange(message.code, message.redirectUri)
      .then((result) => {
        sendResponse({ success: true, accountName: result.accountName })
      })
      .catch((error) => {
        console.error('Basecamp OAuth exchange failed:', error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // Handle Basecamp OAuth start (full flow including launchWebAuthFlow)
  if (message.action === 'basecampOAuthStart') {
    runSingleFlightOAuth(() => handleBasecampOAuthStart(message.clientId, message.redirectUri))
      .then((result) => {
        sendResponse({ success: true, accountName: result.accountName })
      })
      .catch((error) => {
        console.error('Basecamp OAuth start failed:', error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // Inline reconnect: any UI surface (annotate, popup, options) can call this
  // when the stored session expires. Reads the stored clientId/redirectUri so
  // callers don't need to plumb them; coalesces concurrent callers into one
  // OAuth popup via runSingleFlightOAuth.
  if (message.action === 'basecampOAuthReconnect') {
    runSingleFlightOAuth(handleBasecampOAuthReconnect)
      .then((result) => {
        sendResponse({ success: true, accountName: result.accountName })
      })
      .catch((error) => {
        console.error('Basecamp OAuth reconnect failed:', error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // Handle Basecamp test connection
  if (message.action === 'basecampTestConnection') {
    handleBasecampTestConnection(message.accessToken)
      .then((result) => {
        sendResponse({ success: true, projectCount: result.projectCount })
      })
      .catch((error) => {
        console.error('Basecamp test connection failed:', error)
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
  body?: string | ArrayBuffer
}

interface ApiResult {
  data: unknown
  location?: string
  headers?: Record<string, string>
}

/**
 * Determine the appropriate Origin header based on the URL
 */
function getOriginForUrl(url: string): string {
  if (url.startsWith(BASECAMP_API_BASE)) {
    return BASECAMP_API_BASE
  }
  if (url.startsWith(BASECAMP_AUTH_BASE)) {
    return BASECAMP_AUTH_BASE
  }
  // Default to Fizzy
  return FIZZY_API_BASE
}

async function handleApiRequest(message: ApiRequestMessage): Promise<ApiResult> {
  const { method, url, headers, body } = message
  
  // Add Origin header matching the API to satisfy CSRF protection
  // Chrome extensions with host_permissions can set custom origins
  const origin = getOriginForUrl(url)
  const headersWithOrigin = {
    ...headers,
    'Origin': origin,
  }
  
  // Handle body - could be string (JSON) or array of numbers (binary for file uploads)
  let fetchBody: BodyInit | undefined
  if (body) {
    if (Array.isArray(body) && body.every(v => typeof v === 'number')) {
      // Array of numbers = binary data for file uploads (e.g., Basecamp attachments)
      // Convert back to Uint8Array
      fetchBody = new Uint8Array(body)
    } else if (typeof body === 'string') {
      fetchBody = body
    } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      // Direct binary data (shouldn't happen through messaging, but just in case)
      fetchBody = body
    } else if (typeof body === 'object' && body !== null) {
      // Plain object - serialize as JSON
      fetchBody = JSON.stringify(body)
    }
  }
  
  // The refresh path goes through swFetch -> here. Log both edges from the SW
  // so the refresh is observable in chrome://extensions -> Service Worker
  // without having to open DevTools on the annotate tab. Inspect grant_type
  // to label refresh vs initial code exchange.
  const isTokenEndpoint = url.startsWith(`${BASECAMP_AUTH_BASE}/authorization/token`)
  let tokenOp: 'refresh' | 'exchange' | 'token' = 'token'
  if (isTokenEndpoint) {
    if (typeof body === 'string' && body.includes('"grant_type":"refresh_token"')) {
      tokenOp = 'refresh'
    } else if (typeof body === 'string' && body.includes('"grant_type":"authorization_code"')) {
      tokenOp = 'exchange'
    }
    console.log(`[Basecamp SW] Access token ${tokenOp}: ${method} ${url}`)
  }

  const response = await fetch(url, {
    method,
    headers: headersWithOrigin,
    body: fetchBody,
    credentials: 'omit', // Don't send cookies - use only Bearer token auth
  })

  const location = response.headers.get('Location') || undefined

  // Collect response headers
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  if (!response.ok) {
    const rawBody = await response.text()
    const errorMessage = parseApiErrorMessage(response.status, response.statusText, rawBody)
    const error = new Error(errorMessage) as Error & {
      status: number
      errorCode?: OAuthErrorCode
    }
    error.status = response.status
    // For OAuth token-endpoint failures, extract the standard OAuth error
    // code so upstream code can branch on invalid_grant vs invalid_client
    // without re-parsing the already-flattened message string.
    if (isTokenEndpoint) {
      error.errorCode = parseOAuthErrorCode(rawBody)
      console.warn(
        `[Basecamp SW] Access token ${tokenOp} FAILED: status=${response.status} errorCode=${error.errorCode ?? 'unknown'}`
      )
    }
    throw error
  }

  if (isTokenEndpoint) {
    const label = tokenOp === 'refresh' ? 'refreshed' : tokenOp === 'exchange' ? 'exchanged' : 'token ok'
    console.log(`[Basecamp SW] Access token ${label} (status=${response.status})`)
  }
  
  // Handle empty responses (like 201 Created or 204 No Content)
  const contentLength = response.headers.get('Content-Length')
  if (response.status === 204 || contentLength === '0') {
    return { data: null, location, headers: responseHeaders }
  }
  
  const data = await response.json()
  return { data, location, headers: responseHeaders }
}

/**
 * Show a success notification after submission
 */
function showSuccessNotification(cardUrl: string, title: string, integration?: string) {
  const destination = integration === 'basecamp' ? 'Basecamp' : 'Fizzy'
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icons/icon-128.png'),
    title: 'Feedback Submitted!',
    message: title || `Your feedback has been submitted to ${destination}.`,
    buttons: [{ title: 'View' }],
    requireInteraction: false,
  }, (notificationId) => {
    // Store the URL so we can open it when clicked
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
    // Check if any integration is configured
    const { apiKey, integrationCredentials } = await chrome.storage.local.get(['apiKey', 'integrationCredentials'])
    const hasFizzy = apiKey || integrationCredentials?.fizzy?.apiKey
    const hasBasecamp = integrationCredentials?.basecamp?.accessToken
    
    if (!hasFizzy && !hasBasecamp) {
      // Open settings page if no integrations configured
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
// Basecamp OAuth
// ============================================================================

interface BasecampTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface BasecampAuthorizationResponse {
  identity: {
    id: number
    first_name: string
    last_name: string
    email_address: string
  }
  accounts: Array<{
    product: string
    id: number
    name: string
    href: string
    app_href: string
  }>
}

/**
 * Generate a cryptographically secure random state parameter for CSRF protection
 */
function generateOAuthState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Store OAuth state temporarily for validation
let pendingOAuthState: string | null = null

// In-flight OAuth promise. Multiple UI surfaces hitting 401 simultaneously
// (e.g. a double-click, or annotate + options both racing) must coalesce
// into a single launchWebAuthFlow popup - two popups would confuse the user
// and the second would likely fail Chrome's identity API contract.
let inFlightOAuth: Promise<{ accountName: string }> | null = null

function runSingleFlightOAuth(
  fn: () => Promise<{ accountName: string }>
): Promise<{ accountName: string }> {
  if (inFlightOAuth) return inFlightOAuth
  inFlightOAuth = fn().finally(() => {
    inFlightOAuth = null
  })
  return inFlightOAuth
}

async function handleBasecampOAuthStart(clientId: string, redirectUri: string): Promise<{ accountName: string }> {
  // Generate state parameter for CSRF protection
  const state = generateOAuthState()
  pendingOAuthState = state
  
  // Build the authorization URL with state parameter
  // Using response_type=code for standard OAuth 2.0 Authorization Code flow
  const params = new URLSearchParams({
    type: 'web_server',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state,
  })
  const authUrl = `https://launchpad.37signals.com/authorization/new?${params.toString()}`

  // Launch the OAuth flow
  let responseUrl: string | undefined
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    })
  } catch (err) {
    pendingOAuthState = null
    throw err
  }

  if (!responseUrl) {
    pendingOAuthState = null
    throw new Error('Authorization was cancelled')
  }

  // Extract the authorization code and state from the response URL
  const url = new URL(responseUrl)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // Validate state parameter to prevent CSRF attacks
  if (returnedState !== pendingOAuthState) {
    pendingOAuthState = null
    throw new Error('Invalid OAuth state - possible CSRF attack')
  }
  pendingOAuthState = null

  if (error) {
    throw new Error(`Authorization failed: ${error}`)
  }

  if (!code) {
    throw new Error('No authorization code received')
  }

  // Exchange code for tokens
  return handleBasecampOAuthExchange(code, redirectUri)
}

/**
 * Re-run the OAuth authorization flow using already-stored client credentials.
 *
 * Used by the inline "Reconnect" affordance on UI surfaces that hit a 401.
 * Reads clientId + redirectUri from storage so callers don't need to plumb
 * them; otherwise identical to handleBasecampOAuthStart. If the client
 * credentials aren't configured at all (e.g. user never connected), rejects
 * so the UI can steer the user to Settings.
 */
async function handleBasecampOAuthReconnect(): Promise<{ accountName: string }> {
  const { integrationCredentials } = await chrome.storage.local.get('integrationCredentials')
  const clientId = integrationCredentials?.basecamp?.clientId

  if (!clientId) {
    throw new Error(
      'Basecamp is not configured. Open Settings to enter Client ID, Client Secret, and Redirect URI.'
    )
  }

  // Users connected before redirectUri was persisted (or whoever used the
  // chrome.identity default) won't have a stored redirectUri. Fall back to the
  // runtime default rather than forcing them through Settings.
  const redirectUri =
    integrationCredentials?.basecamp?.redirectUri || chrome.identity.getRedirectURL()

  return handleBasecampOAuthStart(clientId, redirectUri)
}

async function handleBasecampOAuthExchange(code: string, redirectUri: string): Promise<{ accountName: string }> {
  // Get stored client credentials
  const { integrationCredentials } = await chrome.storage.local.get('integrationCredentials')
  const clientId = integrationCredentials?.basecamp?.clientId
  const clientSecret = integrationCredentials?.basecamp?.clientSecret

  if (!clientId || !clientSecret) {
    throw new Error('Basecamp app credentials not configured')
  }

  // Exchange code for tokens using standard OAuth 2.0 format
  // Basecamp accepts both 'type: web_server' and 'grant_type: authorization_code'
  const tokenResponse = await fetch(`${BASECAMP_AUTH_BASE}/authorization/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PopShot (https://github.com/anomalyco/PopShot)',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('Token exchange failed:', errorText)
    throw new Error('Failed to exchange authorization code for token')
  }

  const tokenData: BasecampTokenResponse = await tokenResponse.json()

  // Get user info and accounts
  const authResponse = await fetch(`${BASECAMP_AUTH_BASE}/authorization.json`, {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'PopShot (https://github.com/anomalyco/PopShot)',
    },
  })

  if (!authResponse.ok) {
    throw new Error('Failed to get Basecamp authorization info')
  }

  const authData: BasecampAuthorizationResponse = await authResponse.json()

  // Find a Basecamp 3 account (bc3)
  const bc3Account = authData.accounts.find(a => a.product === 'bc3')
  if (!bc3Account) {
    throw new Error('No Basecamp 3 account found. PopShot requires Basecamp 3.')
  }

  // Calculate expiration time
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // Save credentials. redirectUri is persisted so the inline reconnect flow
  // (which doesn't go through the Options form) can rebuild the authorize URL
  // without asking the user to re-enter it.
  const credentials = {
    clientId,
    clientSecret,
    redirectUri,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    accountId: String(bc3Account.id),
    accountName: bc3Account.name,
    apiBaseUrl: bc3Account.href,
  }

  await chrome.storage.local.set({
    integrationCredentials: {
      ...integrationCredentials,
      basecamp: credentials,
    },
  })

  return { accountName: bc3Account.name }
}

// ============================================================================
// Basecamp Test Connection
// ============================================================================

async function handleBasecampTestConnection(accessToken: string): Promise<{ projectCount: number }> {
  // Get stored credentials to find the account ID
  const { integrationCredentials } = await chrome.storage.local.get('integrationCredentials')
  const accountId = integrationCredentials?.basecamp?.accountId

  if (!accountId) {
    throw new Error('Basecamp account not configured')
  }

  // Test the connection by fetching projects
  const response = await fetch(`${BASECAMP_API_BASE}/${accountId}/projects.json`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'PopShot (https://github.com/anomalyco/PopShot)',
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Access token is invalid or expired. Please reconnect.')
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const projects = await response.json()
  return { projectCount: Array.isArray(projects) ? projects.length : 0 }
}

// ============================================================================
// History Management
// ============================================================================

interface HistoryEntry {
  title: string
  cardUrl: string
  timestamp: number
  integration?: string
}

const MAX_HISTORY_ENTRIES = 50

async function addToHistory(title: string, cardUrl: string, integration?: string) {
  const { submissionHistory = [] } = await chrome.storage.local.get('submissionHistory')
  
  const entry: HistoryEntry = {
    title,
    cardUrl,
    timestamp: Date.now(),
    integration,
  }
  
  // Add to beginning, limit to MAX entries
  const newHistory = [entry, ...submissionHistory].slice(0, MAX_HISTORY_ENTRIES)
  await chrome.storage.local.set({ submissionHistory: newHistory })
}

// Log when service worker starts
console.log('PopShot service worker started')
