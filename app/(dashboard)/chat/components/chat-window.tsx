'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, BookOpen, Bot, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { MessageBubble } from './message-bubble'
import type { ChatMessage, ChatMode } from '../page'

interface ChatWindowProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  mode: ChatMode
}

const modeConfig = {
  auto: { icon: Sparkles, label: 'Auto Router', color: 'text-primary' },
  rag: { icon: BookOpen, label: 'RAG Mode', color: 'text-chart-1' },
  agent: { icon: Bot, label: 'Agent Mode', color: 'text-chart-2' },
  llm: { icon: MessageSquare, label: 'Direct LLM', color: 'text-chart-3' },
}

const mockResponses: Record<ChatMode, string> = {
  auto: `I've analyzed your query and routed it to the most appropriate handler.

Based on the context, I'm using the **RAG system** to search your knowledge base for relevant information.

Here's what I found in your documents regarding market analysis and competitive positioning. The data suggests strong growth potential in the enterprise segment with key opportunities in automation and AI-assisted workflows.`,
  rag: `Based on your knowledge base documents, here are the key findings:

**Market Overview:**
- Total addressable market: $45B by 2025
- Year-over-year growth rate: 23%
- Primary segments: Enterprise (60%), Mid-market (30%), SMB (10%)

**Competitive Landscape:**
Your documents reference 5 main competitors, with varying strengths in pricing, features, and market presence. The key differentiators appear to be AI capabilities and integration options.`,
  agent: `I'll execute this as a multi-step task:

**Step 1: Data Collection** - Gathering relevant market data
**Step 2: Analysis** - Processing competitive intelligence
**Step 3: Synthesis** - Compiling findings

The analysis is complete. Based on 12 data sources, the market shows strong potential with 23% YoY growth. Recommend focusing on enterprise features and API extensibility.`,
  llm: `That's a great question! Here's my analysis:

The AI and automation market continues to show strong growth trajectories. Key trends include:

1. **Enterprise Adoption** - Large organizations are increasingly investing in AI infrastructure
2. **Integration Focus** - Buyers prioritize solutions that integrate with existing workflows
3. **Security & Compliance** - Growing emphasis on data privacy and regulatory compliance

Would you like me to elaborate on any of these points?`,
}

export function ChatWindow({ messages, setMessages, mode }: ChatWindowProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const simulateStreaming = (messageId: string, fullContent: string, detectedMode: ChatMode) => {
    let index = 0
    const interval = setInterval(() => {
      if (index >= fullContent.length) {
        clearInterval(interval)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isStreaming: false } : m
          )
        )
        setIsLoading(false)
        return
      }

      const chunkSize = Math.floor(Math.random() * 5) + 3
      index += chunkSize

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: fullContent.slice(0, index), mode: detectedMode }
            : m
        )
      )
    }, 30)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Determine the actual mode (auto routing simulation)
    const detectedMode = mode === 'auto' 
      ? (['rag', 'agent', 'llm'] as const)[Math.floor(Math.random() * 3)]
      : mode

    // Create streaming message
    const assistantId = Math.random().toString(36).substring(7)
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      mode: detectedMode,
      isStreaming: true,
      timestamp: new Date(),
    }

    setTimeout(() => {
      setMessages((prev) => [...prev, assistantMessage])
      simulateStreaming(assistantId, mockResponses[detectedMode], detectedMode)
    }, 500)
  }

  const config = modeConfig[mode]
  const ModeIcon = config.icon

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center gap-2">
          <ModeIcon className={`h-4 w-4 ${config.color}`} />
          <CardTitle className="text-base">{config.label}</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {messages.length} messages
          </Badge>
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
                    Your queries are automatically routed to the best handler - RAG for document queries,
                    Agents for complex tasks, or direct LLM for general chat.
                  </p>
                </motion.div>
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {mode === 'auto' ? 'Routing query...' : 'Thinking...'}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'auto'
                  ? 'Ask anything - I\'ll route to the best handler...'
                  : mode === 'rag'
                    ? 'Query your knowledge base...'
                    : mode === 'agent'
                      ? 'Describe a task for the agent...'
                      : 'Chat directly with the AI...'
              }
              className="min-h-[44px] flex-1 resize-none"
              rows={1}
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
        </div>
      </CardContent>
    </Card>
  )
}
