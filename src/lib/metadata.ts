/**
 * Metadata capture utilities for Fizzy Feedback extension
 * Automatically captures page and browser context
 */

export interface PageMetadata {
  url: string
  title: string
  browser: string
  browserVersion: string
  viewportWidth: number
  viewportHeight: number
  devicePixelRatio: number
}

/**
 * Parse browser information from user agent
 */
function parseBrowserInfo(): { browser: string; version: string } {
  const ua = navigator.userAgent
  
  // Check for common browsers
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/([\d.]+)/)
    return { browser: 'Chrome', version: match?.[1] || 'Unknown' }
  }
  
  if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/([\d.]+)/)
    return { browser: 'Edge', version: match?.[1] || 'Unknown' }
  }
  
  if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/([\d.]+)/)
    return { browser: 'Firefox', version: match?.[1] || 'Unknown' }
  }
  
  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/)
    return { browser: 'Safari', version: match?.[1] || 'Unknown' }
  }
  
  return { browser: 'Unknown', version: 'Unknown' }
}

/**
 * Get current tab information
 */
async function getCurrentTabInfo(): Promise<{ url: string; title: string }> {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCurrentTab' })
    if (response?.success && response.tab) {
      return {
        url: response.tab.url || 'Unknown',
        title: response.tab.title || 'Unknown',
      }
    }
  } catch (error) {
    console.error('Failed to get tab info:', error)
  }
  
  return { url: 'Unknown', title: 'Unknown' }
}

/**
 * Get viewport dimensions from the active tab
 */
async function getTabViewport(): Promise<{ width: number; height: number }> {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabViewport' })
    if (response?.success && response.viewport) {
      return response.viewport
    }
  } catch (error) {
    console.error('Failed to get viewport:', error)
  }
  
  // Fallback to current window (will be wrong for popup, but better than nothing)
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * Capture metadata about the current page and browser
 */
export async function captureMetadata(): Promise<PageMetadata> {
  const tabInfo = await getCurrentTabInfo()
  const browserInfo = parseBrowserInfo()
  const viewport = await getTabViewport()
  
  return {
    url: tabInfo.url,
    title: tabInfo.title,
    browser: browserInfo.browser,
    browserVersion: browserInfo.version,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    devicePixelRatio: window.devicePixelRatio,
  }
}

/**
 * Format metadata as a human-readable string
 */
export function formatMetadataAsText(metadata: PageMetadata): string {
  const lines = [
    `**URL:** ${metadata.url}`,
    `**Page Title:** ${metadata.title}`,
    `**Browser:** ${metadata.browser} ${metadata.browserVersion}`,
    `**Viewport:** ${metadata.viewportWidth} x ${metadata.viewportHeight} @ ${metadata.devicePixelRatio}x`,
  ]
  
  return lines.join('\n')
}

/**
 * Format metadata as HTML for card description
 */
export function formatMetadataAsHtml(metadata: PageMetadata): string {
  return `
<p><strong>URL:</strong> <a href="${escapeHtml(metadata.url)}">${escapeHtml(metadata.url)}</a></p>
<p><strong>Page Title:</strong> ${escapeHtml(metadata.title)}</p>
<p><strong>Browser:</strong> ${escapeHtml(metadata.browser)} ${escapeHtml(metadata.browserVersion)}</p>
<p><strong>Viewport:</strong> ${metadata.viewportWidth} x ${metadata.viewportHeight} @ ${metadata.devicePixelRatio}x</p>
`.trim()
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char)
}

/**
 * Generate a default card title from page info
 */
export function generateDefaultTitle(metadata: PageMetadata): string {
  // Extract domain from URL
  let domain = 'Unknown'
  try {
    const url = new URL(metadata.url)
    domain = url.hostname
  } catch {
    // Ignore URL parse errors
  }
  
  return `Feedback on ${domain}`
}
