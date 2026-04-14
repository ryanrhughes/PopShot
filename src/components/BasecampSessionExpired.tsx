import { useState } from 'react'

/**
 * Banner used by any UI surface (annotate, popup, options) that hits a
 * Basecamp auth failure. Two visual variants distinguish the recovery path:
 *
 *   - kind="session_expired" (invalid_grant or a 401 from the API): inline
 *     Reconnect button drives the OAuth flow through the service worker.
 *     On success, fires onReconnected() so the caller can retry the
 *     original request and clear its own error state.
 *
 *   - kind="invalid_client": the stored client_id/secret themselves are
 *     rejected. Inline reconnect would loop forever against bad credentials;
 *     steer the user to Settings instead.
 *
 * Single-flight is enforced at the service worker, so simultaneous clicks
 * across multiple surfaces still produce only one OAuth popup.
 */
export interface BasecampSessionExpiredProps {
  kind: 'session_expired' | 'invalid_client'
  /** Called after a successful inline reconnect so the caller can retry. */
  onReconnected: (accountName: string) => void
  /** Optional class hook so each surface can tune spacing. */
  className?: string
}

export function BasecampSessionExpired({
  kind,
  onReconnected,
  className,
}: BasecampSessionExpiredProps) {
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  const handleReconnect = async () => {
    setReconnecting(true)
    setReconnectError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'basecampOAuthReconnect',
      })

      if (response === undefined) {
        throw new Error('Service worker not responding. Try reloading the extension.')
      }

      if (!response.success) {
        throw new Error(response.error || 'Reconnect failed')
      }

      onReconnected(response.accountName || '')
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : 'Reconnect failed')
    } finally {
      setReconnecting(false)
    }
  }

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage()
  }

  const rootClass = `basecamp-session-expired${className ? ` ${className}` : ''}`

  if (kind === 'invalid_client') {
    return (
      <div className={rootClass} role="alert">
        <p className="basecamp-session-expired__message">
          Basecamp credentials need to be reconfigured in Settings.
        </p>
        <div className="basecamp-session-expired__actions">
          <button type="button" className="primary-btn" onClick={handleOpenSettings}>
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass} role="alert">
      <p className="basecamp-session-expired__message">
        Your Basecamp session has expired. Sign in again to continue.
      </p>
      {reconnectError && (
        <p className="basecamp-session-expired__error">{reconnectError}</p>
      )}
      <div className="basecamp-session-expired__actions">
        <button
          type="button"
          className="primary-btn"
          onClick={handleReconnect}
          disabled={reconnecting}
        >
          {reconnecting ? 'Reconnecting...' : 'Reconnect'}
        </button>
        {reconnectError && (
          <button
            type="button"
            className="secondary-btn"
            onClick={handleOpenSettings}
          >
            Open Settings
          </button>
        )}
      </div>
    </div>
  )
}
