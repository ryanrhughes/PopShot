/**
 * Basecamp API client for the Chrome extension
 * Handles all communication with the Basecamp API
 * 
 * API requests are proxied through the service worker to avoid CORS issues.
 * 
 * Basecamp API Documentation: https://github.com/basecamp/bc3-api
 */

const BASECAMP_AUTH_BASE = 'https://launchpad.37signals.com'
const BASECAMP_API_BASE = 'https://3.basecampapi.com'

// User-Agent is required by Basecamp API
const USER_AGENT = 'PopShot Browser Extension (support@popshot.app)'

/**
 * Make an API request through the service worker
 * This avoids CORS issues since service workers have host_permissions
 */
async function swFetch(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string | ArrayBuffer
  } = {}
): Promise<{ data: unknown; headers?: Record<string, string> }> {
  // ArrayBuffer doesn't serialize well through Chrome messaging,
  // so convert to a regular array of numbers
  let body: string | number[] | undefined
  if (options.body instanceof ArrayBuffer) {
    body = Array.from(new Uint8Array(options.body))
  } else {
    body = options.body
  }
  
  const response = await chrome.runtime.sendMessage({
    action: 'apiRequest',
    method: options.method || 'GET',
    url,
    headers: options.headers || {},
    body,
  })
  
  if (response === undefined) {
    throw new BasecampApiError(
      'Service worker not responding. Try refreshing the extension.',
      500,
      'Error'
    )
  }
  
  if (!response.success) {
    const error = new BasecampApiError(
      response.error || 'API request failed',
      response.status || 500,
      'Error',
      response.errorCode
    )
    throw error
  }

  return { data: response.data, headers: response.headers }
}

// ============ Types ============

export interface BasecampAccount {
  product: string  // 'bc3' for Basecamp 3/4
  id: number
  name: string
  href: string     // API base URL for this account
  app_href: string // Web URL for this account
}

export interface BasecampIdentity {
  id: number
  first_name: string
  last_name: string
  email_address: string
}

export interface BasecampAuthResponse {
  expires_at: string
  identity: BasecampIdentity
  accounts: BasecampAccount[]
}

export interface BasecampTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
}

export interface BasecampProject {
  id: number
  status: string
  created_at: string
  updated_at: string
  name: string
  description: string
  purpose: string
  bookmark_url: string
  url: string
  app_url: string
  dock: BasecampDockItem[]
}

export interface BasecampDockItem {
  id: number
  title: string
  name: string  // e.g., 'todoset', 'message_board', 'vault'
  enabled: boolean
  position: number
  url: string
  app_url: string
}

export interface BasecampTodoSet {
  id: number
  status: string
  created_at: string
  updated_at: string
  title: string
  type: string
  url: string
  app_url: string
  todolists_count: number
  todolists_url: string
}

export interface BasecampTodoList {
  id: number
  status: string
  created_at: string
  updated_at: string
  title: string
  type: string
  url: string
  app_url: string
  description: string
  completed: boolean
  completed_ratio: string
  parent: {
    id: number
    title: string
    type: string
    url: string
    app_url: string
  }
  bucket: {
    id: number
    name: string
    type: string
  }
}

export interface BasecampTodo {
  id: number
  status: string
  created_at: string
  updated_at: string
  title: string
  type: string
  url: string
  app_url: string
  description: string
  completed: boolean
  content: string
  parent: {
    id: number
    title: string
    type: string
    url: string
    app_url: string
  }
  bucket: {
    id: number
    name: string
    type: string
  }
}

export interface BasecampAttachment {
  id: number
  attachable_sgid: string
  sgid: string
  status_url: string
  caption: string | null
  byte_size: number
  content_type: string
  width?: number
  height?: number
  key: string
  filename: string
  download_url: string
  previewable: boolean
  preview_url?: string
  thumbnail_url?: string
}

// ============ Card Table Types ============

export interface BasecampCardTable {
  id: number
  status: string
  created_at: string
  updated_at: string
  title: string
  type: string  // 'Kanban::Board'
  url: string
  app_url: string
  lists: BasecampCardColumn[]
}

export interface BasecampCardColumn {
  id: number
  status: string
  created_at: string
  updated_at: string
  title: string
  type: string  // 'Kanban::Triage', 'Kanban::Column', 'Kanban::DoneColumn', 'Kanban::NotNowColumn'
  url: string
  app_url: string
  color: string | null
  cards_count: number
  cards_url: string
  position?: number
  parent: {
    id: number
    title: string
    type: string
    url: string
    app_url: string
  }
  bucket: {
    id: number
    name: string
    type: string
  }
}

export interface BasecampCard {
  id: number
  status: string
  created_at: string
  updated_at: string
  title: string
  type: string  // 'Kanban::Card'
  url: string
  app_url: string
  position: number
  completed: boolean
  content: string
  description: string
  due_on: string | null
  assignees: unknown[]
  parent: {
    id: number
    title: string
    type: string
    url: string
    app_url: string
  }
  bucket: {
    id: number
    name: string
    type: string
  }
}

