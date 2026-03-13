/**
 * PopShot Extension - Library exports
 */

// Storage utilities
export * from './storage'

// Legacy Fizzy API (for backwards compatibility)
export * from './fizzy-api'

// Metadata utilities
export * from './metadata'

// Integration system - export selectively to avoid conflicts with fizzy-api
export {
  // Types
  type IntegrationType,
  type Destination,
  type SubDestination,
  type Tag as IntegrationTag,
  type UploadResult,
  type BugReport,
  type SubmissionResult,
  type IntegrationCredentials,
  type FizzyCredentials,
  type BasecampCredentials,
  type IntegrationPreferences,
  type Integration,
  IntegrationError,
  // Fizzy integration
  FizzyIntegration,
  fizzyIntegration,
  // Registry
  integrationRegistry,
  getIntegration,
  getAllIntegrations,
  getConfiguredIntegrations,
} from './integrations'
