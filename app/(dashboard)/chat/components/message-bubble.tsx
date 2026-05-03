'use client'

import { BookOpen, Bot, MessageSquare, Sparkles, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import type { ChatMessage, ChatMode } from '../page'

interface MessageBubbleProps {
  message: ChatMessage
}

const modeConfig: Record<ChatMode, { icon: typeof Sparkles; label: string; color: string }> = {
  auto: { icon: Sparkles, label: 'Auto', color: 'bg-primary/10 text-primary' },
  rag: { icon: BookOpen, label: 'RAG', color: 'bg-chart-1/10 text-chart-1' },
  agent: { icon: Bot, label: 'Agent', color: 'bg-chart-2/10 text-chart-2' },
  llm: { icon: MessageSquare, label: 'LLM', color: 'bg-chart-3/10 text-chart-3' },
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Avatar for assistant */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <div
        className={`flex max-w-[75%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
      >
        {/* Mode badge for assistant messages */}
        {!isUser && message.mode && (
          <div className="flex items-center gap-2">
            {(() => {
              const config = modeConfig[message.mode]
              const ModeIcon = config.icon
              return (
                <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                  <ModeIcon className="mr-1 h-3 w-3" />
                  {config.label}
                </Badge>
              )
            })()}
          </div>
        )}

        {/* Message content */}
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
            {message.isStreaming && (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
            )}
          </p>
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground">
          {message.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Avatar for user */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </motion.div>
  )
}
