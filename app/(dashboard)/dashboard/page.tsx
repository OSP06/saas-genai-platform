'use client'

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

const modules = [
  {
    title: 'RAG Knowledge Base',
    description: 'Query your documents with AI-powered search and citations',
    icon: BookOpen,
    href: '/rag',
    stats: '142 Documents',
    color: 'text-chart-1',
    bgColor: 'bg-chart-1/10',
  },
  {
    title: 'AI Agent Workspace',
    description: 'Run multi-step AI agents for complex tasks',
    icon: Bot,
    href: '/agents',
    stats: '23 Tasks Today',
    color: 'text-chart-2',
    bgColor: 'bg-chart-2/10',
  },
  {
    title: 'Smart Chat Router',
    description: 'Intelligent routing to RAG, Agents, or direct LLM',
    icon: MessageSquare,
    href: '/chat',
    stats: '1.2k Messages',
    color: 'text-chart-3',
    bgColor: 'bg-chart-3/10',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6"
    >
      {/* Header */}
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

      {/* Quick Stats */}
      <motion.div variants={item}>
        <QuickStats />
      </motion.div>

      {/* Module Cards */}
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
                  <CardDescription className="text-sm">
                    {module.description}
                  </CardDescription>
                  <Badge variant="secondary" className="mt-2 w-fit">
                    {module.stats}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Bottom Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <motion.div variants={item}>
          <RecentActivity />
        </motion.div>

        {/* Quick Actions */}
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
                  Configure API Settings
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
