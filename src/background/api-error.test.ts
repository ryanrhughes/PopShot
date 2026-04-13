import { describe, it, expect } from 'vitest'
import { parseApiErrorMessage } from './api-error'

describe('parseApiErrorMessage', () => {
  describe('Basecamp { error: "..." } shape', () => {
    it('uses the string value directly without JSON-stringify quotes', () => {
      const body = JSON.stringify({ error: 'Something went wrong' })

      const result = parseApiErrorMessage(400, 'Bad Request', body)

      expect(result).toBe('Something went wrong')
    })

    it('strips embedded <a href="..."> links from OAuth expiry message', () => {
      // This is the literal response body Basecamp returns for expired tokens.
      const body = JSON.stringify({
        error:
          'OAuth token expired (old age). Refresh your token or acquire a new one at ' +
          '<a href="https://launchpad.37signals.com/authorization/new">' +
          'https://launchpad.37signals.com/authorization/new</a>',
      })

      const result = parseApiErrorMessage(401, 'Unauthorized', body)

      expect(result).not.toContain('<a')
      expect(result).not.toContain('</a>')
      expect(result).not.toContain('href=')
      expect(result).toContain('OAuth token expired (old age)')
    })
  })

  describe('multi-field JSON objects', () => {
    it('formats multiple string fields as "key: value" pairs without quoting strings', () => {
      const body = JSON.stringify({ error: 'Invalid', code: 'E123' })

      const result = parseApiErrorMessage(400, 'Bad Request', body)

      expect(result).toBe('error: Invalid, code: E123')
    })

    it('JSON-stringifies non-string values', () => {
      const body = JSON.stringify({ error: 'bad', details: { field: 'title' } })

      const result = parseApiErrorMessage(422, 'Unprocessable', body)

      expect(result).toContain('error: bad')
      expect(result).toContain('details: {"field":"title"}')
    })
  })

  describe('non-JSON response bodies', () => {
    it('strips HTML tags from a raw HTML error page', () => {
      const body =
        '<html><body><h1>500 Internal Server Error</h1>' +
        '<p>The server encountered an error.</p></body></html>'

      const result = parseApiErrorMessage(500, 'Server Error', body)

      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).toContain('500 Internal Server Error')
      expect(result).toContain('The server encountered an error.')
    })

    it('collapses runs of whitespace', () => {
      const body = 'line one\n\n\nline    two\t\tline three'

      const result = parseApiErrorMessage(500, 'Server Error', body)

      expect(result).toBe('line one line two line three')
    })
  })

  describe('fallback to status + statusText', () => {
    it('uses the status line when the body is empty', () => {
      const result = parseApiErrorMessage(503, 'Service Unavailable', '')

      expect(result).toBe('API error: 503 Service Unavailable')
    })

    it('uses the status line when JSON parses to null', () => {
      const result = parseApiErrorMessage(500, 'Server Error', 'null')

      expect(result).toBe('API error: 500 Server Error')
    })

    it('uses the status line when JSON parses to an empty object', () => {
      const result = parseApiErrorMessage(500, 'Server Error', '{}')

      expect(result).toBe('API error: 500 Server Error')
    })
  })
})
