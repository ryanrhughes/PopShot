import { useState, useEffect } from 'react'
import { 
  getIntegrationCredentials, 
  setFizzyCredentials, 
  clearFizzyCredentials,
  setBasecampCredentials,
  clearBasecampCredentials,
  type IntegrationCredentials,
} from '../lib/storage'

export function Options() {
  const [credentials, setCredentials] = useState<IntegrationCredentials>({})
  const [loading, setLoading] = useState(true)

  // Load credentials on mount
  useEffect(() => {
    loadCredentials()
  }, [])

  const loadCredentials = async () => {
    const creds = await getIntegrationCredentials()
    setCredentials(creds)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="options">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="options">
      <header className="options-header">
        <h1>PopShot Settings</h1>
        <p className="subtitle">Configure your integrations</p>
      </header>

      <main className="options-content">
        <FizzySettings 
          credentials={credentials.fizzy} 
          onUpdate={loadCredentials} 
        />

        <BasecampSettings 
          credentials={credentials.basecamp} 
          onUpdate={loadCredentials} 
        />

        <section className="section">
          <h2>URL Default Boards</h2>
          <p className="help-text">
            Configure default destinations for specific URLs. When you capture a screenshot from a matching URL, 
            the destination will be pre-selected automatically.
          </p>
          <p className="coming-soon">Coming soon in a future update.</p>
        </section>
      </main>

      <footer className="options-footer">
        <p>PopShot v0.2.3</p>
      </footer>
    </div>
  )
}

// ============ Fizzy Settings ============

interface FizzySettingsProps {
  credentials?: { apiKey: string }
  onUpdate: () => void
}

