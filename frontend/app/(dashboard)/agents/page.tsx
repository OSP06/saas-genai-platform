'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TaskInput } from './components/task-input'
import { ExecutionTimeline } from './components/execution-timeline'
import { AgentLogs } from './components/agent-logs'
import { AgentOutput } from './components/agent-output'
import { agentsApi } from '@/lib/api-client'
import type { AgentStep } from '@/lib/types'

export type { AgentStep }

export interface AgentTask {
  id: string
  prompt: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  steps: AgentStep[]
  output?: string
  createdAt: Date
}

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  stepId?: string
}

export default function AgentsPage() {
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  const stopStreaming = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const runAgent = useCallback(
    async (prompt: string) => {
      stopStreaming()

      setLogs([])
      setCurrentTask({
        id: '',
        prompt,
        status: 'running',
        steps: [],
        createdAt: new Date(),
      })

      try {
        // 1. Start the task
        const { taskId } = await agentsApi.execute({ task: prompt, maxSteps: 8 })

        setCurrentTask((prev) => (prev ? { ...prev, id: taskId } : null))

        // 2. Append initial log
        setLogs([
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            level: 'info',
            message: `Task started: "${prompt}"`,
          },
        ])

        // 3. Poll task every 2 s to get updated steps
        pollIntervalRef.current = setInterval(async () => {
          try {
            const task = await agentsApi.getTask(taskId)
            setCurrentTask((prev) =>
              prev
                ? {
                    ...prev,
                    status: task.status as AgentTask['status'],
                    steps: task.steps,
                    output: task.output,
                  }
                : null
            )
            if (
              task.status === 'completed' ||
              task.status === 'failed' ||
              task.status === 'cancelled'
            ) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
          } catch {
            // swallow transient poll errors
          }
        }, 2000)

        // 4. Stream live logs via SSE
        const es = agentsApi.streamLogs(taskId, (event) => {
          if (event.type === 'done') {
            // Final poll to get the output
            agentsApi.getTask(taskId).then((task) => {
              setCurrentTask((prev) =>
                prev
                  ? {
                      ...prev,
                      status: task.status as AgentTask['status'],
                      steps: task.steps,
                      output: task.output,
                    }
                  : null
              )
            }).catch(() => {})

            setLogs((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(event.timestamp),
                level: event.level,
                message: event.message,
                stepId: event.stepId,
              },
            ])

            stopStreaming()
            return
          }

          setLogs((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              timestamp: new Date(event.timestamp),
              level: event.level,
              message: event.message,
              stepId: event.stepId,
            },
          ])
        })

        es.onerror = () => {
          // EventSource reconnects automatically; close only on task completion
        }

        eventSourceRef.current = es
      } catch (err) {
        setCurrentTask((prev) =>
          prev ? { ...prev, status: 'failed' } : null
        )
        setLogs((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            level: 'error',
            message: `Failed to start task: ${String(err)}`,
          },
        ])
      }
    },
    [stopStreaming]
  )

  const handleCancel = useCallback(async () => {
    if (!currentTask?.id) return
    stopStreaming()
    try {
      await agentsApi.cancelTask(currentTask.id)
    } catch {
      // best-effort
    }
    setCurrentTask((prev) => (prev ? { ...prev, status: 'cancelled' } : null))
  }, [currentTask?.id, stopStreaming])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col gap-6"
    >
      <TaskInput
        onSubmit={runAgent}
        onCancel={handleCancel}
        isRunning={currentTask?.status === 'running'}
        taskId={currentTask?.id}
      />

      <div className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-2">
        <div className="flex flex-col gap-6 overflow-hidden">
          <ExecutionTimeline task={currentTask} />
          <AgentOutput task={currentTask} />
        </div>
        <AgentLogs logs={logs} />
      </div>
    </motion.div>
  )
}
