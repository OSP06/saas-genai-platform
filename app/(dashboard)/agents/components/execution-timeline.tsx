'use client'

import { CheckCircle2, Circle, Loader2, XCircle, Clock } from 'lucide-react'
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

export function ExecutionTimeline({ task }: ExecutionTimelineProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Execution Timeline</CardTitle>
          {task && (
            <Badge
              variant={
                task.status === 'running'
                  ? 'default'
                  : task.status === 'completed'
                    ? 'secondary'
                    : task.status === 'failed'
                      ? 'destructive'
                      : 'outline'
              }
            >
              {task.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[200px]">
          {!task ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Clock className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No task running</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Start a task to see the execution timeline
              </p>
            </div>
          ) : (
            <div className="p-4">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3.5 top-0 h-full w-px bg-border" />

                {/* Steps */}
                <div className="flex flex-col gap-4">
                  {task.steps.map((step, index) => {
                    const config = statusConfig[step.status]
                    const Icon = config.icon
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative flex items-start gap-3 pl-8"
                      >
                        {/* Icon */}
                        <div
                          className={`absolute left-0 rounded-full bg-background p-0.5 ${config.color}`}
                        >
                          <Icon
                            className={`h-6 w-6 ${step.status === 'running' ? 'animate-spin' : ''}`}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{step.name}</p>
                            <Badge variant={config.badge} className="text-[10px]">
                              {step.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {step.description}
                          </p>
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
