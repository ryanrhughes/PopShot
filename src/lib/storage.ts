/**
 * Storage utilities for PopShot extension
 * Handles secure storage of credentials and user preferences
 */

import type {
  IntegrationCredentials,
  IntegrationPreferences,
  IntegrationType,
  FizzyCredentials,
  BasecampCredentials,
} from './integrations/types'

// Re-export types for convenience
export type { IntegrationCredentials, IntegrationPreferences, FizzyCredentials, BasecampCredentials }

export interface StorageData {
  /** @deprecated Use integrationCredentials.fizzy.apiKey instead */
  apiKey?: string
  lastUsedBoard?: string
  urlBoardDefaults?: Record<string, string>
  /** Credentials for all integrations */
  integrationCredentials?: IntegrationCredentials
  /** User preferences for integrations */
  integrationPreferences?: IntegrationPreferences
}

// ============ Legacy API Key functions (for backwards compatibility) ============

/**
 * Get the stored API key (legacy - for Fizzy)
 * @deprecated Use getIntegrationCredentials() instead
 */
export async function getApiKey(): Promise<string | null> {
  // First try the new storage location
  const credentials = await getIntegrationCredentials()
  if (credentials.fizzy?.apiKey) {
    return credentials.fizzy.apiKey
  }
  
  // Fall back to legacy storage
  const result = await chrome.storage.local.get(['apiKey'])
  return result.apiKey || null
}

/**
 * Store the API key (legacy - for Fizzy)
 * @deprecated Use setFizzyCredentials() instead
 */
export async function setApiKey(apiKey: string): Promise<void> {
  // Store in both locations for backwards compatibility
  await chrome.storage.local.set({ apiKey })
  await setFizzyCredentials({ apiKey })
}

/**
 * Clear the stored API key (legacy - for Fizzy)
 * @deprecated Use clearFizzyCredentials() instead
 */
export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(['apiKey'])
  await clearFizzyCredentials()
}

/**
 * Check if an API key is stored (legacy - for Fizzy)
 * @deprecated Use getIntegrationCredentials() instead
 */
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey()
  return !!key
}

// ============ Integration Credentials ============

/**
 * Get all integration credentials
 */
export async function getIntegrationCredentials(): Promise<IntegrationCredentials> {
  const result = await chrome.storage.local.get(['integrationCredentials', 'apiKey'])
  
  const credentials: IntegrationCredentials = result.integrationCredentials || {}
  
  // Migrate legacy apiKey if present and not already in new format
  if (result.apiKey && !credentials.fizzy?.apiKey) {
    credentials.fizzy = { apiKey: result.apiKey }
  }
  
  return credentials
}

/**
 * Set credentials for a specific integration
 */
export async function setIntegrationCredentials(credentials: IntegrationCredentials): Promise<void> {
  await chrome.storage.local.set({ integrationCredentials: credentials })
}

/**
 * Set Fizzy credentials
 */
export async function setFizzyCredentials(fizzy: FizzyCredentials): Promise<void> {
  const credentials = await getIntegrationCredentials()
  credentials.fizzy = fizzy
  await setIntegrationCredentials(credentials)
}

/**
 * Clear Fizzy credentials
 */
export async function clearFizzyCredentials(): Promise<void> {
  const credentials = await getIntegrationCredentials()
  delete credentials.fizzy
  await setIntegrationCredentials(credentials)
}

/**
 * Set Basecamp credentials
 */
export async function setBasecampCredentials(basecamp: BasecampCredentials): Promise<void> {
  const credentials = await getIntegrationCredentials()
  credentials.basecamp = basecamp
  await setIntegrationCredentials(credentials)
}

/**
 * Clear Basecamp credentials
 */
export async function clearBasecampCredentials(): Promise<void> {
  const credentials = await getIntegrationCredentials()
  delete credentials.basecamp
  await setIntegrationCredentials(credentials)
}

/**
 * Check if a specific integration is configured
 */
