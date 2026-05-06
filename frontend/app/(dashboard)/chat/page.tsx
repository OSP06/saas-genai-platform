'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ModeSelector } from './components/mode-selector'
import { ChatWindow } from './components/chat-window'
import type { Citation } from '@/lib/types'

export type ChatMode = 'auto' | 'rag' | 'agent' | 'llm'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  mode?: ChatMode
  isStreaming?: boolean
  statusText?: string
  timestamp: Date
  metadata?: {
    model?: string
    latency_ms?: number
    tokens?: number
    fallback?: boolean
  }
  citations?: Citation[]
}

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('auto')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col gap-4"
    >
      <ModeSelector mode={mode} onModeChange={setMode} />
      <ChatWindow
        messages={messages}
        setMessages={setMessages}
        mode={mode}
        conversationId={conversationId}
        setConversationId={setConversationId}
      />
    </motion.div>
  )
}
