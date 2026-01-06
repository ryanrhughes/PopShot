import { useState, useEffect } from 'react'

export function Options() {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasStoredKey, setHasStoredKey] = useState(false)

  // Load stored API key on mount
  useEffect(() => {
    chrome.storage.local.get(['apiKey'], (result) => {
      if (result.apiKey) {
        setApiKey('••••••••••••••••') // Show masked value
        setHasStoredKey(true)
      }
    })
  }, [])

  const handleSave = async () => {
    if (!apiKey || apiKey === '••••••••••••••••') {
      setMessage({ type: 'error', text: 'Please enter an API key' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      // Store the API key
      await chrome.storage.local.set({ apiKey })
      setMessage({ type: 'success', text: 'API key saved successfully!' })
      setHasStoredKey(true)
      setApiKey('••••••••••••••••')
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save API key' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    // Get the actual stored key for testing
    const result = await chrome.storage.local.get(['apiKey'])
    const storedKey = result.apiKey

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
          text: `API key is valid! Found ${accountCount} account${accountCount === 1 ? '' : 's'}.` 
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
    await chrome.storage.local.remove(['apiKey'])
    setApiKey('')
    setHasStoredKey(false)
    setMessage({ type: 'success', text: 'API key cleared' })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // If user starts typing after seeing masked value, clear it
    if (hasStoredKey && apiKey === '••••••••••••••••') {
      setApiKey(value.replace('••••••••••••••••', ''))
      setHasStoredKey(false)
    } else {
      setApiKey(value)
    }
  }

  return (
    <div className="options">
      <header className="options-header">
        <h1>Fizzy Feedback Settings</h1>
        <p className="subtitle">Configure your Fizzy API connection</p>
      </header>

      <main className="options-content">
        <section className="section">
          <h2>API Key</h2>
          <p className="help-text">
            To use this extension, you need a Fizzy Personal Access Token with Read + Write permissions.
          </p>

          <div className="api-key-instructions">
            <h3>How to get your API key:</h3>
            <ol>
              <li>Go to <a href="https://app.fizzy.do" target="_blank" rel="noopener noreferrer">app.fizzy.do</a> and sign in</li>
              <li>Click your profile picture in the top-right corner</li>
              <li>Go to the <strong>API</strong> section</li>
              <li>Click <strong>Personal access tokens</strong></li>
              <li>Click <strong>Generate new access token</strong></li>
              <li>Give it a description (e.g., "Chrome Extension")</li>
              <li>Select <strong>Read + Write</strong> permission</li>
              <li>Copy the token and paste it below</li>
            </ol>
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">Personal Access Token</label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={handleInputChange}
              placeholder="Enter your Fizzy API key"
              disabled={saving || testing}
            />
          </div>

          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="button-group">
            <button 
              className="primary-btn" 
              onClick={handleSave}
              disabled={saving || testing || !apiKey || apiKey === '••••••••••••••••'}
            >
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
            <button 
              className="secondary-btn" 
              onClick={handleTest}
              disabled={saving || testing || !hasStoredKey}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {hasStoredKey && (
              <button 
                className="danger-btn" 
                onClick={handleClear}
                disabled={saving || testing}
              >
                Clear API Key
              </button>
            )}
          </div>
        </section>

        <section className="section">
          <h2>URL Default Boards</h2>
          <p className="help-text">
            Configure default boards for specific URLs. When you capture a screenshot from a matching URL, 
            the board will be pre-selected automatically.
          </p>
          <p className="coming-soon">Coming soon in a future update.</p>
        </section>
      </main>

      <footer className="options-footer">
        <p>Fizzy Feedback Extension v0.1.0</p>
      </footer>
    </div>
  )
}
