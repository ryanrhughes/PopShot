import { useState, useEffect } from 'react'
import { hasApiKey } from '@/lib/storage'
import { captureMetadata, type PageMetadata } from '@/lib/metadata'

type AppState = 'checking' | 'no-api-key' | 'idle' | 'capturing'

export function Popup() {
  const [state, setState] = useState<AppState>('checking')
  const [error, setError] = useState<string | null>(null)

  // Check for API key on mount
  useEffect(() => {
    checkApiKey()
  }, [])

  const checkApiKey = async () => {
    const hasKey = await hasApiKey()
    setState(hasKey ? 'idle' : 'no-api-key')
  }

  const handleCapture = async () => {
    setState('capturing')
    setError(null)
    
    try {
      // Capture screenshot
      const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' })
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to capture screenshot')
      }
      
      // Capture metadata
      const metadata: PageMetadata = await captureMetadata()
      
      // Store in session storage for the annotation page
      await chrome.storage.session.set({
        annotationSession: {
          imageDataUrl: response.dataUrl,
          metadata,
        }
      })
      
      // Open annotation page in new tab
      const annotateUrl = chrome.runtime.getURL('src/annotate/index.html')
      await chrome.tabs.create({ url: annotateUrl })
      
      // Close the popup
      window.close()
    } catch (err) {
      console.error('Capture error:', err)
      setError(err instanceof Error ? err.message : 'Failed to capture screenshot')
      setState('idle')
    }
  }

  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <h1>Fizzy Feedback</h1>
        <button className="settings-btn" onClick={openOptions} title="Settings">
          <SettingsIcon />
        </button>
      </header>

      <main className="popup-content">
        {state === 'checking' && (
          <div className="loading-section">
            <div className="spinner" />
            <p>Loading...</p>
          </div>
        )}

        {state === 'no-api-key' && (
          <div className="setup-section">
            <p>Welcome to Fizzy Feedback!</p>
            <p className="hint">Please configure your Fizzy API key to get started.</p>
            <button className="primary-btn" onClick={openOptions}>
              Set Up API Key
            </button>
          </div>
        )}

        {state === 'idle' && (
          <div className="capture-section">
            <p className="description">
              Capture a screenshot and send feedback to Fizzy.
            </p>
            {error && (
              <div className="error-banner">
                {error}
              </div>
            )}
            <button className="capture-btn" onClick={handleCapture}>
              <CameraIcon />
              Capture Screenshot
            </button>
            <p className="hint">
              A new tab will open for annotation.
            </p>
          </div>
        )}

        {state === 'capturing' && (
          <div className="loading-section">
            <div className="spinner" />
            <p>Capturing screenshot...</p>
          </div>
        )}
      </main>

      <footer className="popup-footer">
        <span className="version">v0.1.0</span>
      </footer>
    </div>
  )
}

// Icon components
function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}


