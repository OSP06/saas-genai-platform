'use client'

import { BookOpen, Bot, MessageSquare, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ChatMode } from '../page'

interface ModeSelectorProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

const modes = [
  {
    id: 'auto' as const,
    label: 'Auto',
    description: 'Smart routing based on query',
    icon: Sparkles,
  },
  {
    id: 'rag' as const,
    label: 'RAG',
    description: 'Query knowledge base',
    icon: BookOpen,
  },
  {
    id: 'agent' as const,
    label: 'Agent',
    description: 'Multi-step task execution',
    icon: Bot,
  },
  {
    id: 'llm' as const,
    label: 'Direct LLM',
    description: 'Chat directly with AI',
    icon: MessageSquare,
  },
]

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={cn(
                'flex flex-col items-start rounded-lg border border-transparent p-3 text-left transition-all',
                'hover:bg-muted/50',
                mode === m.id && 'border-primary bg-muted'
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <m.icon
                  className={cn(
                    'h-4 w-4',
                    mode === m.id ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="text-sm font-medium">{m.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