function FizzySettings({ credentials, onUpdate }: FizzySettingsProps) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const hasStoredKey = !!credentials?.apiKey

  const handleSave = async () => {
    if (!apiKey) {
      setMessage({ type: 'error', text: 'Please enter an API key' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      await setFizzyCredentials({ apiKey })
      // Also store in legacy location for backwards compatibility
      await chrome.storage.local.set({ apiKey })
      setMessage({ type: 'success', text: 'API key saved successfully!' })
      setApiKey('')
      onUpdate()
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save API key' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    const creds = await getIntegrationCredentials()
    const storedKey = creds.fizzy?.apiKey

    if (!storedKey) {
      setMessage({ type: 'error', text: 'Please save an API key first' })
      return
    }

    setTesting(true)
    setMessage(null)

    try {
      const response = await fetch('https://app.fizzy.do/my/identity', {
        headers: {
          'Authorization': `Bearer ${storedKey}`,
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        const accountCount = data.accounts?.length || 0
        setMessage({ 
          type: 'success', 
          text: `Connected! Found ${accountCount} account${accountCount === 1 ? '' : 's'}.` 
        })
      } else if (response.status === 401) {
        setMessage({ type: 'error', text: 'Invalid API key. Please check and try again.' })
      } else {
        setMessage({ type: 'error', text: `API error: ${response.status} ${response.statusText}` })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to connect to Fizzy. Check your internet connection.' })
    } finally {
      setTesting(false)
    }
  }

  const handleClear = async () => {
    await clearFizzyCredentials()
    await chrome.storage.local.remove(['apiKey'])
    setApiKey('')
    setMessage({ type: 'success', text: 'Fizzy disconnected' })
    onUpdate()
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2><FizzyIcon /> Fizzy</h2>
        {hasStoredKey && <span className="connected-badge">Connected</span>}
      </div>
      
      <p className="help-text">
        Connect to Fizzy to send bug reports. You'll need a Personal Access Token with Read + Write permissions.
      </p>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {!hasStoredKey && (
        <div className="api-key-instructions">
          <h3>How to get your API key:</h3>
          <ol>
            <li>Go to <a href="https://app.fizzy.do" target="_blank" rel="noopener noreferrer">app.fizzy.do</a> and sign in</li>
            <li>Navigate to <strong>My Profile</strong></li>
            <li>Under <strong>Developer</strong>, click <strong>Personal access tokens</strong></li>
            <li>Click <strong>Generate new access token</strong></li>
            <li>Select <strong>Read + Write</strong> permission</li>
            <li>Copy the token and paste it below</li>
          </ol>
        </div>
      )}

      {hasStoredKey ? (
        <div className="connected-info">
          <p>Your Fizzy account is connected and ready to use.</p>
          <div className="button-group">
            <button 
              className="secondary-btn" 
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button 
              className="danger-btn" 
              onClick={handleClear}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="fizzy-api-key">Personal Access Token</label>
            <input
              type="password"
              id="fizzy-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Fizzy API key"
              disabled={saving}
            />
          </div>

          <div className="button-group">
            <button 
              className="primary-btn" 
              onClick={handleSave}
              disabled={saving || !apiKey}
            >
              {saving ? 'Saving...' : 'Connect Fizzy'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ============ Basecamp Settings ============

interface BasecampSettingsProps {
  credentials?: {
    clientId?: string
    clientSecret?: string
    redirectUri?: string
    accessToken?: string
    accountName?: string
    expiresAt?: string
  }
  onUpdate: () => void
}

function BasecampSettings({ credentials, onUpdate }: BasecampSettingsProps) {
  const [clientId, setClientId] = useState(credentials?.clientId || '')
  const [clientSecret, setClientSecret] = useState(credentials?.clientSecret || '')
  const [redirectUri, setRedirectUri] = useState(credentials?.redirectUri || '')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [testing, setTesting] = useState(false)
  // Set true only when the user runs Test Connection and it fails, so the
  // Reconnect shortcut is hidden in the happy path and only appears when the
  // user has a reason to recover without disconnecting + reconnecting.
  const [testFailed, setTestFailed] = useState(false)

  const isConnected = !!(credentials?.accessToken)
  const isExpired = credentials?.expiresAt && new Date(credentials.expiresAt) <= new Date()
  const showReconnect = isConnected && (isExpired || testFailed)

  // Update local state when credentials change
  useEffect(() => {
    setClientId(credentials?.clientId || '')
    setClientSecret(credentials?.clientSecret || '')
    setRedirectUri(credentials?.redirectUri || '')
  }, [credentials?.clientId, credentials?.clientSecret, credentials?.redirectUri])

  // Start OAuth flow
  const handleConnect = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !redirectUri.trim()) {
      setMessage({ type: 'error', text: 'Please enter Client ID, Client Secret, and Redirect URI' })
      return
    }

    // Save credentials first
    try {
      await setBasecampCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        redirectUri: redirectUri.trim(),
      })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save credentials' })
      return
    }

    setConnecting(true)
    setMessage(null)

    try {
      // Send message to service worker to launch OAuth flow
      // (chrome.identity is only available in service worker context)
      console.log('[Options] Sending basecampOAuthStart message...')
      const response = await chrome.runtime.sendMessage({
        action: 'basecampOAuthStart',
        clientId: clientId.trim(),
        redirectUri: redirectUri.trim(),
      })
      console.log('[Options] Got response:', response)

      if (response?.success) {
        setMessage({ type: 'success', text: `Connected to Basecamp as ${response.accountName}!` })
        setTestFailed(false)
        onUpdate()
      } else {
        throw new Error(response?.error || 'Failed to connect to Basecamp')
      }
    } catch (err) {
      console.error('[Options] Error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to Basecamp'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setConnecting(false)
    }
  }

  const handleTest = async () => {
    if (!credentials?.accessToken) {
      setMessage({ type: 'error', text: 'Not connected to Basecamp' })
      return
    }

    setTesting(true)
    setMessage(null)

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'basecampTestConnection',
        accessToken: credentials.accessToken,
      })

      if (response === undefined) {
        throw new Error('Service worker not responding. Try reloading the extension.')
      }

      if (response?.success) {
        const projectCount = response.projectCount ?? 0
        setMessage({
          type: 'success',
          text: `Connected! Found ${projectCount} project${projectCount === 1 ? '' : 's'}.`
        })
        setTestFailed(false)
      } else {
        throw new Error(response?.error || 'Failed to test connection')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Basecamp'
      setMessage({ type: 'error', text: errorMessage })
      setTestFailed(true)
    } finally {
      setTesting(false)
    }
  }

  const handleDisconnect = async () => {
    await clearBasecampCredentials()
    setClientId('')
    setClientSecret('')
    setRedirectUri('')
    setMessage({ type: 'success', text: 'Basecamp disconnected' })
    onUpdate()
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2><BasecampIcon /> Basecamp</h2>
        {isConnected && !isExpired && <span className="connected-badge">Connected</span>}
        {isConnected && isExpired && <span className="expired-badge">Expired</span>}
      </div>
      
      <p className="help-text">
        Connect to Basecamp to create to-dos with screenshots directly in your projects.
      </p>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {connecting && (
        <div className="connecting-state">
          <div className="spinner-small" />
          <span>Connecting to Basecamp...</span>
        </div>
      )}

      {isConnected && !connecting ? (
        <div className="connected-info">
          <p>Connected to <strong>{credentials?.accountName || 'Basecamp'}</strong></p>
          {isExpired && (
            <p className="warning-text">Your session has expired. Please reconnect.</p>
          )}

          <div className="button-group">
            {!isExpired && (
              <button
                className="secondary-btn"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}
            {showReconnect && (
              <button
                className={isExpired ? 'primary-btn' : 'secondary-btn'}
                onClick={handleConnect}
                disabled={connecting}
              >
                Reconnect
              </button>
            )}
            <button
              className="danger-btn"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : !connecting && (
        <>
          <div className="form-group">
            <label htmlFor="basecamp-client-id">Client ID</label>
            <input
              id="basecamp-client-id"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Enter your Basecamp Client ID"
              disabled={connecting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="basecamp-client-secret">Client Secret</label>
            <input
              id="basecamp-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Enter your Basecamp Client Secret"
              disabled={connecting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="basecamp-redirect-uri">Redirect URI</label>
            <input
              id="basecamp-redirect-uri"
              type="text"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="Enter your Redirect URI"
              disabled={connecting}
            />
          </div>

          <p className="field-hint">
            Get these values from your{' '}
            <a href="https://launchpad.37signals.com/integrations" target="_blank" rel="noopener noreferrer">
              Basecamp integration settings
            </a>
          </p>

          <div className="button-group">
            <button 
              className="primary-btn basecamp-btn" 
              onClick={handleConnect}
              disabled={!clientId.trim() || !clientSecret.trim() || !redirectUri.trim() || connecting}
            >
              Connect to Basecamp
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ============ Icons ============

function FizzyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function BasecampIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  )
}
