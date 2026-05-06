'use client'

import { CheckCircle2, Circle, Loader2, XCircle, Clock, Ban } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AgentTask } from '../page'

interface ExecutionTimelineProps {
  task: AgentTask | null
}

const statusConfig = {
  pending: { icon: Circle, color: 'text-muted-foreground', badge: 'secondary' as const },
  running: { icon: Loader2, color: 'text-chart-1', badge: 'default' as const },
  completed: { icon: CheckCircle2, color: 'text-chart-2', badge: 'default' as const },
  failed: { icon: XCircle, color: 'text-destructive', badge: 'destructive' as const },
}

const taskStatusBadge: Record<AgentTask['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  idle: { variant: 'outline', label: 'idle' },
  running: { variant: 'default', label: 'running' },
  completed: { variant: 'secondary', label: 'completed' },
  failed: { variant: 'destructive', label: 'failed' },
  cancelled: { variant: 'outline', label: 'cancelled' },
}

export function ExecutionTimeline({ task }: ExecutionTimelineProps) {
  const statusBadge = task ? taskStatusBadge[task.status] : null

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Execution Timeline</CardTitle>
          {statusBadge && (
            <div className="flex items-center gap-2">
              {task?.status === 'cancelled' && (
                <Ban className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[200px]">
          {!task || task.steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Clock className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {task ? 'Planning steps…' : 'No task running'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {!task && 'Start a task to see the execution timeline'}
              </p>
            </div>
          ) : (
            <div className="p-4">
              <div className="relative">
                <div className="absolute left-3.5 top-0 h-full w-px bg-border" />
                <div className="flex flex-col gap-4">
                  {task.steps.map((step, index) => {
                    const config = statusConfig[step.status] ?? statusConfig.pending
                    const Icon = config.icon
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="relative flex items-start gap-3 pl-8"
                      >
                        <div className={`absolute left-0 rounded-full bg-background p-0.5 ${config.color}`}>
                          <Icon
                            className={`h-6 w-6 ${step.status === 'running' ? 'animate-spin' : ''}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{step.name}</p>
                            <Badge variant={config.badge} className="text-[10px]">
                              {step.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {step.description}
                          </p>
                          {step.completedAt && step.startedAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {(
                                (new Date(step.completedAt).getTime() -
                                  new Date(step.startedAt).getTime()) /
                                1000
                              ).toFixed(1)}
                              s
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
