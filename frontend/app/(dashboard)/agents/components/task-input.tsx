'use client'

import { useState } from 'react'
import { Send, Loader2, Sparkles, StopCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface TaskInputProps {
  onSubmit: (prompt: string) => void
  onCancel?: () => void
  isRunning: boolean
  taskId?: string
}

const exampleTasks = [
  'Research the top 3 vector databases and compare them',
  'Summarize the documents in my knowledge base',
  'Find recent AI industry trends and key players',
  'Analyze the pros and cons of microservices architecture',
]

export function TaskInput({ onSubmit, onCancel, isRunning }: TaskInputProps) {
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isRunning) return
    onSubmit(prompt.trim())
    setPrompt('')
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-2 rounded-lg bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">Describe your task</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want the AI agent to research, analyze, or execute…"
                className="min-h-20 resize-none"
                disabled={isRunning}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {exampleTasks.map((task) => (
                <Button
                  key={task}
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setPrompt(task)}
                  disabled={isRunning}
                  className="text-xs"
                >
                  {task}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 shrink-0">
              {isRunning && onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className="text-destructive hover:text-destructive"
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!prompt.trim() || isRunning}>
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Run Agent
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
