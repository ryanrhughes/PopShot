import { useState, useEffect } from 'react'
import {
  getIntegration,
  IntegrationError,
  basecampIntegration,
  type IntegrationType,
  type Destination,
  type SubDestination,
  type BasecampDestinationType,
} from '../lib/integrations'
import { BasecampSessionExpired } from '../components/BasecampSessionExpired'
import {
  getIntegrationCredentials,
  getLastUsedDestination,
  setLastUsedDestination,
  setBasecampCredentials,
} from '../lib/storage'

interface DestinationSelectorProps {
  integrationType: IntegrationType | null
  onSelect: (destination: Destination, subDestination?: SubDestination) => void
  disabled?: boolean
  /** Reserved for future use - auto-select destination based on URL */
  currentUrl?: string
}

interface SelectedDestination {
  destination: Destination
  subDestination?: SubDestination
}

export function DestinationSelector({ 
  integrationType, 
  onSelect, 
  disabled,
  currentUrl,
}: DestinationSelectorProps) {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [subDestinations, setSubDestinations] = useState<SubDestination[]>([])
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null)
  const [selectedSubDestination, setSelectedSubDestination] = useState<SubDestination | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSub, setLoadingSub] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  // When loadDestinations fails with a Basecamp auth error, this is the code.
  // Rendered as an inline reconnect banner in place of the plain error UI.
  const [basecampAuthError, setBasecampAuthError] = useState<
    'session_expired' | 'invalid_client' | null
  >(null)
  const [requiresSubDestination, setRequiresSubDestination] = useState(false)
  const [basecampDestinationType, setBasecampDestinationType] = useState<BasecampDestinationType>('todo')
  
  // For Basecamp: track which destination types are available for the selected project
  const [hasTodoLists, setHasTodoLists] = useState(false)
  const [hasCardColumns, setHasCardColumns] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  // Load destinations when integration changes
  useEffect(() => {
    if (integrationType) {
      loadDestinations()
    } else {
      setDestinations([])
      setSelectedDestination(null)
    }
  }, [integrationType])

  // Load sub-destinations when destination changes (or check availability for Basecamp)
  useEffect(() => {
    if (selectedDestination && requiresSubDestination) {
      if (integrationType === 'basecamp') {
        // For Basecamp, check which types are available first
        checkBasecampAvailability(selectedDestination.id)
      } else {
        loadSubDestinations(selectedDestination.id)
      }
    } else {
      setSubDestinations([])
      setSelectedSubDestination(null)
    }
  }, [selectedDestination, requiresSubDestination])

  // Notify parent when selection changes
  useEffect(() => {
    if (selectedDestination) {
      if (requiresSubDestination && selectedSubDestination) {
        onSelect(selectedDestination, selectedSubDestination)
      } else if (!requiresSubDestination) {
        onSelect(selectedDestination)
      }
    }
  }, [selectedDestination, selectedSubDestination, requiresSubDestination])

  const loadDestinations = async () => {
    if (!integrationType) return
    
    setLoading(true)
    setError(null)
    setErrorStatus(null)
    setBasecampAuthError(null)
    setDestinations([])
    setSelectedDestination(null)
    setSubDestinations([])
    setSelectedSubDestination(null)

    try {
      const integration = getIntegration(integrationType)
      if (!integration) {
        throw new Error('Integration not found')
      }

      // Get Basecamp destination type if applicable
      if (integrationType === 'basecamp') {
        const creds = await getIntegrationCredentials()
        setBasecampDestinationType(creds.basecamp?.destinationType || 'todo')
      }

      setRequiresSubDestination(integration.requiresSubDestination())
      const dests = await integration.getDestinations()
      setDestinations(dests)

      // Try to restore last used destination for this URL
      const lastUsed = await getLastUsedDestination(integrationType, currentUrl)
      if (lastUsed) {
        const lastDest = dests.find(d => d.id === lastUsed.destinationId)
        if (lastDest) {
          setSelectedDestination(lastDest)
          return // loadSubDestinations will be triggered by useEffect
        }
      }

      // Auto-select first destination if only one
      if (dests.length === 1) {
        setSelectedDestination(dests[0])
      }
    } catch (err) {
      if (
        err instanceof IntegrationError &&
        err.integration === 'basecamp' &&
        (err.code === 'session_expired' || err.code === 'invalid_client')
      ) {
        setBasecampAuthError(err.code)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load destinations')
        setErrorStatus(err instanceof IntegrationError ? err.status ?? null : null)
      }
    } finally {
      setLoading(false)
    }
  }

  // Check which destination types are available for a Basecamp project.
  // Routes through BasecampIntegration so an expired/revoked token triggers
  // the proactive refresh and, if that fails, surfaces as an IntegrationError
  // the UI can render as a reconnect banner - rather than the old behavior
  // of swallowing every failure as "no destinations available".
  const checkBasecampAvailability = async (projectId: string) => {
    setCheckingAvailability(true)
    setHasTodoLists(false)
    setHasCardColumns(false)
    setSubDestinations([])
    setSelectedSubDestination(null)
    setError(null)
    setErrorStatus(null)

    try {
      const { hasTodoLists: hasTodos, hasCardColumns: hasCards } =
        await basecampIntegration.getProjectAvailability(projectId)

      setHasTodoLists(hasTodos)
      setHasCardColumns(hasCards)

      // Determine which type to use
      let effectiveType = basecampDestinationType

      // If current type is not available, switch to the other
      const creds = await getIntegrationCredentials()
      if (effectiveType === 'todo' && !hasTodos && hasCards && creds.basecamp) {
        effectiveType = 'card'
        setBasecampDestinationType('card')
        await setBasecampCredentials({ ...creds.basecamp, destinationType: 'card' })
      } else if (effectiveType === 'card' && !hasCards && hasTodos && creds.basecamp) {
        effectiveType = 'todo'
        setBasecampDestinationType('todo')
        await setBasecampCredentials({ ...creds.basecamp, destinationType: 'todo' })
      }

      // Now load the appropriate sub-destinations
      if ((effectiveType === 'todo' && hasTodos) || (effectiveType === 'card' && hasCards)) {
        loadSubDestinations(projectId)
      }
    } catch (err) {
      if (
        err instanceof IntegrationError &&
        err.integration === 'basecamp' &&
        (err.code === 'session_expired' || err.code === 'invalid_client')
      ) {
        setBasecampAuthError(err.code)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to check project destinations')
        setErrorStatus(err instanceof IntegrationError ? err.status ?? null : null)
      }
    } finally {
      setCheckingAvailability(false)
    }
  }

  const loadSubDestinations = async (destinationId: string) => {
    if (!integrationType) return

    setLoadingSub(true)
    setSubDestinations([])
    setSelectedSubDestination(null)

    try {
      const integration = getIntegration(integrationType)
      if (!integration) return

      const subs = await integration.getSubDestinations(destinationId)
      setSubDestinations(subs)

      // Try to restore last used sub-destination for this URL
      const lastUsed = await getLastUsedDestination(integrationType, currentUrl)
      if (lastUsed?.subDestinationId) {
        const lastSub = subs.find(s => s.id === lastUsed.subDestinationId)
        if (lastSub) {
          setSelectedSubDestination(lastSub)
          return
        }
      }

      // Auto-select first if only one
      if (subs.length === 1) {
        setSelectedSubDestination(subs[0])
      }
    } catch (err) {
      // Auth failures here (e.g. refresh token revoked between the initial
      // project load and the sub-destination load) must surface as the
      // reconnect banner, otherwise the required sub-destination select
      // stays empty and the user can't submit without any explanation.
      if (
        err instanceof IntegrationError &&
        err.integration === 'basecamp' &&
        (err.code === 'session_expired' || err.code === 'invalid_client')
      ) {
        setBasecampAuthError(err.code)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load sub-destinations')
        setErrorStatus(err instanceof IntegrationError ? err.status ?? null : null)
      }
    } finally {
      setLoadingSub(false)
    }
  }

  const handleDestinationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dest = destinations.find(d => d.id === e.target.value)
    setSelectedDestination(dest || null)
    
    // Save as last used for this URL (without sub-destination for now)
    if (dest && integrationType) {
      setLastUsedDestination(integrationType, dest.id, dest.accountId, undefined, currentUrl)
    }
  }

  const handleSubDestinationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sub = subDestinations.find(s => s.id === e.target.value)
    setSelectedSubDestination(sub || null)
    
    // Save as last used for this URL (with sub-destination)
    if (sub && selectedDestination && integrationType) {
      setLastUsedDestination(
        integrationType, 
        selectedDestination.id, 
        selectedDestination.accountId, 
        sub.id,
        currentUrl
      )
    }
  }

  const handleDestinationTypeChange = async (newType: BasecampDestinationType) => {
    // Save the preference
    const creds = await getIntegrationCredentials()
    if (creds.basecamp) {
      await setBasecampCredentials({
        ...creds.basecamp,
        destinationType: newType,
      })
    }
    
    setBasecampDestinationType(newType)
    
    // Clear sub-destination and reload when type changes
    setSubDestinations([])
    setSelectedSubDestination(null)
    
    // Reload sub-destinations with new type
    if (selectedDestination) {
      loadSubDestinations(selectedDestination.id)
    }
  }

  if (!integrationType) {
    return <div className="destination-selector empty">Select an integration first</div>
  }

  if (loading) {
    return (
      <div className="destination-selector loading">
        <div className="spinner-small" />
        <span>Loading {integrationType === 'fizzy' ? 'boards' : 'projects'}...</span>
      </div>
    )
  }

  if (basecampAuthError) {
    return (
      <div className="destination-selector">
        <BasecampSessionExpired
          kind={basecampAuthError}
          onReconnected={() => {
            // Successful reconnect: reload destinations with the fresh token.
            setBasecampAuthError(null)
            loadDestinations()
          }}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="destination-selector error">
        <span>{error}</span>
        <div className="error-actions">
          {errorStatus === 401 && (
            <button onClick={() => chrome.runtime.openOptionsPage()}>
              Open Settings
            </button>
          )}
          <button onClick={loadDestinations}>Retry</button>
        </div>
      </div>
    )
  }

  const destinationLabel = integrationType === 'fizzy' ? 'Board' : 'Project'
  const subDestinationLabel = integrationType === 'basecamp' 
    ? (basecampDestinationType === 'card' ? 'Column' : 'To-do List')
    : 'Sub-destination'

  // Group destinations by account
  const groupedDestinations = destinations.reduce((acc, dest) => {
    const key = dest.accountName || 'Default'
    if (!acc[key]) acc[key] = []
    acc[key].push(dest)
    return acc
  }, {} as Record<string, Destination[]>)

  const hasMultipleAccounts = Object.keys(groupedDestinations).length > 1

  return (
    <div className="destination-selector">
      <div className="form-group">
        <label>{destinationLabel} *</label>
        <select
          value={selectedDestination?.id || ''}
          onChange={handleDestinationChange}
          disabled={disabled || destinations.length === 0}
        >
          <option value="">Select {destinationLabel.toLowerCase()}...</option>
          {hasMultipleAccounts ? (
            Object.entries(groupedDestinations).map(([accountName, dests]) => (
              <optgroup key={accountName} label={accountName}>
                {dests.map((dest) => (
                  <option key={dest.id} value={dest.id}>
                    {dest.name}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            destinations.map((dest) => (
              <option key={dest.id} value={dest.id}>
                {dest.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Basecamp: show loading state while checking availability */}
      {integrationType === 'basecamp' && selectedDestination && checkingAvailability && (
        <div className="form-group">
          <div className="loading-inline">
            <div className="spinner-small" />
            <span>Checking available options...</span>
          </div>
        </div>
      )}

      {/* Basecamp: show warning if neither To-dos nor Cards are available */}
      {integrationType === 'basecamp' && selectedDestination && !checkingAvailability && !hasTodoLists && !hasCardColumns && (
        <div className="form-group">
          <div className="warning-message">
            <strong>No destinations available</strong>
            <p>This project has no To-do Lists or Card Table columns. Please enable the To-do or Card Table tool in Basecamp for this project.</p>
          </div>
        </div>
      )}

      {/* Basecamp destination type selector - only show if both types are available */}
      {integrationType === 'basecamp' && selectedDestination && !checkingAvailability && hasTodoLists && hasCardColumns && (
        <div className="form-group destination-type-toggle">
          <label>Create as</label>
          <div className="toggle-buttons">
            <button
              type="button"
              className={`toggle-btn ${basecampDestinationType === 'todo' ? 'active' : ''}`}
              onClick={() => handleDestinationTypeChange('todo')}
              disabled={disabled}
            >
              To-do
            </button>
            <button
              type="button"
              className={`toggle-btn ${basecampDestinationType === 'card' ? 'active' : ''}`}
              onClick={() => handleDestinationTypeChange('card')}
              disabled={disabled}
            >
              Card
            </button>
          </div>
        </div>
      )}

      {requiresSubDestination && selectedDestination && !checkingAvailability && (hasTodoLists || hasCardColumns || integrationType !== 'basecamp') && (
        <div className="form-group">
          <label>{subDestinationLabel} *</label>
          {loadingSub ? (
            <div className="loading-inline">
              <div className="spinner-small" />
              <span>Loading...</span>
            </div>
          ) : (
            <select
              value={selectedSubDestination?.id || ''}
              onChange={handleSubDestinationChange}
              disabled={disabled || subDestinations.length === 0}
            >
              <option value="">Select {subDestinationLabel.toLowerCase()}...</option>
              {subDestinations.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

export type { SelectedDestination }
