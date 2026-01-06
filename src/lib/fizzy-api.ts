/**
 * Fizzy API client for the Chrome extension
 * Handles all communication with the Fizzy API
 */

const FIZZY_API_BASE = 'https://app.fizzy.do'

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
function createHeaders(apiKey: string): HeadersInit {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
}

/**
 * Handle API response errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`
    
    try {
      const errorData = await response.json()
      if (typeof errorData === 'object') {
        errorMessage = Object.entries(errorData)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
      }
    } catch {
      // Ignore JSON parse errors
    }
    
    throw new FizzyApiError(errorMessage, response.status, response.statusText)
  }
  
  return response.json()
}

/**
 * Validate API key by fetching user identity
 */
export async function validateApiKey(apiKey: string): Promise<IdentityResponse> {
  const response = await fetch(`${FIZZY_API_BASE}/my/identity`, {
    headers: createHeaders(apiKey),
  })
  
  return handleResponse<IdentityResponse>(response)
}

/**
 * Get user's identity and accounts
 */
export async function getIdentity(apiKey: string): Promise<IdentityResponse> {
  return validateApiKey(apiKey)
}

/**
 * Get boards for an account
 */
export async function getBoards(apiKey: string, accountSlug: string): Promise<Board[]> {
  const response = await fetch(`${FIZZY_API_BASE}${accountSlug}/boards`, {
    headers: createHeaders(apiKey),
  })
  
  return handleResponse<Board[]>(response)
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
  const response = await fetch(`${FIZZY_API_BASE}${accountSlug}/rails/active_storage/direct_uploads`, {
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
  
  return handleResponse<DirectUploadResponse>(response)
}

/**
 * Upload a file to the direct upload URL
 */
export async function uploadFile(
  uploadUrl: string,
  headers: Record<string, string>,
  fileData: Blob
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: fileData,
  })
  
  if (!response.ok) {
    throw new FizzyApiError(
      `Upload failed: ${response.status} ${response.statusText}`,
      response.status,
      response.statusText
    )
  }
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
  const response = await fetch(`${FIZZY_API_BASE}${accountSlug}/boards/${boardId}/cards`, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify({ card }),
  })
  
  // Handle 201 Created - may not return body
  if (response.status === 201) {
    const location = response.headers.get('Location')
    if (location) {
      // Fetch the created card
      const cardResponse = await fetch(`${FIZZY_API_BASE}${location}`, {
        headers: createHeaders(apiKey),
      })
      return handleResponse<Card>(cardResponse)
    }
  }
  
  return handleResponse<Card>(response)
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
  imageDataUrl: string,
  title: string,
  metadata: string
): Promise<{ card: Card; cardUrl: string }> {
  // Convert data URL to blob
  const blob = dataUrlToBlob(imageDataUrl)
  const arrayBuffer = await blob.arrayBuffer()
  
  // Calculate checksum (simplified - may need proper MD5 implementation)
  const checksum = await calculateChecksum(arrayBuffer)
  
  const filename = `screenshot-${Date.now()}.png`
  
  // Create direct upload
  const directUpload = await createDirectUpload(apiKey, accountSlug, {
    filename,
    byteSize: blob.size,
    checksum,
    contentType: blob.type,
  })
  
  // Upload the file
  await uploadFile(directUpload.direct_upload.url, directUpload.direct_upload.headers, blob)
  
  // Create the card with the image embedded
  const description = `
<p>${metadata}</p>
<action-text-attachment sgid="${directUpload.signed_id}"></action-text-attachment>
`.trim()
  
  const card = await createCard(apiKey, accountSlug, boardId, {
    title,
    description,
  })
  
  return { card, cardUrl: card.url }
}