export async function isIntegrationConfigured(integration: IntegrationType): Promise<boolean> {
  const credentials = await getIntegrationCredentials()
  
  switch (integration) {
    case 'fizzy':
      return !!credentials.fizzy?.apiKey
    case 'basecamp':
      return !!credentials.basecamp?.accessToken
    default:
      return false
  }
}

/**
 * Get list of configured integration IDs
 */
export async function getConfiguredIntegrationIds(): Promise<IntegrationType[]> {
  const credentials = await getIntegrationCredentials()
  const configured: IntegrationType[] = []
  
  if (credentials.fizzy?.apiKey) {
    configured.push('fizzy')
  }
  if (credentials.basecamp?.accessToken) {
    configured.push('basecamp')
  }
  
  return configured
}

// ============ Integration Preferences ============

/**
 * Get integration preferences
 */
export async function getIntegrationPreferences(): Promise<IntegrationPreferences> {
  const result = await chrome.storage.local.get(['integrationPreferences'])
  return result.integrationPreferences || {}
}

/**
 * Set integration preferences
 */
export async function setIntegrationPreferences(prefs: IntegrationPreferences): Promise<void> {
  await chrome.storage.local.set({ integrationPreferences: prefs })
}

/**
 * Get the default integration
 */
export async function getDefaultIntegration(): Promise<IntegrationType | null> {
  const prefs = await getIntegrationPreferences()
  
  // If a default is set, return it (if it's still configured)
  if (prefs.defaultIntegration) {
    if (await isIntegrationConfigured(prefs.defaultIntegration)) {
      return prefs.defaultIntegration
    }
  }
  
  // Otherwise return the first configured integration
  const configured = await getConfiguredIntegrationIds()
  return configured[0] || null
}

/**
 * Set the default integration
 */
export async function setDefaultIntegration(integration: IntegrationType): Promise<void> {
  const prefs = await getIntegrationPreferences()
  prefs.defaultIntegration = integration
  await setIntegrationPreferences(prefs)
}

/**
 * Extract origin from a URL (protocol + hostname + port)
 * e.g., "https://app.example.com:3000/path" -> "https://app.example.com:3000"
 */
export function getOriginFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin
  } catch {
    // If URL parsing fails, return the original URL
    return url
  }
}

/**
 * Get last used destination for an integration and URL
 * Falls back to legacy global destination if no URL-specific one exists
 */
export async function getLastUsedDestination(
  integration: IntegrationType,
  url?: string
): Promise<{ destinationId: string; accountId: string; subDestinationId?: string } | null> {
  const prefs = await getIntegrationPreferences()
  
  // Try URL-specific destination first
  if (url) {
    const origin = getOriginFromUrl(url)
    const urlDest = prefs.urlDestinations?.[origin]?.[integration]
    
    if (urlDest) {
      if (integration === 'fizzy' && 'boardId' in urlDest) {
        return {
          destinationId: urlDest.boardId,
          accountId: urlDest.accountSlug,
        }
      }
      
      if (integration === 'basecamp' && 'projectId' in urlDest) {
        return {
          destinationId: urlDest.projectId,
          accountId: urlDest.projectId,
          subDestinationId: urlDest.todolistId || urlDest.columnId,
        }
      }
    }
  }
  
  // Fall back to legacy global destination (for backwards compatibility)
  const lastUsed = prefs.lastUsedDestinations?.[integration]
  
  if (!lastUsed) {
    return null
  }
  
  if (integration === 'fizzy' && 'boardId' in lastUsed) {
    return {
      destinationId: lastUsed.boardId,
      accountId: lastUsed.accountSlug,
    }
  }
  
  if (integration === 'basecamp' && 'projectId' in lastUsed) {
    return {
      destinationId: lastUsed.projectId,
      accountId: lastUsed.projectId,
      subDestinationId: lastUsed.todolistId || lastUsed.columnId,
    }
  }
  
  return null
}

/**
 * Set last used destination for an integration and URL
 */
