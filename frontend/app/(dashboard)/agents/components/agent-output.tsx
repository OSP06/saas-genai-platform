'use client'

import { FileText, Copy, Download, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AgentTask } from '../page'
import { useState } from 'react'

interface AgentOutputProps {
  task: AgentTask | null
}

export function AgentOutput({ task }: AgentOutputProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (task?.output) {
      navigator.clipboard.writeText(task.output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Output</CardTitle>
          {task?.output && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-chart-2" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <AnimatePresence mode="wait">
            {!task || !task.output ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center p-8 text-center"
              >
                <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No output yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Output will appear here when the task completes
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="output"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-4"
              >
                <div className="rounded-lg bg-muted/50 p-4">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {task.output}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
