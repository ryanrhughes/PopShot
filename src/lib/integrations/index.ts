/**
 * Integrations module exports
 */

// Types - export everything from types
export type {
  IntegrationType,
  Destination,
  SubDestination,
  Tag,
  UploadResult,
  BugReport,
  SubmissionResult,
  IntegrationCredentials,
  FizzyCredentials,
  BasecampCredentials,
  BasecampDestinationType,
  FizzyDestinationInfo,
  BasecampDestinationInfo,
  UrlDestinationMap,
  IntegrationPreferences,
  Integration,
} from './types'

export { IntegrationError } from './types'

// Integrations
export { FizzyIntegration, fizzyIntegration } from './fizzy'
export { BasecampIntegration, basecampIntegration } from './basecamp'

// Registry
export {
  integrationRegistry,
  getIntegration,
  getAllIntegrations,
  getConfiguredIntegrations,
} from './registry'