/**
 * Standard OAuth 2.0 error codes surfaced by the Basecamp token endpoint.
 * Propagated from the service worker so upstream code can branch on them
 * (invalid_grant => user needs reauth; invalid_client => must reconfigure).
 */
export type BasecampOAuthErrorCode = 'invalid_grant' | 'invalid_client'

export class BasecampApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public errorCode?: BasecampOAuthErrorCode
  ) {
    super(message)
    this.name = 'BasecampApiError'
  }
}

// ============ Auth Helpers ============

/**
 * Create headers for Basecamp API requests
 */
function createHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
}

/**
 * Build the OAuth authorization URL
 */
export function getAuthorizationUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  return `${BASECAMP_AUTH_BASE}/authorization/new?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<BasecampTokenResponse> {
  const { data } = await swFetch(`${BASECAMP_AUTH_BASE}/authorization/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })
  
  return data as BasecampTokenResponse
}

/**
 * Refresh an access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<BasecampTokenResponse> {
  const { data } = await swFetch(`${BASECAMP_AUTH_BASE}/authorization/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  
  return data as BasecampTokenResponse
}

/**
 * Get authorization details (identity and accounts)
 */
export async function getAuthorization(accessToken: string): Promise<BasecampAuthResponse> {
  const { data } = await swFetch(`${BASECAMP_AUTH_BASE}/authorization.json`, {
    headers: createHeaders(accessToken),
  })
  
  return data as BasecampAuthResponse
}

/**
 * Validate access token by fetching authorization
 */
export async function validateAccessToken(accessToken: string): Promise<BasecampAuthResponse> {
  return getAuthorization(accessToken)
}

// ============ Projects ============

/**
 * Get all projects for an account
 */
export async function getProjects(
  accessToken: string,
  accountId: number
): Promise<BasecampProject[]> {
  const { data } = await swFetch(`${BASECAMP_API_BASE}/${accountId}/projects.json`, {
    headers: createHeaders(accessToken),
  })
  
  return data as BasecampProject[]
}

/**
 * Get a single project
 */
export async function getProject(
  accessToken: string,
  accountId: number,
  projectId: number
): Promise<BasecampProject> {
  const { data } = await swFetch(`${BASECAMP_API_BASE}/${accountId}/projects/${projectId}.json`, {
    headers: createHeaders(accessToken),
  })
  
  return data as BasecampProject
}

// ============ To-do Sets and Lists ============

/**
 * Get the to-do set for a project (from the dock)
 */
export function getTodoSetFromProject(project: BasecampProject): BasecampDockItem | undefined {
  return project.dock.find(item => item.name === 'todoset' && item.enabled)
}

/**
 * Get to-do set details
 */
export async function getTodoSet(
  accessToken: string,
  todoSetUrl: string
): Promise<BasecampTodoSet> {
  const { data } = await swFetch(todoSetUrl, {
    headers: createHeaders(accessToken),
  })
  
  return data as BasecampTodoSet
}

/**
 * Get all to-do lists in a to-do set
 */
export async function getTodoLists(
  accessToken: string,
  todoListsUrl: string
): Promise<BasecampTodoList[]> {
  const { data } = await swFetch(todoListsUrl, {
    headers: createHeaders(accessToken),
  })
  
  return data as BasecampTodoList[]
}

/**
 * Get to-do lists for a project
 */
export async function getProjectTodoLists(
  accessToken: string,
  accountId: number,
  projectId: number
): Promise<BasecampTodoList[]> {
  // First get the project to find the todoset
  const project = await getProject(accessToken, accountId, projectId)
  const todoSetDock = getTodoSetFromProject(project)
  
  if (!todoSetDock) {
    return [] // No to-do set enabled for this project
  }
  
  // Get the todoset details
  const todoSet = await getTodoSet(accessToken, todoSetDock.url)
  
  // Get the to-do lists
  return getTodoLists(accessToken, todoSet.todolists_url)
}

// ============ To-dos ============

/**
 * Create a to-do in a to-do list
 */
export async function createTodo(
  accessToken: string,
  accountId: number,
  todoListId: number,
  todo: {
    content: string
    description?: string
    assignee_ids?: number[]
    notify?: boolean
    due_on?: string
    starts_on?: string
  }
): Promise<BasecampTodo> {
  const { data } = await swFetch(
    `${BASECAMP_API_BASE}/${accountId}/todolists/${todoListId}/todos.json`,
    {
      method: 'POST',
      headers: createHeaders(accessToken),
      body: JSON.stringify(todo),
    }
  )
  
  return data as BasecampTodo
}

// ============ Attachments ============

/**
 * Upload an attachment (image or file)
 * 
 * Basecamp requires sending the raw binary data with Content-Type header.
 * Note: Content-Length is automatically set by the browser/fetch implementation.
 */
