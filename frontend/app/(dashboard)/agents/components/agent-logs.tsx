'use client'

import { useEffect, useRef } from 'react'
import { Terminal, Info, AlertTriangle, XCircle, Bug } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { LogEntry } from '../page'

interface AgentLogsProps {
  logs: LogEntry[]
}

const levelConfig = {
  info: { icon: Info, color: 'text-chart-1', bg: 'bg-chart-1/10' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  debug: { icon: Bug, color: 'text-muted-foreground', bg: 'bg-muted' },
}

export function AgentLogs({ logs }: AgentLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Agent Logs</CardTitle>
          </div>
          <Badge variant="secondary">{logs.length} entries</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden bg-muted/30 p-0">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Terminal className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No logs yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Live logs will stream here as the agent runs
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {logs.map((log) => {
                  const config = levelConfig[log.level] ?? levelConfig.info
                  const Icon = config.icon
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 py-1"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        [{formatTime(log.timestamp)}]
                      </span>
                      <span className={`shrink-0 ${config.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 uppercase text-[10px] ${config.bg} ${config.color}`}
                      >
                        {log.level}
                      </span>
                      <span className="text-foreground break-all">{log.message}</span>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
