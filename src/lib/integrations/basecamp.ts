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
  refreshAccessToken,
  BasecampApiError,
  type BasecampProject,
  type BasecampTodoList,
  type BasecampCardColumn,
} from '../basecamp-api'
import { getIntegrationCredentials, setBasecampCredentials } from '../storage'

/**
 * Canonical error messages for the two OAuth recovery paths.
 *
 * SESSION_EXPIRED_MESSAGE: the refresh token is dead or the access token was
 * rejected. Inline Reconnect recovers this.
 *
 * INVALID_CLIENT_MESSAGE: the client_id/client_secret themselves are bad
 * (admin rotated them, app was revoked in launchpad). Inline Reconnect
 * would loop forever; the user has to reconfigure in Settings.
 */
export const BASECAMP_SESSION_EXPIRED_MESSAGE =
  'Your Basecamp session has expired. Sign in again to continue.'
export const BASECAMP_INVALID_CLIENT_MESSAGE =
  'Basecamp credentials need to be reconfigured in Settings.'

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
    return this.withAuthErrorHandling(async () => {
      const { accessToken, accountId, accountName } = await this.getCredentials()
      const projects = await getProjects(accessToken, accountId)

      return projects
        .filter(project => project.status === 'active')
        .map(project => this.projectToDestination(project, accountId, accountName))
    })
  }

  /**
   * Get to-do lists or card columns within a project as sub-destinations
   * (depending on destinationType setting)
   */
  async getSubDestinations(projectId: string): Promise<SubDestination[]> {
    return this.withAuthErrorHandling(async () => {
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
    })
  }

  /**
   * Probe which destination types (to-do lists / card columns) a project has
   * enabled. Runs both lookups through getCredentials() + withAuthErrorHandling
   * so a stale token triggers the proactive refresh and a revoked token
   * surfaces as the canonical session_expired IntegrationError instead of an
   * empty-state false negative in the UI.
   *
   * Both lookups succeed-or-fail together; per-call swallowing (the old
   * pattern) masked auth/server errors as "no destinations available".
   */
  async getProjectAvailability(projectId: string): Promise<{
    hasTodoLists: boolean
    hasCardColumns: boolean
  }> {
    return this.withAuthErrorHandling(async () => {
      const { accessToken, accountId } = await this.getCredentials()
      const projectIdNum = parseInt(projectId, 10)

      const [todoLists, cardColumns] = await Promise.all([
        getProjectTodoLists(accessToken, accountId, projectIdNum),
        getProjectCardColumns(accessToken, accountId, projectIdNum),
      ])

      return {
        hasTodoLists: todoLists.length > 0,
        hasCardColumns: cardColumns.length > 0,
      }
    })
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
    return this.withAuthErrorHandling(async () => {
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
    })
  }

  /**
   * Submit a bug report to Basecamp as a to-do or card
   */
  async submitReport(report: BugReport): Promise<SubmissionResult> {
    return this.withAuthErrorHandling(async () => {
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
    })
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
   * Run a Basecamp API call and convert 401 responses (e.g. "OAuth token
   * expired (old age)" when the server rejects a token that refresh can't
   * rescue) into the same canonical IntegrationError that the local refresh
   * failure branch throws, so the UI has a single shape to react to.
   *
   * The error carries `code: 'session_expired'` so UI surfaces can render the
   * inline reconnect component (as opposed to `'invalid_client'`, which
   * routes to Settings).
   */
  private async withAuthErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof IntegrationError) throw err
      const status = (err as { status?: number } | null)?.status
      if (status === 401) {
        throw new IntegrationError(
          BASECAMP_SESSION_EXPIRED_MESSAGE,
          'basecamp',
          401,
          'session_expired'
        )
      }
      throw err
    }
  }

  /**
   * Get the stored credentials, refreshing the token if expired.
   * Throws if not configured.
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

    // Check if token is expired or about to expire (within 5 minutes)
    let accessToken = bc.accessToken
    if (bc.expiresAt && bc.refreshToken && bc.clientId && bc.clientSecret) {
      const expiresAt = new Date(bc.expiresAt)
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
      
      if (expiresAt <= fiveMinutesFromNow) {
        // Token expired or expiring soon - refresh it
        console.log(
          `[Basecamp] Access token ${expiresAt <= new Date() ? 'expired' : 'expiring soon'} (expiresAt=${bc.expiresAt}), refreshing...`
        )
        try {
          const tokenData = await refreshAccessToken(
            bc.refreshToken,
            bc.clientId,
            bc.clientSecret
          )

          // Calculate new expiration time
          const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

          // Update stored credentials
          await setBasecampCredentials({
            ...bc,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: newExpiresAt,
          })

          console.log(
            `[Basecamp] Access token refreshed successfully, new expiresAt=${newExpiresAt} (in ${Math.round(tokenData.expires_in / 60)} min)`
          )

          accessToken = tokenData.access_token
        } catch (error) {
          console.warn('[Basecamp] Access token refresh failed:', error)
          // Distinguish the two OAuth recovery paths. invalid_client means
          // the app credentials themselves are bad (admin rotated the secret
          // or revoked the app), so inline reconnect would loop forever - the
          // user needs Settings. Every other failure (invalid_grant, network
          // error, unexpected shape) is treated as a session expiry that an
          // inline reconnect can recover from; the user can fall back to
          // Settings if reconnect keeps failing.
          if (error instanceof BasecampApiError && error.errorCode === 'invalid_client') {
            throw new IntegrationError(
              BASECAMP_INVALID_CLIENT_MESSAGE,
              'basecamp',
              error.status,
              'invalid_client'
            )
          }
          throw new IntegrationError(
            BASECAMP_SESSION_EXPIRED_MESSAGE,
            'basecamp',
            401,
            'session_expired'
          )
        }
      }
    }

    return {
      accessToken,
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
