'use client'

import { useState } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface TaskInputProps {
  onSubmit: (prompt: string) => void
  isRunning: boolean
}

const exampleTasks = [
  'Research competitors in the AI SaaS market',
  'Analyze our Q4 performance data',
  'Draft a product roadmap presentation',
  'Summarize recent customer feedback',
]

export function TaskInput({ onSubmit, isRunning }: TaskInputProps) {
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isRunning) return
    onSubmit(prompt)
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
              <label className="mb-1.5 block text-sm font-medium">
                Describe your task
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter a task for the AI agent to complete..."
                className="min-h-[80px] resize-none"
                disabled={isRunning}
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
            <Button type="submit" disabled={!prompt.trim() || isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Run Agent
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
