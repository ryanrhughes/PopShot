/**
 * Integration types and interfaces
 * 
 * These define the common contract that all integrations (Fizzy, Basecamp, etc.) must implement.
 */

/**
 * Supported integration types
 */
export type IntegrationType = 'fizzy' | 'basecamp'

/**
 * A destination where bug reports can be sent
 * For Fizzy: this is a Board
 * For Basecamp: this is a Project
 */
export interface Destination {
  id: string
  name: string
  /** The account/workspace this destination belongs to */
  accountId: string
  accountName: string
  /** URL to view this destination in the web app */
  url?: string
}

/**
 * A sub-destination (optional second level of hierarchy)
 * For Fizzy: not used (cards go directly to boards)
 * For Basecamp: this is a To-do List within a Project
 */
export interface SubDestination {
  id: string
  name: string
  parentId: string
  url?: string
}

/**
 * A tag/label that can be applied to bug reports
 */
export interface Tag {
  id: string
  name: string
  /** Which account this tag belongs to */
  accountId?: string
}

/**
 * The result of uploading an image
 */
export interface UploadResult {
  /** The signed global ID for embedding in rich text */
  sgid: string
  /** The uploaded filename */
  filename: string
  /** Content type of the uploaded file */
  contentType: string
}

/**
 * A bug report to be submitted
 */
export interface BugReport {
  title: string
  description: string
  /** The annotated screenshot as a data URL */
  imageDataUrl: string
  /** Primary destination (board/project) */
  destinationId: string
  /** Account/workspace slug or ID */
  accountId: string
  /** Optional sub-destination (e.g., to-do list for Basecamp) */
  subDestinationId?: string
  /** Optional tag IDs to apply */
  tagIds?: string[]
  /** Page metadata formatted as HTML */
  metadataHtml: string
}

/**
 * The result of submitting a bug report
 */
export interface SubmissionResult {
  /** Unique ID of the created item */
  id: string
  /** URL to view the created item */
  url: string
  /** Display title/name of the created item */
  title: string
}

/**
 * Integration configuration stored in chrome.storage
 */
export interface IntegrationCredentials {
  fizzy?: FizzyCredentials
  basecamp?: BasecampCredentials
}

export interface FizzyCredentials {
  apiKey: string
}

/**
 * Basecamp destination type - where to create items
 * - 'todo': Create as a To-do in a To-do List
 * - 'card': Create as a Card in a Card Table Column
 */
export type BasecampDestinationType = 'todo' | 'card'

export interface BasecampCredentials {
  /** OAuth Client ID from launchpad.37signals.com */
  clientId: string
  /** OAuth Client Secret from launchpad.37signals.com */
  clientSecret: string
  /** OAuth Redirect URI (defaults to chrome.identity.getRedirectURL()) */
  redirectUri?: string
  /** OAuth access token (set after successful auth) */
  accessToken?: string
  /** OAuth refresh token (set after successful auth) */
  refreshToken?: string
  /** ISO date string when the access token expires */
  expiresAt?: string
  /** The Basecamp account ID */
  accountId?: string
  /** The Basecamp account name */
  accountName?: string
  /** The API base URL for this account */
  apiBaseUrl?: string
  /** Where to create items: 'todo' (To-do List) or 'card' (Card Table) */
  destinationType?: BasecampDestinationType
}

/**
 * Stored destination info for Fizzy
 */
export interface FizzyDestinationInfo {
  boardId: string
  accountSlug: string
}

/**
 * Stored destination info for Basecamp
 */
export interface BasecampDestinationInfo {
  /** The Basecamp account ID */
  accountId: string
  projectId: string
  /** ID of the To-do List (when destinationType is 'todo') */
  todolistId?: string
  /** ID of the Card Table Column (when destinationType is 'card') */
  columnId?: string
}

/**
 * Last used destinations keyed by origin URL
 * e.g., { "https://app.example.com": { lastUsedIntegration: 'basecamp', fizzy: {...}, basecamp: {...} } }
 */
export interface UrlDestinationMap {
  [origin: string]: {
    /** Which integration was last used for this URL */
    lastUsedIntegration?: IntegrationType
    fizzy?: FizzyDestinationInfo
    basecamp?: BasecampDestinationInfo
  }
}

/**
 * User preferences for integrations
 */
export interface IntegrationPreferences {
  /** Which integration to use by default */
  defaultIntegration?: IntegrationType
  /** 
   * Last used destinations per URL origin and integration
   * Keyed by origin (e.g., "https://app.example.com:3000")
   */
  urlDestinations?: UrlDestinationMap
  
  /** @deprecated Use urlDestinations instead - kept for migration */
  lastUsedDestinations?: {
    fizzy?: FizzyDestinationInfo
    basecamp?: BasecampDestinationInfo
  }
}

/**
 * The interface that all integrations must implement
 */
export interface Integration {
  /** The type of integration (e.g., 'fizzy', 'basecamp') */
  readonly type: IntegrationType
  
  /** Display name */
  readonly name: string
  
  /** Icon identifier or URL */
  readonly icon: string
  
  /**
   * Check if this integration is configured (has credentials)
   */
  isConfigured(): Promise<boolean>
  
  /**
   * Validate that the stored credentials are still valid
   */
  validateCredentials(): Promise<boolean>
  
  /**
   * Get available destinations (boards/projects)
   */
  getDestinations(): Promise<Destination[]>
  
  /**
   * Get sub-destinations within a destination (e.g., to-do lists in a project)
   * Returns empty array if the integration doesn't use sub-destinations
   */
  getSubDestinations(destinationId: string): Promise<SubDestination[]>
  
  /**
   * Get available tags/labels
   * Returns empty array if the integration doesn't support tags
   */
  getTags(): Promise<Tag[]>
  
  /**
   * Check if this integration supports tags
   */
  supportsTags(): boolean
  
  /**
   * Check if this integration requires sub-destinations
   */
  requiresSubDestination(): boolean
  
  /**
   * Upload an image and get back an SGID for embedding
   */
  uploadImage(imageDataUrl: string, filename: string): Promise<UploadResult>
  
  /**
   * Submit a bug report
   */
  submitReport(report: BugReport): Promise<SubmissionResult>
  
  /**
   * Get the HTML for embedding an uploaded image in rich text
   * Different integrations use different formats (action-text-attachment vs bc-attachment)
   */
  getImageEmbedHtml(upload: UploadResult): string
}

/**
 * Error class for integration-specific errors
 */
export class IntegrationError extends Error {
  constructor(
    message: string,
    public integration: IntegrationType,
    public status?: number,
    public code?: string
  ) {
    super(message)
    this.name = 'IntegrationError'
  }
}
