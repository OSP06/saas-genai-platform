'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Bot,
  MessageSquare,
  TrendingUp,
  ArrowUpRight,
  FileText,
  Zap,
  Clock,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RecentActivity } from './components/recent-activity'
import { QuickStats } from './components/quick-stats'
import { ragApi, agentsApi, chatApi } from '@/lib/api-client'

interface ModuleStats {
  rag: number | null
  agents: number | null
  chat: number | null
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  const [stats, setStats] = useState<ModuleStats>({ rag: null, agents: null, chat: null })

  useEffect(() => {
    Promise.allSettled([
      ragApi.listDocuments(),
      agentsApi.listTasks(),
      chatApi.listConversations(),
    ]).then(([ragRes, agentsRes, chatRes]) => {
      setStats({
        rag: ragRes.status === 'fulfilled' ? ragRes.value.length : null,
        agents:
          agentsRes.status === 'fulfilled'
            ? agentsRes.value.tasks.filter((t) => t.status === 'completed').length
            : null,
        chat:
          chatRes.status === 'fulfilled'
            ? chatRes.value.conversations.reduce((sum, c) => sum + c.messageCount, 0)
            : null,
      })
    })
  }, [])

  const modules = [
    {
      title: 'RAG Knowledge Base',
      description: 'Query your documents with AI-powered semantic search and citations',
      icon: BookOpen,
      href: '/rag',
      stat: stats.rag !== null ? `${stats.rag} document${stats.rag !== 1 ? 's' : ''}` : 'Knowledge Base',
      color: 'text-chart-1',
      bgColor: 'bg-chart-1/10',
    },
    {
      title: 'AI Agent Workspace',
      description: 'Run multi-step AI agents that plan, research, and synthesize results',
      icon: Bot,
      href: '/agents',
      stat:
        stats.agents !== null
          ? `${stats.agents} task${stats.agents !== 1 ? 's' : ''} completed`
          : 'Agent Tasks',
      color: 'text-chart-2',
      bgColor: 'bg-chart-2/10',
    },
    {
      title: 'Smart Chat Router',
      description: 'Intelligent routing to RAG, Agents, or direct LLM based on your query',
      icon: MessageSquare,
      href: '/chat',
      stat:
        stats.chat !== null
          ? `${stats.chat} message${stats.chat !== 1 ? 's' : ''}`
          : 'Smart Chat',
      color: 'text-chart-3',
      bgColor: 'bg-chart-3/10',
    },
  ]

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6"
    >
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Welcome back</h2>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your AI platform activity
          </p>
        </div>
        <Button asChild>
          <Link href="/chat">
            <Zap className="mr-2 h-4 w-4" />
            Start New Chat
          </Link>
        </Button>
      </motion.div>

      <motion.div variants={item}>
        <QuickStats />
      </motion.div>

      <motion.div variants={item}>
        <h3 className="mb-4 text-lg font-medium text-foreground">Modules</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {modules.map((module) => (
            <Link key={module.href} href={module.href}>
              <Card className="group cursor-pointer transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className={`rounded-lg p-2.5 ${module.bgColor}`}>
                    <module.icon className={`h-5 w-5 ${module.color}`} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <CardTitle className="text-base">{module.title}</CardTitle>
                  <CardDescription className="text-sm">{module.description}</CardDescription>
                  <Badge variant="secondary" className="mt-2 w-fit">
                    {module.stat}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <RecentActivity />
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="secondary" className="justify-start" asChild>
                <Link href="/rag">
                  <FileText className="mr-2 h-4 w-4" />
                  Upload Documents
                </Link>
              </Button>
              <Button variant="secondary" className="justify-start" asChild>
                <Link href="/agents">
                  <Bot className="mr-2 h-4 w-4" />
                  Create New Agent Task
                </Link>
              </Button>
              <Button variant="secondary" className="justify-start" asChild>
                <Link href="/analytics">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  View Analytics
                </Link>
              </Button>
              <Button variant="secondary" className="justify-start" asChild>
                <Link href="/settings">
                  <Clock className="mr-2 h-4 w-4" />
                  Configure Settings
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