export async function setLastUsedDestination(
  integration: IntegrationType,
  destinationId: string,
  accountId: string,
  subDestinationId?: string,
  url?: string
): Promise<void> {
  const prefs = await getIntegrationPreferences()
  
  // If URL is provided, save per-URL destination
  if (url) {
    const origin = getOriginFromUrl(url)
    
    if (!prefs.urlDestinations) {
      prefs.urlDestinations = {}
    }
    
    if (!prefs.urlDestinations[origin]) {
      prefs.urlDestinations[origin] = {}
    }
    
    if (integration === 'fizzy') {
      prefs.urlDestinations[origin].fizzy = {
        boardId: destinationId,
        accountSlug: accountId,
      }
    } else if (integration === 'basecamp') {
      const creds = await getIntegrationCredentials()
      const destType = creds.basecamp?.destinationType || 'todo'
      
      if (destType === 'card') {
        prefs.urlDestinations[origin].basecamp = {
          projectId: destinationId,
          columnId: subDestinationId,
        }
      } else {
        prefs.urlDestinations[origin].basecamp = {
          projectId: destinationId,
          todolistId: subDestinationId,
        }
      }
    }
  } else {
    // Fallback to legacy global storage if no URL provided
    if (!prefs.lastUsedDestinations) {
      prefs.lastUsedDestinations = {}
    }
    
    if (integration === 'fizzy') {
      prefs.lastUsedDestinations.fizzy = {
        boardId: destinationId,
        accountSlug: accountId,
      }
    } else if (integration === 'basecamp') {
      const creds = await getIntegrationCredentials()
      const destType = creds.basecamp?.destinationType || 'todo'
      
      if (destType === 'card') {
        prefs.lastUsedDestinations.basecamp = {
          projectId: destinationId,
          columnId: subDestinationId,
        }
      } else {
        prefs.lastUsedDestinations.basecamp = {
          projectId: destinationId,
          todolistId: subDestinationId,
        }
      }
    }
  }
  
  await setIntegrationPreferences(prefs)
}

// ============ Legacy Board/URL functions ============

/**
 * Get the last used board ID
 */
export async function getLastUsedBoard(): Promise<string | null> {
  const result = await chrome.storage.local.get(['lastUsedBoard'])
  return result.lastUsedBoard || null
}

/**
 * Store the last used board ID
 */
export async function setLastUsedBoard(boardId: string): Promise<void> {
  await chrome.storage.local.set({ lastUsedBoard: boardId })
}

/**
 * Get URL-to-board default mappings
 */
export async function getUrlBoardDefaults(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(['urlBoardDefaults'])
  return result.urlBoardDefaults || {}
}

/**
 * Set a URL-to-board default mapping
 */
export async function setUrlBoardDefault(urlPattern: string, boardId: string): Promise<void> {
  const defaults = await getUrlBoardDefaults()
  defaults[urlPattern] = boardId
  await chrome.storage.local.set({ urlBoardDefaults: defaults })
}

/**
 * Remove a URL-to-board default mapping
 */
export async function removeUrlBoardDefault(urlPattern: string): Promise<void> {
  const defaults = await getUrlBoardDefaults()
  delete defaults[urlPattern]
  await chrome.storage.local.set({ urlBoardDefaults: defaults })
}

/**
 * Find the default board for a given URL
 */
export async function findDefaultBoardForUrl(url: string): Promise<string | null> {
  const defaults = await getUrlBoardDefaults()
  
  // Try to match URL patterns (simple prefix matching)
  for (const [pattern, boardId] of Object.entries(defaults)) {
    if (url.startsWith(pattern) || url.includes(pattern)) {
      return boardId
    }
  }
  
  return null
}

// ============ General Storage ============

/**
 * Get all stored data
 */
export async function getAllStorageData(): Promise<StorageData> {
  return await chrome.storage.local.get([
    'apiKey',
    'lastUsedBoard',
    'urlBoardDefaults',
    'integrationCredentials',
    'integrationPreferences',
  ]) as StorageData
}

/**
 * Clear all stored data
 */
export async function clearAllStorageData(): Promise<void> {
  await chrome.storage.local.clear()
}
