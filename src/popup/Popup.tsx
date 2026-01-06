import { useState, useEffect } from 'react'
import { AnnotationCanvas } from './components/AnnotationCanvas'
import { BoardSelector } from './components/BoardSelector'
import { hasApiKey, getApiKey } from '@/lib/storage'
import { captureMetadata, formatMetadataAsHtml, generateDefaultTitle, type PageMetadata } from '@/lib/metadata'
import { uploadImageAndCreateCard } from '@/lib/fizzy-api'

type AppState = 'checking' | 'no-api-key' | 'idle' | 'capturing' | 'annotating' | 'submitting' | 'success' | 'error'

export function Popup() {
  const [state, setState] = useState<AppState>('checking')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<PageMetadata | null>(null)
  const [selectedBoard, setSelectedBoard] = useState<{ slug: string; id: string; name: string } | null>(null)
  const [cardTitle, setCardTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cardUrl, setCardUrl] = useState<string | null>(null)
  const [currentTabUrl, setCurrentTabUrl] = useState<string | undefined>()

  // Check for API key on mount
  useEffect(() => {
    checkApiKey()
    loadCurrentTabUrl()
  }, [])

  const checkApiKey = async () => {
    const hasKey = await hasApiKey()
    setState(hasKey ? 'idle' : 'no-api-key')
  }

  const loadCurrentTabUrl = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getCurrentTab' })
      if (response?.success && response.tab?.url) {
        setCurrentTabUrl(response.tab.url)
      }
    } catch (err) {
      console.error('Failed to get current tab:', err)
    }
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
      
      setCapturedImage(response.dataUrl)
      
      // Capture metadata
      const meta = await captureMetadata()
      setMetadata(meta)
      setCardTitle(generateDefaultTitle(meta))
      
      setState('annotating')
    } catch (err) {
      console.error('Capture error:', err)
      setError(err instanceof Error ? err.message : 'Failed to capture screenshot')
      setState('error')
    }
  }

  const handleAnnotationComplete = (dataUrl: string) => {
    setAnnotatedImage(dataUrl)
  }

  const handleBoardSelect = (slug: string, id: string, name: string) => {
    setSelectedBoard({ slug, id, name })
  }

  const handleSubmit = async () => {
    if (!annotatedImage || !selectedBoard || !metadata) {
      setError('Missing required data for submission')
      return
    }

    setState('submitting')
    setError(null)

    try {
      const apiKey = await getApiKey()
      if (!apiKey) {
        throw new Error('No API key found')
      }

      const metadataHtml = formatMetadataAsHtml(metadata)
      
      const result = await uploadImageAndCreateCard(
        apiKey,
        selectedBoard.slug,
        selectedBoard.id,
        annotatedImage,
        cardTitle || generateDefaultTitle(metadata),
        metadataHtml
      )

      setCardUrl(result.cardUrl)
      setState('success')
    } catch (err) {
      console.error('Submit error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create card')
      setState('error')
    }
  }

  const handleReset = () => {
    setCapturedImage(null)
    setAnnotatedImage(null)
    setMetadata(null)
    setCardTitle('')
    setError(null)
    setCardUrl(null)
    setState('idle')
  }

  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  // Render based on state
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
            <button className="capture-btn" onClick={handleCapture}>
              <CameraIcon />
              Capture Screenshot
            </button>
          </div>
        )}

        {state === 'capturing' && (
          <div className="loading-section">
            <div className="spinner" />
            <p>Capturing screenshot...</p>
          </div>
        )}

        {state === 'annotating' && capturedImage && (
          <div className="annotating-section">
            <AnnotationCanvas
              imageDataUrl={capturedImage}
              onExport={handleAnnotationComplete}
              width={580}
              height={360}
            />
            
            {annotatedImage && (
              <div className="submit-section">
                <div className="form-group">
                  <label htmlFor="card-title">Card Title:</label>
                  <input
                    type="text"
                    id="card-title"
                    value={cardTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                    placeholder="Enter a title for this feedback"
                  />
                </div>
                
                <BoardSelector
                  currentUrl={currentTabUrl}
                  onSelect={handleBoardSelect}
                />
                
                <div className="button-row">
                  <button className="secondary-btn" onClick={handleReset}>
                    Cancel
                  </button>
                  <button 
                    className="primary-btn" 
                    onClick={handleSubmit}
                    disabled={!selectedBoard}
                  >
                    Submit to Fizzy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {state === 'submitting' && (
          <div className="loading-section">
            <div className="spinner" />
            <p>Creating card in Fizzy...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="success-section">
            <div className="success-icon">
              <CheckIcon />
            </div>
            <h2>Feedback Submitted!</h2>
            <p>Your card has been created in Fizzy.</p>
            {cardUrl && (
              <a 
                href={cardUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="view-card-link"
              >
                View Card in Fizzy
              </a>
            )}
            <button className="primary-btn" onClick={handleReset}>
              Capture Another
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="error-section">
            <div className="error-icon">
              <ErrorIcon />
            </div>
            <h2>Something went wrong</h2>
            <p className="error-message">{error}</p>
            <div className="button-row">
              <button className="secondary-btn" onClick={handleReset}>
                Start Over
              </button>
              {capturedImage && (
                <button className="primary-btn" onClick={() => setState('annotating')}>
                  Try Again
                </button>
              )}
            </div>
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

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}
