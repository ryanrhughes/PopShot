/**
 * Fizzy Integration
 * 
 * Implements the Integration interface for Fizzy bug tracking.
 */

import type {
  Integration,
  Destination,
  SubDestination,
  Tag,
  UploadResult,
  BugReport,
  SubmissionResult,
} from './types'
import { IntegrationError } from './types'
import {
  validateApiKey,
  getIdentity,
  getAllBoards,
  getAllTags,
  createDirectUpload,
  uploadFile,
  createCard,
  calculateChecksum,
  dataUrlToBlob,
  type Account,
  type Board,
  type Tag as FizzyTag,
} from '../fizzy-api'
import { getIntegrationCredentials } from '../storage'

/**
 * Fizzy integration implementation
 */
export class FizzyIntegration implements Integration {
  readonly type = 'fizzy' as const
  readonly name = 'Fizzy'
  readonly icon = 'fizzy' // Can be used to reference an icon asset

  /**
   * Check if Fizzy credentials are stored
   */
  async isConfigured(): Promise<boolean> {
    const credentials = await getIntegrationCredentials()
    return !!credentials.fizzy?.apiKey
  }

  /**
   * Validate the stored API key
   */
  async validateCredentials(): Promise<boolean> {
    const credentials = await getIntegrationCredentials()
    if (!credentials.fizzy?.apiKey) {
      return false
    }

    try {
      await validateApiKey(credentials.fizzy.apiKey)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get all boards across all accounts as destinations
   */
  async getDestinations(): Promise<Destination[]> {
    const apiKey = await this.getApiKey()
    const accountBoards = await getAllBoards(apiKey)

    const destinations: Destination[] = []
    for (const { account, boards } of accountBoards) {
      for (const board of boards) {
        destinations.push(this.boardToDestination(board, account))
      }
    }

    return destinations
  }

  /**
   * Fizzy doesn't use sub-destinations (cards go directly to boards)
   */
  async getSubDestinations(_destinationId: string): Promise<SubDestination[]> {
    return []
  }

  /**
   * Get all tags across all accounts
   */
  async getTags(): Promise<Tag[]> {
    const apiKey = await this.getApiKey()
    const accountTags = await getAllTags(apiKey)

    const tags: Tag[] = []
    for (const { account, tags: fizzyTags } of accountTags) {
      for (const tag of fizzyTags) {
        tags.push(this.tagToCommonTag(tag, account))
      }
    }

    return tags
  }

  /**
   * Fizzy supports tags
   */
  supportsTags(): boolean {
    return true
  }

  /**
   * Fizzy doesn't require sub-destinations
   */
  requiresSubDestination(): boolean {
    return false
  }

  /**
   * Upload an image to Fizzy using ActiveStorage direct upload
   */
  async uploadImage(imageDataUrl: string, filename: string): Promise<UploadResult> {
    const apiKey = await this.getApiKey()
    
    // We need an account slug for the upload - get it from identity
    const identity = await getIdentity(apiKey)
    if (identity.accounts.length === 0) {
      throw new IntegrationError('No Fizzy accounts found', 'fizzy')
    }
    
    // Use first account for upload (the card creation will use the correct account)
    const accountSlug = identity.accounts[0].slug

    // Convert data URL to blob
    const blob = dataUrlToBlob(imageDataUrl)
    const arrayBuffer = await blob.arrayBuffer()
    const checksum = await calculateChecksum(arrayBuffer)

    // Create direct upload
    const directUpload = await createDirectUpload(apiKey, accountSlug, {
      filename,
      byteSize: blob.size,
      checksum,
      contentType: blob.type,
    })

    // Upload the file to S3
    await uploadFile(directUpload.direct_upload.url, directUpload.direct_upload.headers, blob)

    return {
      sgid: directUpload.attachable_sgid,
      filename,
      contentType: blob.type,
    }
  }

  /**
   * Submit a bug report to Fizzy
   */
  async submitReport(report: BugReport): Promise<SubmissionResult> {
    const apiKey = await this.getApiKey()

    // Upload the image first
    const filename = `screenshot-${Date.now()}.png`
    const upload = await this.uploadImageForAccount(report.imageDataUrl, filename, report.accountId)

    // Build the description with embedded image
    // Note: report.description already contains the metadata HTML from AnnotatePage
    const description = `
${report.description || ''}
${this.getImageEmbedHtml(upload)}
`.trim()

    // Create the card
    const card = await createCard(apiKey, report.accountId, report.destinationId, {
      title: report.title,
      description,
      tag_ids: report.tagIds && report.tagIds.length > 0 ? report.tagIds : undefined,
    })

    return {
      id: card.id,
      url: card.url,
      title: card.title,
    }
  }

  /**
   * Get the HTML for embedding an uploaded image (Fizzy uses action-text-attachment)
   */
  getImageEmbedHtml(upload: UploadResult): string {
    return `<action-text-attachment sgid="${upload.sgid}" content-type="${upload.contentType}" filename="${upload.filename}"></action-text-attachment>`
  }

  // ============ Private helpers ============

  /**
   * Get the stored API key, throwing if not configured
   */
  private async getApiKey(): Promise<string> {
    const credentials = await getIntegrationCredentials()
    if (!credentials.fizzy?.apiKey) {
      throw new IntegrationError('Fizzy is not configured', 'fizzy')
    }
    return credentials.fizzy.apiKey
  }

  /**
   * Upload an image for a specific account
   */
  private async uploadImageForAccount(
    imageDataUrl: string,
    filename: string,
    accountSlug: string
  ): Promise<UploadResult> {
    const apiKey = await this.getApiKey()

    // Convert data URL to blob
    const blob = dataUrlToBlob(imageDataUrl)
    const arrayBuffer = await blob.arrayBuffer()
    const checksum = await calculateChecksum(arrayBuffer)

    // Create direct upload
    const directUpload = await createDirectUpload(apiKey, accountSlug, {
      filename,
      byteSize: blob.size,
      checksum,
      contentType: blob.type,
    })

    // Upload the file to S3
    await uploadFile(directUpload.direct_upload.url, directUpload.direct_upload.headers, blob)

    return {
      sgid: directUpload.attachable_sgid,
      filename,
      contentType: blob.type,
    }
  }

  /**
   * Convert a Fizzy Board to a common Destination
   */
  private boardToDestination(board: Board, account: Account): Destination {
    return {
      id: board.id,
      name: board.name,
      accountId: account.slug,
      accountName: account.name,
      url: board.url,
    }
  }

  /**
   * Convert a Fizzy Tag to a common Tag
   */
  private tagToCommonTag(tag: FizzyTag, account: Account): Tag {
    return {
      id: tag.id,
      name: tag.title,
      accountId: account.slug,
    }
  }
}

/**
 * Singleton instance of the Fizzy integration
 */
export const fizzyIntegration = new FizzyIntegration()
