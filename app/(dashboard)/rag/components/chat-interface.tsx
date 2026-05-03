'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, BookOpen } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import type { Message, Citation } from '../page'

interface ChatInterfaceProps {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  onCitationClick: (citations: Citation[]) => void
}

const mockCitations: Citation[] = [
  {
    id: '1',
    documentId: '1',
    documentName: 'Q4 Financial Report 2024.pdf',
    content: 'Revenue increased by 23% compared to Q3, driven primarily by expansion in the enterprise segment. The APAC region showed particularly strong growth at 34% YoY.',
    page: 12,
    relevanceScore: 0.94,
  },
  {
    id: '2',
    documentId: '1',
    documentName: 'Q4 Financial Report 2024.pdf',
    content: 'Operating expenses were reduced by 8% through strategic cost optimization initiatives while maintaining headcount stability.',
    page: 18,
    relevanceScore: 0.87,
  },
  {
    id: '3',
    documentId: '4',
    documentName: 'Customer Research Summary.pdf',
    content: 'Customer satisfaction scores reached an all-time high of 4.7/5, with enterprise customers reporting significant improvements in platform reliability.',
    page: 5,
    relevanceScore: 0.82,
  },
]

export function ChatInterface({ messages, setMessages, onCitationClick }: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Simulate API call with streaming effect
    setTimeout(() => {
      const assistantMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `Based on the documents in your knowledge base, here's what I found:\n\nThe Q4 2024 financial results show strong performance across key metrics. Revenue increased by 23% compared to the previous quarter, with the enterprise segment being the primary growth driver. The APAC region demonstrated exceptional growth at 34% year-over-year.\n\nOperating efficiency also improved, with expenses reduced by 8% through strategic cost optimization while maintaining team stability.\n\nCustomer satisfaction reached record levels at 4.7/5, particularly among enterprise clients who noted significant platform reliability improvements.`,
        citations: mockCitations,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">RAG Query Interface</CardTitle>
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
                    Ask questions about your knowledge base documents
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Responses will include citations from relevant documents
                  </p>
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
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onCitationClick(message.citations || [])}
                          className="h-7 text-xs"
                        >
                          <BookOpen className="mr-1.5 h-3 w-3" />
                          View {message.citations.length} citations
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Searching knowledge base...
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
              placeholder="Ask a question about your documents..."
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
