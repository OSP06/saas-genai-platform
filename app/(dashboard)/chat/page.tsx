'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ModeSelector } from './components/mode-selector'
import { ChatWindow } from './components/chat-window'

export type ChatMode = 'auto' | 'rag' | 'agent' | 'llm'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  mode?: ChatMode
  isStreaming?: boolean
  timestamp: Date
}

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('auto')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col gap-4"
    >
      {/* Mode Selector */}
      <ModeSelector mode={mode} onModeChange={setMode} />

      {/* Chat Window */}
      <ChatWindow
        messages={messages}
        setMessages={setMessages}
        mode={mode}
      />
    </motion.div>
  )
}
