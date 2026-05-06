// ── Shared ────────────────────────────────────────────────────────────────────

export interface Citation {
  id: string
  documentId: string
  documentName: string
  content: string
  page?: number
  relevanceScore: number
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatSendRequest {
  message: string
  mode?: 'auto' | 'rag' | 'agent' | 'llm'
  conversationId?: string
}

export interface ChatMessageResponse {
  id: string
  role: string
  content: string
  mode?: string
  citations?: Citation[]
  metadata: Record<string, unknown>
  timestamp: string
}

export interface ChatHistoryResponse {
  messages: ChatMessageResponse[]
  conversationId: string
  totalCount: number
}

export interface ChatDeleteRequest {
  conversationId?: string
}

export interface ChatDeleteResponse {
  success: boolean
}

export interface ConversationSummary {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ConversationsResponse {
  conversations: ConversationSummary[]
}

export type SSEEventType = 'status' | 'delta' | 'done' | 'error'

export interface SSEEvent {
  type: SSEEventType
  message?: string
  delta?: string
  content?: string
  role?: string
  mode?: string
  citations?: Citation[]
  metadata?: {
    model?: string
    latency_ms?: number
    tokens?: number
    fallback?: boolean
  }
}

// ── RAG ───────────────────────────────────────────────────────────────────────

export interface DocumentUploadResponse {
  id: string
  name: string
  size: number
  status: string
  createdAt: string
}

export interface DocumentListItem {
  id: string
  name: string
  type: string
  size: string
  chunks: number
  uploadedAt: string
}

export interface DocumentDeleteResponse {
  success: boolean
}

export interface DocumentStatusResponse {
  id: string
  status: 'pending' | 'processing' | 'ready' | 'error'
  progress?: number
  chunksCreated?: number
  error?: string
}

export interface SourceSnippet {
  snippet: string
  score: number
}

export interface RAGQueryRequest {
  query: string
  documentIds?: string[]
  maxCitations?: number
}

export interface RAGQueryResponse {
  answer: string
  citations: Citation[]
  sources: SourceSnippet[]
}

// ── Agents ────────────────────────────────────────────────────────────────────

export interface AgentExecuteRequest {
  task: string
  tools?: string[]
  maxSteps?: number
}

export interface AgentExecuteResponse {
  taskId: string
  status: string
  createdAt: string
}

export interface AgentStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  output?: string
}

export interface AgentTaskDetail {
  id: string
  prompt: string
  status: string
  steps: AgentStep[]
  output?: string
  createdAt: string
}

export interface AgentTasksListResponse {
  tasks: AgentTaskDetail[]
}

export interface AgentCancelResponse {
  success: boolean
}

export interface AgentLogEvent {
  type: string
  timestamp: string
  level: 'info' | 'debug' | 'warn' | 'error'
  message: string
  stepId?: string
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface AnalyticsTrends {
  requestsTrend: number
  costTrend: number
  latencyTrend: number
}

export interface AnalyticsOverviewResponse {
  totalRequests: number
  totalCost: number
  avgLatency: number
  activeUsers: number
  trends: AnalyticsTrends
}

export interface UsageDataPoint {
  date: string
  rag: number
  agent: number
  chat: number
}

export interface CostDataPoint {
  month: string
  tokens: number
  compute: number
  storage: number
}

export interface LatencyDataPoint {
  time: string
  p50: number
  p95: number
  p99: number
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface ApiConfiguration {
  openaiApiKey: string
  anthropicApiKey: string
  vectorDbUrl: string
  webhookUrl?: string
}

export interface ModelConfiguration {
  ragQueryModel: string
  agentExecutionModel: string
  embeddingModel: string
}

export interface NotificationSettings {
  agentTaskCompletions: boolean
  documentProcessing: boolean
  usageAlerts: boolean
  errorNotifications: boolean
}

export interface PreferenceSettings {
  theme: string
  compactMode: boolean
  showTimestamps: boolean
}

export interface SettingsResponse {
  apiConfiguration: ApiConfiguration
  modelConfiguration: ModelConfiguration
  notifications: NotificationSettings
  preferences: PreferenceSettings
}

export interface SettingsUpdateRequest {
  apiConfiguration?: Partial<ApiConfiguration>
  modelConfiguration?: Partial<ModelConfiguration>
  notifications?: Partial<NotificationSettings>
  preferences?: Partial<PreferenceSettings>
}

export interface SettingsUpdateResponse {
  success: boolean
}

export interface ApiKeyCreateRequest {
  name: string
  permissions?: string[]
}

export interface ApiKeyCreateResponse {
  id: string
  key: string
  createdAt: string
  permissions: string[]
}

export interface ApiKeyDeleteResponse {
  success: boolean
}

export interface ApiKeySummary {
  id: string
  name: string
  keyPreview: string
  permissions: string[]
  createdAt: string
}
