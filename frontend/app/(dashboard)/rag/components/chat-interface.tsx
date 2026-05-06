'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, BookOpen } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ragApi } from '@/lib/api-client'
import type { Message, Citation } from '../page'

interface ChatInterfaceProps {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  onCitationClick: (citations: Citation[]) => void
}

export function ChatInterface({ messages, setMessages, onCitationClick }: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim() || isLoading) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: input.trim(),
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setIsLoading(true)

      const assistantId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true },
      ])

      try {
        const result = await ragApi.query({ query: userMessage.content, maxCitations: 5 })

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: result.answer,
                  citations: result.citations,
                  isLoading: false,
                }
              : m
          )
        )
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error querying knowledge base: ${String(err)}`,
                  isLoading: false,
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
    },
    [input, isLoading, setMessages]
  )

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">RAG Query Interface</CardTitle>
          <Badge variant="secondary" className="ml-auto text-xs">
            Semantic search
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
                  className="flex flex-col items-center justify-center py-12 text-center"
                >
                  <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Ask questions about your knowledge base
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Responses include citations from relevant documents
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      'Summarize the main topics',
                      'What are the key findings?',
                      'List the important dates',
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Searching knowledge base…
                        </span>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-3 border-t border-border/50 pt-3">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onCitationClick(message.citations!)}
                              className="h-7 text-xs"
                            >
                              <BookOpen className="mr-1.5 h-3 w-3" />
                              {message.citations.length} citation{message.citations.length !== 1 ? 's' : ''}
                            </Button>
                          </div>
                        )}
                        {message.role === 'assistant' &&
                          (!message.citations || message.citations.length === 0) &&
                          message.content.includes("couldn't find") && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              No relevant chunks found above similarity threshold. Try uploading more documents or rephrasing your query.
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your documents…"
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
        </div>
      </CardContent>
    </Card>
  )
}
