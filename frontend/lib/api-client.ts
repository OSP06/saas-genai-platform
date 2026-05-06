import { API_BASE_URL } from './config'
import type {
  AgentCancelResponse,
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentLogEvent,
  AgentTaskDetail,
  AgentTasksListResponse,
  AnalyticsOverviewResponse,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  ApiKeyDeleteResponse,
  ApiKeySummary,
  ChatDeleteRequest,
  ChatDeleteResponse,
  ChatHistoryResponse,
  ChatSendRequest,
  ConversationsResponse,
  CostDataPoint,
  DocumentDeleteResponse,
  DocumentListItem,
  DocumentStatusResponse,
  DocumentUploadResponse,
  LatencyDataPoint,
  RAGQueryRequest,
  RAGQueryResponse,
  SSEEvent,
  SettingsResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
  UsageDataPoint,
} from './types'

// ── Base fetch helper ─────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function* chatStream(body: ChatSendRequest): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${API_BASE_URL}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) throw new Error(`Chat stream failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as SSEEvent
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}

export const chatApi = {
  stream: chatStream,

  listConversations: () =>
    apiFetch<ConversationsResponse>('/api/chat/conversations'),

  getHistory: (conversationId: string, limit = 50, offset = 0) =>
    apiFetch<ChatHistoryResponse>(
      `/api/chat/history?conversation_id=${conversationId}&limit=${limit}&offset=${offset}`
    ),

  deleteHistory: (body: ChatDeleteRequest) =>
    apiFetch<ChatDeleteResponse>('/api/chat/history', {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
}

// ── RAG ───────────────────────────────────────────────────────────────────────

export const ragApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${API_BASE_URL}/api/rag/upload`, {
      method: 'POST',
      body: form,
    }).then((r) => {
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`)
      return r.json() as Promise<DocumentUploadResponse>
    })
  },

  listDocuments: () =>
    apiFetch<DocumentListItem[]>('/api/rag/documents'),

  getStatus: (documentId: string) =>
    apiFetch<DocumentStatusResponse>(`/api/rag/documents/${documentId}/status`),

  deleteDocument: (documentId: string) =>
    apiFetch<DocumentDeleteResponse>(`/api/rag/documents/${documentId}`, {
      method: 'DELETE',
    }),

  query: (body: RAGQueryRequest) =>
    apiFetch<RAGQueryResponse>('/api/rag/query', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// ── Agents ────────────────────────────────────────────────────────────────────

export const agentsApi = {
  execute: (body: AgentExecuteRequest) =>
    apiFetch<AgentExecuteResponse>('/api/agents/execute', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listTasks: () =>
    apiFetch<AgentTasksListResponse>('/api/agents/tasks'),

  getTask: (taskId: string) =>
    apiFetch<AgentTaskDetail>(`/api/agents/tasks/${taskId}`),

  streamLogs: (taskId: string, onEvent: (e: AgentLogEvent) => void): EventSource => {
    const es = new EventSource(`${API_BASE_URL}/api/agents/tasks/${taskId}/logs`)
    es.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data) as AgentLogEvent)
      } catch {
        // skip malformed events
      }
    }
    return es
  },

  cancelTask: (taskId: string) =>
    apiFetch<AgentCancelResponse>(`/api/agents/tasks/${taskId}/cancel`, {
      method: 'POST',
    }),
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export const analyticsApi = {
  getOverview: () =>
    apiFetch<AnalyticsOverviewResponse>('/api/analytics/overview'),

  getUsage: (params?: { from?: string; to?: string; granularity?: string; module?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return apiFetch<UsageDataPoint[]>(`/api/analytics/usage${qs}`)
  },

  getCosts: (params?: { from?: string; to?: string; granularity?: string; model?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return apiFetch<CostDataPoint[]>(`/api/analytics/costs${qs}`)
  },

  getLatency: (params?: { from?: string; to?: string; granularity?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return apiFetch<LatencyDataPoint[]>(`/api/analytics/latency${qs}`)
  },
}

// ── Settings ──────────────────────────────────────────────────────────────────

export const settingsApi = {
  get: () =>
    apiFetch<SettingsResponse>('/api/settings'),

  update: (body: SettingsUpdateRequest) =>
    apiFetch<SettingsUpdateResponse>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listApiKeys: () =>
    apiFetch<ApiKeySummary[]>('/api/settings/api-keys'),

  createApiKey: (body: ApiKeyCreateRequest) =>
    apiFetch<ApiKeyCreateResponse>('/api/settings/api-keys', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteApiKey: (keyId: string) =>
    apiFetch<ApiKeyDeleteResponse>(`/api/settings/api-keys/${keyId}`, {
      method: 'DELETE',
    }),
}
