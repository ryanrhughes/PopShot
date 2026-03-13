/**
 * Integration Registry
 * 
 * Manages available integrations and provides access to them.
 */

import type { Integration, IntegrationType } from './types'
import { fizzyIntegration } from './fizzy'
import { basecampIntegration } from './basecamp'

/**
 * Registry of all available integrations
 */
class IntegrationRegistry {
  private integrations: Map<IntegrationType, Integration> = new Map()

  constructor() {
    // Register built-in integrations
    this.register(fizzyIntegration)
    this.register(basecampIntegration)
  }

  /**
   * Register an integration
   */
  register(integration: Integration): void {
    this.integrations.set(integration.type, integration)
  }

  /**
   * Get an integration by ID
   */
  get(id: IntegrationType): Integration | undefined {
    return this.integrations.get(id)
  }

  /**
   * Get all registered integrations
   */
  getAll(): Integration[] {
    return Array.from(this.integrations.values())
  }

  /**
   * Get all integration IDs
   */
  getAllIds(): IntegrationType[] {
    return Array.from(this.integrations.keys())
  }

  /**
   * Get all configured integrations (those with valid credentials)
   */
  async getConfigured(): Promise<Integration[]> {
    const configured: Integration[] = []
    
    for (const integration of this.integrations.values()) {
      if (await integration.isConfigured()) {
        configured.push(integration)
      }
    }
    
    return configured
  }

  /**
   * Get all configured integration types
   */
  async getConfiguredTypes(): Promise<IntegrationType[]> {
    const configured = await this.getConfigured()
    return configured.map(i => i.type)
  }

  /**
   * Check if any integration is configured
   */
  async hasAnyConfigured(): Promise<boolean> {
    const configured = await this.getConfigured()
    return configured.length > 0
  }

  /**
   * Get a configured integration, throwing if not configured
   */
  async getConfiguredOrThrow(id: IntegrationType): Promise<Integration> {
    const integration = this.get(id)
    if (!integration) {
      throw new Error(`Unknown integration: ${id}`)
    }
    
    if (!(await integration.isConfigured())) {
      throw new Error(`Integration not configured: ${id}`)
    }
    
    return integration
  }
}

/**
 * Singleton registry instance
 */
export const integrationRegistry = new IntegrationRegistry()

/**
 * Convenience function to get an integration
 */
export function getIntegration(id: IntegrationType): Integration | undefined {
  return integrationRegistry.get(id)
}

/**
 * Convenience function to get all integrations
 */
export function getAllIntegrations(): Integration[] {
  return integrationRegistry.getAll()
}

/**
 * Convenience function to get configured integrations
 */
export async function getConfiguredIntegrations(): Promise<Integration[]> {
  return integrationRegistry.getConfigured()
}
