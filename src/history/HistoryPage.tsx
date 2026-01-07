import { useState, useEffect } from 'react'

interface HistoryEntry {
  title: string
  cardUrl: string
  timestamp: number
}

export function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const { submissionHistory = [] } = await chrome.storage.local.get('submissionHistory')
    setHistory(submissionHistory)
    setLoading(false)
  }

  const clearHistory = async () => {
    if (confirm('Are you sure you want to clear all history?')) {
      await chrome.storage.local.remove('submissionHistory')
      setHistory([])
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="history-page">
      <header className="history-header">
        <h1>Submission History</h1>
        {history.length > 0 && (
          <button className="clear-btn" onClick={clearHistory}>
            Clear History
          </button>
        )}
      </header>

      <main className="history-content">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <p>No submissions yet.</p>
            <p className="hint">Click the PopShot icon to capture a screenshot and submit feedback.</p>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((entry, index) => (
              <li key={index} className="history-item">
                <a href={entry.cardUrl} target="_blank" rel="noopener noreferrer" className="history-link">
                  <span className="history-title">{entry.title}</span>
                  <span className="history-date">{formatDate(entry.timestamp)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
