/**
 * Basecamp Integration
 * 
 * Implements the Integration interface for Basecamp project management.
 */

import type {
  Integration,
  Destination,
  SubDestination,
  Tag,
  UploadResult,
  BugReport,
  SubmissionResult,
  BasecampDestinationType,
} from './types'
import { IntegrationError } from './types'
import {
  validateAccessToken,
  getProjects,
  getProjectTodoLists,
  getProjectCardColumns,
  uploadAttachment,
  createTodo,
  createCard,
  dataUrlToArrayBuffer,
  type BasecampProject,
  type BasecampTodoList,
  type BasecampCardColumn,
} from '../basecamp-api'
import { getIntegrationCredentials } from '../storage'

/**
 * Basecamp integration implementation
 */
export class BasecampIntegration implements Integration {
  readonly type = 'basecamp' as const
  readonly name = 'Basecamp'
  readonly icon = 'basecamp' // Can be used to reference an icon asset

  /**
   * Check if Basecamp credentials are stored
   */
  async isConfigured(): Promise<boolean> {
    const credentials = await getIntegrationCredentials()
    return !!credentials.basecamp?.accessToken
  }

  /**
   * Validate the stored access token
   */
  async validateCredentials(): Promise<boolean> {
    const credentials = await getIntegrationCredentials()
    if (!credentials.basecamp?.accessToken) {
      return false
    }

    try {
      // Check if token is expired
      if (credentials.basecamp.expiresAt) {
        const expiresAt = new Date(credentials.basecamp.expiresAt)
        if (expiresAt <= new Date()) {
          // Token is expired - would need refresh
          // For now, return false; refresh logic will be handled elsewhere
          return false
        }
      }

      await validateAccessToken(credentials.basecamp.accessToken)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get all projects as destinations
   */
  async getDestinations(): Promise<Destination[]> {
    const { accessToken, accountId, accountName } = await this.getCredentials()
    const projects = await getProjects(accessToken, accountId)

    return projects
      .filter(project => project.status === 'active')
      .map(project => this.projectToDestination(project, accountId, accountName))
  }

  /**
   * Get to-do lists or card columns within a project as sub-destinations
   * (depending on destinationType setting)
   */
  async getSubDestinations(projectId: string): Promise<SubDestination[]> {
    const { accessToken, accountId, destinationType } = await this.getCredentials()
    const projectIdNum = parseInt(projectId, 10)
    
    if (destinationType === 'card') {
      // Get card table columns
      const columns = await getProjectCardColumns(accessToken, accountId, projectIdNum)
      return columns.map(col => this.cardColumnToSubDestination(col, projectId))
    } else {
      // Default to to-do lists
      const todoLists = await getProjectTodoLists(accessToken, accountId, projectIdNum)
      return todoLists.map(list => this.todoListToSubDestination(list, projectId))
    }
  }

  /**
   * Basecamp doesn't have a native tagging system for to-dos
   */
  async getTags(): Promise<Tag[]> {
    return []
  }

  /**
   * Basecamp doesn't support tags on to-dos
   */
  supportsTags(): boolean {
    return false
  }

  /**
   * Basecamp requires selecting a to-do list within a project
   */
  requiresSubDestination(): boolean {
    return true
  }

  /**
   * Upload an image to Basecamp
   */
  async uploadImage(imageDataUrl: string, filename: string): Promise<UploadResult> {
    const { accessToken, accountId } = await this.getCredentials()

    // Convert data URL to binary
    const { buffer, mimeType } = dataUrlToArrayBuffer(imageDataUrl)

    // Upload the attachment
    const attachment = await uploadAttachment(
      accessToken,
      accountId,
      filename,
      mimeType,
      buffer
    )

    return {
      sgid: attachment.attachable_sgid,
      filename: attachment.filename,
      contentType: attachment.content_type,
    }
  }

  /**
   * Submit a bug report to Basecamp as a to-do or card
   */
  async submitReport(report: BugReport): Promise<SubmissionResult> {
    const { accessToken, accountId, destinationType } = await this.getCredentials()

    if (!report.subDestinationId) {
      const itemType = destinationType === 'card' ? 'card table column' : 'to-do list'
      throw new IntegrationError(
        `Basecamp requires selecting a ${itemType}`,
        'basecamp'
      )
    }

    const subDestId = parseInt(report.subDestinationId, 10)

    // Upload the image first
    const filename = `screenshot-${Date.now()}.png`
    const upload = await this.uploadImage(report.imageDataUrl, filename)

    // Build the content with description (which already includes metadata) and embedded image
    // Note: report.description already contains metadataHtml from the AnnotatePage
    const content = `
${report.description || report.metadataHtml}
${this.getImageEmbedHtml(upload)}
`.trim()

    if (destinationType === 'card') {
      // Create a card
      const card = await createCard(accessToken, accountId, subDestId, {
        title: report.title,
        content,
      })

      return {
        id: card.id.toString(),
        url: card.app_url,
        title: card.title,
      }
    } else {
      // Create a to-do (default)
      const todo = await createTodo(accessToken, accountId, subDestId, {
        content: report.title,
        description: content,
      })

      return {
        id: todo.id.toString(),
        url: todo.app_url,
        title: todo.content,
      }
    }
  }

  /**
   * Get the HTML for embedding an uploaded image (Basecamp uses bc-attachment)
   * Note: Omitting the caption attribute allows Basecamp to render it as an inline image preview
   */
  getImageEmbedHtml(upload: UploadResult): string {
    return `<bc-attachment sgid="${upload.sgid}"></bc-attachment>`
  }

  // ============ Private helpers ============

  /**
   * Get the stored credentials, throwing if not configured
   */
  private async getCredentials(): Promise<{
    accessToken: string
    accountId: number
    accountName: string
    apiBaseUrl: string
    destinationType: BasecampDestinationType
  }> {
    const credentials = await getIntegrationCredentials()
    const bc = credentials.basecamp
    if (!bc?.accessToken || !bc?.accountId || !bc?.accountName || !bc?.apiBaseUrl) {
      throw new IntegrationError('Basecamp is not configured', 'basecamp')
    }

    return {
      accessToken: bc.accessToken,
      accountId: parseInt(bc.accountId, 10),
      accountName: bc.accountName,
      apiBaseUrl: bc.apiBaseUrl,
      destinationType: bc.destinationType || 'todo',
    }
  }

  /**
   * Convert a Basecamp Project to a common Destination
   */
  private projectToDestination(
    project: BasecampProject,
    accountId: number,
    accountName: string
  ): Destination {
    return {
      id: project.id.toString(),
      name: project.name,
      accountId: accountId.toString(),
      accountName: accountName,
      url: project.app_url,
    }
  }

  /**
   * Convert a Basecamp To-do List to a common SubDestination
   */
  private todoListToSubDestination(
    todoList: BasecampTodoList,
    projectId: string
  ): SubDestination {
    return {
      id: todoList.id.toString(),
      name: todoList.title,
      parentId: projectId,
      url: todoList.app_url,
    }
  }

  /**
   * Convert a Basecamp Card Column to a common SubDestination
   */
  private cardColumnToSubDestination(
    column: BasecampCardColumn,
    projectId: string
  ): SubDestination {
    return {
      id: column.id.toString(),
      name: column.title,
      parentId: projectId,
      url: column.app_url,
    }
  }
}

/**
 * Singleton instance of the Basecamp integration
 */
export const basecampIntegration = new BasecampIntegration()
