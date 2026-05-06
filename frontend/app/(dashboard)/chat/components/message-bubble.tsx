'use client'

import { useState } from 'react'
import {
  BookOpen,
  Bot,
  MessageSquare,
  Sparkles,
  User,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  const [citationsOpen, setCitationsOpen] = useState(false)

  const isThinking = message.isStreaming && !message.content && !!message.statusText

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <div className={`flex max-w-[78%] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Mode + metadata badges */}
        {!isUser && (message.mode || message.metadata) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {message.mode && (() => {
              const cfg = modeConfig[message.mode]
              const ModeIcon = cfg.icon
              return (
                <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                  <ModeIcon className="mr-1 h-3 w-3" />
                  {cfg.label}
                </Badge>
              )
            })()}
            {message.metadata?.model && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                {message.metadata.fallback && (
                  <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                )}
                {message.metadata.model}
                {message.metadata.fallback && (
                  <span className="text-amber-500">fallback</span>
                )}
              </Badge>
            )}
            {message.metadata?.latency_ms !== undefined && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Clock className="h-2.5 w-2.5" />
                {message.metadata.latency_ms < 1000
                  ? `${message.metadata.latency_ms}ms`
                  : `${(message.metadata.latency_ms / 1000).toFixed(1)}s`}
              </Badge>
            )}
            {message.metadata?.tokens !== undefined && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Zap className="h-2.5 w-2.5" />
                {message.metadata.tokens} tok
              </Badge>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          {isThinking ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{message.statusText}</span>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
              {message.isStreaming && message.content && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
              )}
              {message.isStreaming && !message.content && message.statusText && (
                <span className="text-muted-foreground">{message.statusText}</span>
              )}
            </p>
          )}
        </div>

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="w-full">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setCitationsOpen((v) => !v)}
            >
              <BookOpen className="h-3 w-3" />
              {message.citations.length} source{message.citations.length !== 1 ? 's' : ''}
              {citationsOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>

            <AnimatePresence>
              {citationsOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1.5 flex flex-col gap-2">
                    {message.citations.map((c, i) => (
                      <Card key={c.id ?? i} className="border-border/50 bg-muted/30">
                        <CardContent className="p-3">
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <span className="line-clamp-1 text-xs font-medium">
                              {c.documentName}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              {c.page && (
                                <span className="text-[10px] text-muted-foreground">
                                  p.{c.page}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[10px]">
                                {Math.round(c.relevanceScore * 100)}%
                              </Badge>
                            </div>
                          </div>
                          <p className="line-clamp-3 text-xs text-muted-foreground">
                            {c.content}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground">
          {message.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </motion.div>
  )
}
