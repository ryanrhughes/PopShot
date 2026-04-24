import { useState, useEffect, useRef } from 'react'
import {
  getIntegration,
  IntegrationError,
  basecampIntegration,
  type IntegrationType,
  type Destination,
  type SubDestination,
  type BasecampDestinationType,
} from '../lib/integrations'
import type { BasecampCardTableRef } from '../lib/basecamp-api'
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

  // For Basecamp card mode: list of card tables in the selected project
  // (projects can host multiple, e.g. a primary board + an Internal QA board)
  const [cardTables, setCardTables] = useState<BasecampCardTableRef[]>([])
  const [selectedCardTable, setSelectedCardTable] = useState<BasecampCardTableRef | null>(null)
  const [loadingCardTables, setLoadingCardTables] = useState(false)

  // Auto-incrementing id identifying the currently active destination fetch cycle.
  // Each user action (project change, destination-type toggle, card-table
  // change, integration change) bumps this ref and kicks off a cascade of
  // async data fetches (projects → availability → card tables → columns).
  // Every async loader captures its own id at start and bails if the active
  // id has moved on, so stale responses from a superseded cycle can't
  // overwrite newer state.
  const activeDestinationFetchIdRef = useRef(0)

  // Two helpers instead of one combined helper: a combined version would
  // bump the counter AND return a boolean checker in the same call, which
  // hides the mutation behind an innocent-looking name. Splitting them
  // means the bump only happens when you call beginDestinationFetchGeneration -
  // callers reading isDestinationFetchCurrent can trust nothing is changing.
  const beginDestinationFetchGeneration = () => ++activeDestinationFetchIdRef.current
  const isDestinationFetchCurrent = (id: number) =>
    id === activeDestinationFetchIdRef.current

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

    const destinationFetchId = beginDestinationFetchGeneration()
    setLoading(true)
    setError(null)
    setErrorStatus(null)
    setBasecampAuthError(null)
    setDestinations([])
    setSelectedDestination(null)
    setSubDestinations([])
    setSelectedSubDestination(null)
    setCardTables([])
    setSelectedCardTable(null)

    try {
      const integration = getIntegration(integrationType)
      if (!integration) {
        throw new Error('Integration not found')
      }

      // Get Basecamp destination type if applicable
      if (integrationType === 'basecamp') {
        const creds = await getIntegrationCredentials()
        if (!isDestinationFetchCurrent(destinationFetchId)) return
        setBasecampDestinationType(creds.basecamp?.destinationType || 'todo')
      }

      setRequiresSubDestination(integration.requiresSubDestination())
      const dests = await integration.getDestinations()
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      setDestinations(dests)

      // Try to restore last used destination for this URL
      const lastUsed = await getLastUsedDestination(integrationType, currentUrl)
      if (!isDestinationFetchCurrent(destinationFetchId)) return
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
      if (!isDestinationFetchCurrent(destinationFetchId)) return
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
      if (isDestinationFetchCurrent(destinationFetchId)) {
        setLoading(false)
      }
    }
  }

  // Check which destination types are available for a Basecamp project.
  // Routes through BasecampIntegration so an expired/revoked token triggers
  // the proactive refresh and, if that fails, surfaces as an IntegrationError
  // the UI can render as a reconnect banner - rather than the old behavior
  // of swallowing every failure as "no destinations available".
  const checkBasecampAvailability = async (projectId: string) => {
    // Child loader: inherits the generation its caller (the project-change
    // handler or loadDestinations) already started. It observes rather than
    // begins so the caller's `finally` guard still runs.
    const destinationFetchId = activeDestinationFetchIdRef.current
    setCheckingAvailability(true)
    setHasTodoLists(false)
    setHasCardColumns(false)
    setSubDestinations([])
    setSelectedSubDestination(null)
    setCardTables([])
    setSelectedCardTable(null)
    setError(null)
    setErrorStatus(null)

    try {
      const { hasTodoLists: hasTodos, hasCardColumns: hasCards } =
        await basecampIntegration.getProjectAvailability(projectId)
      if (!isDestinationFetchCurrent(destinationFetchId)) return

      setHasTodoLists(hasTodos)
      setHasCardColumns(hasCards)

      // Determine which type to use
      let effectiveType = basecampDestinationType

      // If current type is not available, switch to the other
      const creds = await getIntegrationCredentials()
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      if (effectiveType === 'todo' && !hasTodos && hasCards && creds.basecamp) {
        effectiveType = 'card'
        setBasecampDestinationType('card')
        await setBasecampCredentials({ ...creds.basecamp, destinationType: 'card' })
        if (!isDestinationFetchCurrent(destinationFetchId)) return
      } else if (effectiveType === 'card' && !hasCards && hasTodos && creds.basecamp) {
        effectiveType = 'todo'
        setBasecampDestinationType('todo')
        await setBasecampCredentials({ ...creds.basecamp, destinationType: 'todo' })
        if (!isDestinationFetchCurrent(destinationFetchId)) return
      }

      // Now load the appropriate sub-destinations
      if (effectiveType === 'card' && hasCards) {
        loadCardTables(projectId)
      } else if (effectiveType === 'todo' && hasTodos) {
        loadSubDestinations(projectId)
      }
    } catch (err) {
      if (!isDestinationFetchCurrent(destinationFetchId)) return
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
      if (isDestinationFetchCurrent(destinationFetchId)) {
        setCheckingAvailability(false)
      }
    }
  }

  // Basecamp card mode: list the project's card tables (a project can host
  // more than one, e.g. a primary board plus an Internal QA board). Auto-
  // selects when there's only one, or when the user's last pick still exists.
  const loadCardTables = async (projectId: string) => {
    // Child loader - see checkBasecampAvailability comment; inherits the
    // caller's generation instead of starting a new one.
    const destinationFetchId = activeDestinationFetchIdRef.current
    setLoadingCardTables(true)
    setCardTables([])
    setSelectedCardTable(null)
    setSubDestinations([])
    setSelectedSubDestination(null)

    try {
      const tables = await basecampIntegration.getProjectCardTables(projectId)
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      setCardTables(tables)

      if (tables.length === 0) {
        // No card tables anywhere in this project - treat as no cards available
        setHasCardColumns(false)
        return
      }

      const lastUsed = await getLastUsedDestination('basecamp', currentUrl)
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      const restored = lastUsed?.cardTableId
        ? tables.find(t => t.id.toString() === lastUsed.cardTableId)
        : undefined

      const pick = restored || (tables.length === 1 ? tables[0] : null)
      if (pick) {
        setSelectedCardTable(pick)
        loadSubDestinations(projectId, pick)
      }
    } catch (err) {
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      if (
        err instanceof IntegrationError &&
        err.integration === 'basecamp' &&
        (err.code === 'session_expired' || err.code === 'invalid_client')
      ) {
        setBasecampAuthError(err.code)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load card tables')
        setErrorStatus(err instanceof IntegrationError ? err.status ?? null : null)
      }
    } finally {
      if (isDestinationFetchCurrent(destinationFetchId)) {
        setLoadingCardTables(false)
      }
    }
  }

  const loadSubDestinations = async (
    destinationId: string,
    cardTable?: BasecampCardTableRef
  ) => {
    if (!integrationType) return

    // Child loader - inherits the caller's generation.
    const destinationFetchId = activeDestinationFetchIdRef.current
    setLoadingSub(true)
    setSubDestinations([])
    setSelectedSubDestination(null)

    try {
      const integration = getIntegration(integrationType)
      if (!integration) return

      // Basecamp card mode targets a specific card table's columns; other
      // integrations and todo mode ignore the extra argument.
      const fetchedSubDestinations =
        integrationType === 'basecamp' && cardTable
          ? await basecampIntegration.getSubDestinations(destinationId, cardTable.url)
          : await integration.getSubDestinations(destinationId)
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      setSubDestinations(fetchedSubDestinations)

      // Try to restore last used sub-destination for this URL
      const lastUsed = await getLastUsedDestination(integrationType, currentUrl)
      if (!isDestinationFetchCurrent(destinationFetchId)) return
      if (lastUsed?.subDestinationId) {
        const lastSubDestination = fetchedSubDestinations.find(
          subDestination => subDestination.id === lastUsed.subDestinationId
        )
        if (lastSubDestination) {
          setSelectedSubDestination(lastSubDestination)
          return
        }
      }

      // Auto-select first if only one
      if (fetchedSubDestinations.length === 1) {
        setSelectedSubDestination(fetchedSubDestinations[0])
      }
    } catch (err) {
      if (!isDestinationFetchCurrent(destinationFetchId)) return
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
      if (isDestinationFetchCurrent(destinationFetchId)) {
        setLoadingSub(false)
      }
    }
  }

  const handleDestinationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // A new project supersedes any in-flight availability/card-table/column
    // load, so stale responses from the previous project don't overwrite state.
    beginDestinationFetchGeneration()
    const dest = destinations.find(d => d.id === e.target.value)
    setSelectedDestination(dest || null)

    // Save as last used for this URL (without sub-destination for now)
    if (dest && integrationType) {
      setLastUsedDestination(integrationType, dest.id, dest.accountId, undefined, currentUrl)
    }
  }

  const handleSubDestinationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subDestination = subDestinations.find(candidate => candidate.id === e.target.value)
    setSelectedSubDestination(subDestination || null)

    // Save as last used for this URL (with sub-destination). For Basecamp card
    // mode, also remember which card table the column came from so we can
    // restore the exact pick next time.
    if (subDestination && selectedDestination && integrationType) {
      const cardTableId =
        integrationType === 'basecamp' &&
        basecampDestinationType === 'card' &&
        selectedCardTable
          ? selectedCardTable.id.toString()
          : undefined

      setLastUsedDestination(
        integrationType,
        selectedDestination.id,
        selectedDestination.accountId,
        subDestination.id,
        currentUrl,
        cardTableId
      )
    }
  }

  const handleCardTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // A new card table supersedes any in-flight column load.
    beginDestinationFetchGeneration()
    const table = cardTables.find(t => t.id.toString() === e.target.value) || null
    setSelectedCardTable(table)
    setSubDestinations([])
    setSelectedSubDestination(null)

    if (table && selectedDestination && integrationType) {
      // Persist the card-table pick immediately. Clears the previously-saved
      // column since it belonged to a different table - the user will pick a
      // new one from this table's columns next.
      setLastUsedDestination(
        integrationType,
        selectedDestination.id,
        selectedDestination.accountId,
        undefined,
        currentUrl,
        table.id.toString()
      )

      loadSubDestinations(selectedDestination.id, table)
    }
  }

  const handleDestinationTypeChange = async (newType: BasecampDestinationType) => {
    // Switching mode supersedes any in-flight load from the previous mode.
    const destinationFetchId = beginDestinationFetchGeneration()

    // Save the preference. Re-check destinationFetchId before writing to storage so a
    // rapid double-toggle (card → todo → card) can't let an earlier handler
    // flip the persisted destinationType back underneath a later one.
    const creds = await getIntegrationCredentials()
    if (!isDestinationFetchCurrent(destinationFetchId)) return
    if (creds.basecamp) {
      await setBasecampCredentials({
        ...creds.basecamp,
        destinationType: newType,
      })
      if (!isDestinationFetchCurrent(destinationFetchId)) return
    }

    setBasecampDestinationType(newType)

    // Clear sub-destination and card-table state when type changes
    setSubDestinations([])
    setSelectedSubDestination(null)
    setCardTables([])
    setSelectedCardTable(null)

    // Reload sub-destinations with new type
    if (selectedDestination) {
      if (newType === 'card') {
        loadCardTables(selectedDestination.id)
      } else {
        loadSubDestinations(selectedDestination.id)
      }
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

      {/* Basecamp card mode: Card Table picker. Shown only when the project
          hosts more than one card table; a sole card table is auto-selected. */}
      {integrationType === 'basecamp' &&
        basecampDestinationType === 'card' &&
        selectedDestination &&
        !checkingAvailability &&
        hasCardColumns &&
        (loadingCardTables || cardTables.length > 1) && (
          <div className="form-group">
            <label>Card Table *</label>
            {loadingCardTables ? (
              <div className="loading-inline">
                <div className="spinner-small" />
                <span>Loading...</span>
              </div>
            ) : (
              <select
                value={selectedCardTable?.id.toString() || ''}
                onChange={handleCardTableChange}
                disabled={disabled}
              >
                <option value="">Select card table...</option>
                {cardTables.map(table => (
                  <option key={table.id} value={table.id.toString()}>
                    {table.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

      {requiresSubDestination && selectedDestination && !checkingAvailability && (hasTodoLists || hasCardColumns || integrationType !== 'basecamp') && (
        // In card mode, gate the Column dropdown on having a card table chosen
        // so users never see columns without knowing which board they belong to.
        (integrationType !== 'basecamp' ||
          basecampDestinationType !== 'card' ||
          selectedCardTable) && (
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
                {subDestinations.map((subDestination) => (
                  <option key={subDestination.id} value={subDestination.id}>
                    {subDestination.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )
      )}
    </div>
  )
}

export type { SelectedDestination }