export async function uploadAttachment(
  accessToken: string,
  accountId: number,
  filename: string,
  contentType: string,
  data: ArrayBuffer
): Promise<BasecampAttachment> {
  const response = await swFetch(
    `${BASECAMP_API_BASE}/${accountId}/attachments.json?name=${encodeURIComponent(filename)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': USER_AGENT,
        'Content-Type': contentType,
        // Content-Length is set automatically by fetch
      },
      body: data,
    }
  )
  
  return response.data as BasecampAttachment
}

/**
 * Convert data URL to ArrayBuffer
 */
export function dataUrlToArrayBuffer(dataUrl: string): { buffer: ArrayBuffer; mimeType: string } {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
  
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  
  return { buffer: bytes.buffer, mimeType }
}

/**
 * Upload an image from a data URL and create a to-do with it embedded
 */
export async function uploadImageAndCreateTodo(
  accessToken: string,
  accountId: number,
  todoListId: number,
  imageDataUrl: string,
  title: string,
  metadataHtml: string,
  description?: string
): Promise<{ todo: BasecampTodo; todoUrl: string }> {
  // Convert data URL to binary
  const { buffer, mimeType } = dataUrlToArrayBuffer(imageDataUrl)
  const filename = `screenshot-${Date.now()}.png`
  
  // Upload the attachment
  const attachment = await uploadAttachment(
    accessToken,
    accountId,
    filename,
    mimeType,
    buffer
  )
  
  // Build the description with metadata and embedded image
  // Basecamp uses <bc-attachment> tags for embedding
  const fullDescription = `
${metadataHtml}
${description ? `<p>${description}</p>` : ''}
<bc-attachment sgid="${attachment.attachable_sgid}"></bc-attachment>
`.trim()

  // Create the to-do
  const todo = await createTodo(accessToken, accountId, todoListId, {
    content: title,
    description: fullDescription,
  })
  
  return { todo, todoUrl: todo.app_url }
}

// ============ Card Tables ============

/**
 * Get the card table (kanban board) for a project (from the dock)
 */
export function getCardTableFromProject(project: BasecampProject): BasecampDockItem | undefined {
  return project.dock.find(item => item.name === 'kanban_board' && item.enabled)
}

/**
 * Get card table details including all columns
 */
export async function getCardTable(
  accessToken: string,
  cardTableUrl: string
): Promise<BasecampCardTable> {
  const { data } = await swFetch(cardTableUrl, {
    headers: createHeaders(accessToken),
  })
  
  return data as BasecampCardTable
}

/**
 * Get card table columns for a project
 */
export async function getProjectCardColumns(
  accessToken: string,
  accountId: number,
  projectId: number
): Promise<BasecampCardColumn[]> {
  // First get the project to find the card table
  const project = await getProject(accessToken, accountId, projectId)
  const cardTableDock = getCardTableFromProject(project)
  
  if (!cardTableDock) {
    return [] // No card table enabled for this project
  }
  
  // Get the card table details (includes columns as 'lists')
  const cardTable = await getCardTable(accessToken, cardTableDock.url)
  
  return cardTable.lists || []
}

// ============ Cards ============

/**
 * Create a card in a card table column
 */
export async function createCard(
  accessToken: string,
  accountId: number,
  columnId: number,
  card: {
    title: string
    content?: string
    due_on?: string
    notify?: boolean
  }
): Promise<BasecampCard> {
  const { data } = await swFetch(
    `${BASECAMP_API_BASE}/${accountId}/card_tables/lists/${columnId}/cards.json`,
    {
      method: 'POST',
      headers: createHeaders(accessToken),
      body: JSON.stringify(card),
    }
  )
  
  return data as BasecampCard
}

/**
 * Upload an image from a data URL and create a card with it embedded
 */
export async function uploadImageAndCreateCard(
  accessToken: string,
  accountId: number,
  columnId: number,
  imageDataUrl: string,
  title: string,
  metadataHtml: string,
  description?: string
): Promise<{ card: BasecampCard; cardUrl: string }> {
  // Convert data URL to binary
  const { buffer, mimeType } = dataUrlToArrayBuffer(imageDataUrl)
  const filename = `screenshot-${Date.now()}.png`
  
  // Upload the attachment
  const attachment = await uploadAttachment(
    accessToken,
    accountId,
    filename,
    mimeType,
    buffer
  )
  
  // Build the content with metadata and embedded image
  // Basecamp uses <bc-attachment> tags for embedding
  const fullContent = `
${metadataHtml}
${description ? `<p>${description}</p>` : ''}
<bc-attachment sgid="${attachment.attachable_sgid}"></bc-attachment>
`.trim()

  // Create the card
  const card = await createCard(accessToken, accountId, columnId, {
    title,
    content: fullContent,
  })
  
  return { card, cardUrl: card.app_url }
}
