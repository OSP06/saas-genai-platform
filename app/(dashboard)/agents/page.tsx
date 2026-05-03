'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { TaskInput } from './components/task-input'
import { ExecutionTimeline } from './components/execution-timeline'
import { AgentLogs } from './components/agent-logs'
import { AgentOutput } from './components/agent-output'

export interface AgentStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: Date
  completedAt?: Date
  output?: string
}

export interface AgentTask {
  id: string
  prompt: string
  status: 'idle' | 'running' | 'completed' | 'failed'
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

  const runAgent = (prompt: string) => {
    const newTask: AgentTask = {
      id: Math.random().toString(36).substring(7),
      prompt,
      status: 'running',
      steps: [
        { id: '1', name: 'Analyzing Task', description: 'Understanding the task requirements', status: 'running' },
        { id: '2', name: 'Planning Steps', description: 'Creating execution plan', status: 'pending' },
        { id: '3', name: 'Gathering Data', description: 'Collecting relevant information', status: 'pending' },
        { id: '4', name: 'Processing', description: 'Executing main task logic', status: 'pending' },
        { id: '5', name: 'Generating Output', description: 'Compiling final results', status: 'pending' },
      ],
      createdAt: new Date(),
    }

    setCurrentTask(newTask)
    setLogs([
      {
        id: '1',
        timestamp: new Date(),
        level: 'info',
        message: `Starting agent task: "${prompt}"`,
      },
    ])

    // Simulate step progression
    let stepIndex = 0
    const interval = setInterval(() => {
      if (stepIndex >= newTask.steps.length) {
        clearInterval(interval)
        setCurrentTask((prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                output:
                  'Task completed successfully! Here are the key findings:\n\n1. Market Analysis: The target market shows 15% YoY growth with strong demand in the enterprise segment.\n\n2. Competitor Review: Identified 5 main competitors with varying strengths in pricing, features, and market presence.\n\n3. Recommendations: Focus on enterprise features and pricing flexibility to capture market share.',
              }
            : null
        )
        setLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            timestamp: new Date(),
            level: 'info',
            message: 'Agent task completed successfully',
          },
        ])
        return
      }

      // Complete current step
      setCurrentTask((prev) => {
        if (!prev) return null
        const updatedSteps = prev.steps.map((step, i) => {
          if (i === stepIndex) {
            return { ...step, status: 'completed' as const, completedAt: new Date() }
          }
          if (i === stepIndex + 1) {
            return { ...step, status: 'running' as const, startedAt: new Date() }
          }
          return step
        })
        return { ...prev, steps: updatedSteps }
      })

      // Add log entries
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          timestamp: new Date(),
          level: 'info',
          message: `Step "${newTask.steps[stepIndex].name}" completed`,
          stepId: newTask.steps[stepIndex].id,
        },
        ...(stepIndex + 1 < newTask.steps.length
          ? [
              {
                id: Math.random().toString(36).substring(7),
                timestamp: new Date(),
                level: 'debug' as const,
                message: `Starting step "${newTask.steps[stepIndex + 1].name}"`,
                stepId: newTask.steps[stepIndex + 1].id,
              },
            ]
          : []),
      ])

      stepIndex++
    }, 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col gap-6"
    >
      {/* Task Input */}
      <TaskInput onSubmit={runAgent} isRunning={currentTask?.status === 'running'} />

      {/* Main Content */}
      <div className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-2">
        {/* Left Column - Timeline & Output */}
        <div className="flex flex-col gap-6 overflow-hidden">
          <ExecutionTimeline task={currentTask} />
          <AgentOutput task={currentTask} />
        </div>

        {/* Right Column - Logs */}
        <AgentLogs logs={logs} />
      </div>
    </motion.div>
  )
}
