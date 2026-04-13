import { useState, useEffect } from 'react'
import { 
  getConfiguredIntegrations,
  type Integration,
  type IntegrationType,
} from '../lib/integrations'
import { getLastUsedIntegration, setLastUsedIntegration } from '../lib/storage'

interface IntegrationSelectorProps {
  value: IntegrationType | null
  onChange: (integration: IntegrationType) => void
  currentUrl?: string
  disabled?: boolean
}

export function IntegrationSelector({ value, onChange, currentUrl, disabled }: IntegrationSelectorProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadIntegrations()
  }, [currentUrl])

  const loadIntegrations = async () => {
    const configured = await getConfiguredIntegrations()
    setIntegrations(configured)
    
    // If no value selected yet, select the URL-specific or default
    if (!value && configured.length > 0) {
      const lastUsedType = await getLastUsedIntegration(currentUrl)
      // Make sure the last used type is actually configured
      if (lastUsedType && configured.some(c => c.type === lastUsedType)) {
        onChange(lastUsedType)
      } else {
        onChange(configured[0].type)
      }
    }
    
    setLoading(false)
  }

  const handleChange = async (type: IntegrationType) => {
    // Save the integration choice for this URL
    await setLastUsedIntegration(type, currentUrl)
    onChange(type)
  }

  if (loading) {
    return <div className="integration-selector loading">Loading...</div>
  }

  if (integrations.length === 0) {
    return (
      <div className="integration-selector empty">
        <p>No integrations configured.</p>
        <a href="#" onClick={() => chrome.runtime.openOptionsPage()}>
          Configure in settings
        </a>
      </div>
    )
  }

  // If only one integration, show it as selected without toggle
  if (integrations.length === 1) {
    return (
      <div className="integration-selector single">
        <div className="integration-badge">
          <IntegrationIcon type={integrations[0].type} />
          <span>{integrations[0].name}</span>
        </div>
      </div>
    )
  }

  // Multiple integrations - show toggle
  return (
    <div className="integration-selector">
      <label>Send to:</label>
      <div className="integration-toggle">
        {integrations.map((integration) => (
          <button
            key={integration.type}
            className={`integration-option ${value === integration.type ? 'active' : ''}`}
            onClick={() => handleChange(integration.type)}
            disabled={disabled}
          >
            <IntegrationIcon type={integration.type} />
            <span>{integration.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function IntegrationIcon({ type }: { type: IntegrationType }) {
  if (type === 'fizzy') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" />
      </svg>
    )
  }
  
  if (type === 'basecamp') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    )
  }
  
  return null
}
