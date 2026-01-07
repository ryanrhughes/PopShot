/**
 * Fizzy API client for the Chrome extension
 * Handles all communication with the Fizzy API
 * 
 * API requests are proxied through the service worker to avoid CORS issues.
 */

const FIZZY_API_BASE = 'https://app.fizzy.do'

/**
 * Make an API request through the service worker
 * This avoids CORS issues since service workers have host_permissions
 */
async function swFetch(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {}
): Promise<{ data: unknown; location?: string }> {
  const response = await chrome.runtime.sendMessage({
    action: 'apiRequest',
    method: options.method || 'GET',
    url,
    headers: options.headers || {},
    body: options.body,
  })
  
  // If response is undefined, the service worker didn't handle the message
  if (response === undefined) {
    throw new FizzyApiError(
      'Service worker not responding. Try refreshing the extension.',
      500,
      'Error'
    )
  }
  
  if (!response.success) {
    const error = new FizzyApiError(
      response.error || 'API request failed',
      response.status || 500,
      'Error'
    )
    throw error
  }
  
  return { data: response.data, location: response.location }
}

export interface Account {
  id: string
  name: string
  slug: string
  created_at: string
  user: User
}

export interface User {
  id: string
  name: string
  role: string
  active: boolean
  email_address: string
  created_at: string
  url: string
}

export interface Board {
  id: string
  name: string
  all_access: boolean
  created_at: string
  url: string
  creator: User
}

export interface Card {
  id: string
  number: number
  title: string
  status: string
  description: string
  description_html: string
  url: string
  board: Board
  creator: User
}

export interface DirectUploadResponse {
  id: string
  key: string
  filename: string
  content_type: string
  byte_size: number
  checksum: string
  direct_upload: {
    url: string
    headers: Record<string, string>
  }
  signed_id: string
  attachable_sgid: string  // This is what should be used in action-text-attachment
}

export interface IdentityResponse {
  accounts: Account[]
}

export class FizzyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message)
    this.name = 'FizzyApiError'
  }
}

/**
 * Create headers for Fizzy API requests
 */
function createHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
}

/**
 * Validate API key by fetching user identity
 */
export async function validateApiKey(apiKey: string): Promise<IdentityResponse> {
  const { data } = await swFetch(`${FIZZY_API_BASE}/my/identity`, {
    headers: createHeaders(apiKey),
  })
  
  return data as IdentityResponse
}

/**
 * Get user's identity and accounts
 */
export async function getIdentity(apiKey: string): Promise<IdentityResponse> {
  return validateApiKey(apiKey)
}

/**
 * Normalize account slug - ensure it doesn't have leading slash
 */
function normalizeSlug(slug: string): string {
  return slug.startsWith('/') ? slug.slice(1) : slug
}

/**
 * Get boards for an account
 */
export async function getBoards(apiKey: string, accountSlug: string): Promise<Board[]> {
  const slug = normalizeSlug(accountSlug)
  const { data } = await swFetch(`${FIZZY_API_BASE}/${slug}/boards`, {
    headers: createHeaders(apiKey),
  })
  
  return data as Board[]
}

/**
 * Get all boards across all accounts
 */
export async function getAllBoards(apiKey: string): Promise<{ account: Account; boards: Board[] }[]> {
  const identity = await getIdentity(apiKey)
  
  const results = await Promise.all(
    identity.accounts.map(async (account) => {
      const boards = await getBoards(apiKey, account.slug)
      return { account, boards }
    })
  )
  
  return results
}

/**
 * Create a direct upload request for an image
 */
export async function createDirectUpload(
  apiKey: string,
  accountSlug: string,
  file: {
    filename: string
    byteSize: number
    checksum: string
    contentType: string
  }
): Promise<DirectUploadResponse> {
  const slug = normalizeSlug(accountSlug)
  const { data } = await swFetch(`${FIZZY_API_BASE}/${slug}/rails/active_storage/direct_uploads`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({
      blob: {
        filename: file.filename,
        byte_size: file.byteSize,
        checksum: file.checksum,
        content_type: file.contentType,
      },
    }),
  })
  
  return data as DirectUploadResponse
}

/**
 * Upload a file to the direct upload URL
 */
export async function uploadFile(
  uploadUrl: string,
  headers: Record<string, string>,
  fileData: Blob
): Promise<void> {
  console.log('[Fizzy] Uploading file to S3:', uploadUrl)
  console.log('[Fizzy] Upload headers:', headers)
  console.log('[Fizzy] File size:', fileData.size)
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: fileData,
  })
  
  console.log('[Fizzy] S3 upload response:', response.status, response.statusText)
  
  if (!response.ok) {
    const text = await response.text()
    console.error('[Fizzy] S3 upload error body:', text)
    throw new FizzyApiError(
      `Upload failed: ${response.status} ${response.statusText}`,
      response.status,
      response.statusText
    )
  }
  
  console.log('[Fizzy] S3 upload SUCCESS')
}

/**
 * Create a card in a board
 */
export async function createCard(
  apiKey: string,
  accountSlug: string,
  boardId: string,
  card: {
    title: string
    description?: string
  }
): Promise<Card> {
  const slug = normalizeSlug(accountSlug)
  // POST to /boards/:board_id/cards per API spec
  const url = `${FIZZY_API_BASE}/${slug}/boards/${boardId}/cards`
  const body = JSON.stringify({ card })
  
  console.log('[Fizzy] Card creation URL:', url)
  console.log('[Fizzy] Card creation body:', body)
  
  const { data, location } = await swFetch(url, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body,
  })
  
  console.log('[Fizzy] Card created, data:', data, 'location:', location)
  
  // If we got data back, return it
  if (data) {
    return data as Card
  }
  
  // If we got a location header (201 Created), fetch the card
  if (location) {
    const { data: cardData } = await swFetch(`${FIZZY_API_BASE}${location}`, {
      headers: createHeaders(apiKey),
    })
    return cardData as Card
  }
  
  throw new FizzyApiError('No card data returned', 500, 'Error')
}

/**
 * Calculate MD5 checksum for a file (Base64 encoded)
 */
export async function calculateChecksum(data: ArrayBuffer): Promise<string> {
  // Use SparkMD5 for MD5 hashing (SubtleCrypto doesn't support MD5)
  const SparkMD5 = (await import('spark-md5')).default
  const spark = new SparkMD5.ArrayBuffer()
  spark.append(data)
  const hash = spark.end(true) // true = return raw binary
  return btoa(hash)
}

/**
 * Convert data URL to Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
  
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  
  return new Blob([bytes], { type: mimeType })
}

/**
 * Upload an image and create a card with it
 */
export async function uploadImageAndCreateCard(
  apiKey: string,
  accountSlug: string,
  boardId: string,
  _imageDataUrl: string,
  title: string,
  metadata: string
): Promise<{ card: Card; cardUrl: string }> {
  // For now, just create a card without image to debug the 422
  const description = metadata

  const card = await createCard(apiKey, accountSlug, boardId, {
    title,
    description,
  })
  
  return { card, cardUrl: card.url }
}
