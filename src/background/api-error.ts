/**
 * Parse an API error response body into a clean, user-facing message.
 *
 * Strips HTML tags so upstream error bodies (e.g. Basecamp's
 * "OAuth token expired" response, which embeds an <a href="..."> link)
 * don't leak into the UI as escaped text.
 */
export function parseApiErrorMessage(
  status: number,
  statusText: string,
  rawBody: string
): string {
  let message = `API error: ${status} ${statusText}`

  try {
    const data = JSON.parse(rawBody)
    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data as Record<string, unknown>)
      // Common Basecamp shape: { error: "message" } - use the string directly.
      if (entries.length === 1 && entries[0][0] === 'error' && typeof entries[0][1] === 'string') {
        message = entries[0][1]
      } else if (entries.length > 0) {
        message = entries
          .map(([key, value]) =>
            typeof value === 'string' ? `${key}: ${value}` : `${key}: ${JSON.stringify(value)}`
          )
          .join(', ')
      }
    }
  } catch {
    if (rawBody) {
      message = rawBody.substring(0, 500)
    }
  }

  return stripHtml(message)
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}
