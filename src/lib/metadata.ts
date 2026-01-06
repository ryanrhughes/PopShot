/**
 * Metadata capture utilities for Fizzy Feedback extension
 * Automatically captures page and browser context
 */

export interface PageMetadata {
  url: string
  title: string
  browser: string
  browserVersion: string
  timestamp: string
  viewportWidth: number
  viewportHeight: number
  screenWidth: number
  screenHeight: number
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
 * Capture metadata about the current page and browser
 */
export async function captureMetadata(): Promise<PageMetadata> {
  const tabInfo = await getCurrentTabInfo()
  const browserInfo = parseBrowserInfo()
  
  return {
    url: tabInfo.url,
    title: tabInfo.title,
    browser: browserInfo.browser,
    browserVersion: browserInfo.version,
    timestamp: new Date().toISOString(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
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
    `**Captured:** ${new Date(metadata.timestamp).toLocaleString()}`,
    `**Viewport:** ${metadata.viewportWidth} x ${metadata.viewportHeight}`,
    `**Screen:** ${metadata.screenWidth} x ${metadata.screenHeight} @ ${metadata.devicePixelRatio}x`,
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
<p><strong>Captured:</strong> ${escapeHtml(new Date(metadata.timestamp).toLocaleString())}</p>
<p><strong>Viewport:</strong> ${metadata.viewportWidth} x ${metadata.viewportHeight}</p>
<p><strong>Screen:</strong> ${metadata.screenWidth} x ${metadata.screenHeight} @ ${metadata.devicePixelRatio}x</p>
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
  const date = new Date(metadata.timestamp)
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  
  // Extract domain from URL
  let domain = 'Unknown'
  try {
    const url = new URL(metadata.url)
    domain = url.hostname
  } catch {
    // Ignore URL parse errors
  }
  
  return `Feedback on ${domain} (${timeStr})`
}
