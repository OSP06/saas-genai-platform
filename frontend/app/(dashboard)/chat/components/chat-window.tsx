'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { FormEvent, Dispatch, SetStateAction } from 'react'
import { Send, Loader2, Sparkles, BookOpen, Bot, MessageSquare, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { MessageBubble } from './message-bubble'
import { chatApi } from '@/lib/api-client'
import type { ChatMessage, ChatMode } from '../page'

interface ChatWindowProps {
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  mode: ChatMode
  conversationId: string | undefined
  setConversationId: Dispatch<SetStateAction<string | undefined>>
}

const modeConfig = {
  auto: { icon: Sparkles, label: 'Auto Router', color: 'text-primary' },
  rag: { icon: BookOpen, label: 'RAG Mode', color: 'text-chart-1' },
  agent: { icon: Bot, label: 'Agent Mode', color: 'text-chart-2' },
  llm: { icon: MessageSquare, label: 'Direct LLM', color: 'text-chart-3' },
}

export function ChatWindow({
  messages,
  setMessages,
  mode,
  conversationId,
  setConversationId,
}: ChatWindowProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const submitMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const userContent = input.trim()
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      statusText: 'Thinking…',
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, assistantMessage])

    try {
      for await (const event of chatApi.stream({
        message: userContent,
        mode,
        conversationId,
      })) {
        if (event.type === 'status') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, statusText: event.message ?? '' } : m
            )
          )
        } else if (event.type === 'delta') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    statusText: undefined,
                    content: event.content ?? m.content + (event.delta ?? ''),
                  }
                : m
            )
          )
        } else if (event.type === 'done') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: event.content ?? m.content,
                    isStreaming: false,
                    statusText: undefined,
                    mode: (event.mode as ChatMode) ?? mode,
                    citations: event.citations ?? [],
                    metadata: event.metadata,
                  }
                : m
            )
          )
          if (!conversationId && event.metadata) {
            try {
              const convs = await chatApi.listConversations()
              if (convs.conversations.length > 0) {
                setConversationId(convs.conversations[0].id)
              }
            } catch {
              // non-critical
            }
          }
          break
        } else if (event.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: event.message ?? 'An error occurred.',
                    isStreaming: false,
                    statusText: undefined,
                  }
                : m
            )
          )
          break
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `Connection error: ${String(err)}`,
                isStreaming: false,
                statusText: undefined,
              }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, mode, conversationId, setMessages, setConversationId])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      submitMessage()
    },
    [submitMessage]
  )

  const handleClear = useCallback(async () => {
    if (conversationId) {
      try {
        await chatApi.deleteHistory({ conversationId })
      } catch {
        // best-effort
      }
    }
    setMessages([])
    setConversationId(undefined)
  }, [conversationId, setMessages, setConversationId])

  const config = modeConfig[mode]
  const ModeIcon = config.icon

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center gap-2">
          <ModeIcon className={`h-4 w-4 ${config.color}`} />
          <CardTitle className="text-base">{config.label}</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {messages.filter((m) => m.role !== 'system').length} messages
          </Badge>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <div className="mb-4 rounded-full bg-muted p-4">
                    <Sparkles className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium">Smart Chat Router</h3>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Queries are automatically routed to the best handler — RAG for document queries,
                    Agents for complex tasks, or direct LLM for general chat.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {[
                      'Summarize my uploaded documents',
                      'What trends are in my data?',
                      'Explain quantum computing',
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'auto'
                  ? "Ask anything — I'll route to the best handler…"
                  : mode === 'rag'
                    ? 'Query your knowledge base…'
                    : mode === 'agent'
                      ? 'Describe a task for the agent…'
                      : 'Chat directly with the AI…'
              }
              className="min-h-11 flex-1 resize-none"
              rows={1}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Shift+Enter for newline · Enter to send
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
