'use client'

import { useEffect, useState } from 'react'
import { FileText, Bot, MessageSquare, Clock, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { chatApi, agentsApi } from '@/lib/api-client'

interface ActivityItem {
  id: string
  type: 'chat' | 'agent'
  title: string
  description: string
  time: string
  status: 'success' | 'error' | 'running'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const typeIcons = {
  chat: MessageSquare,
  agent: Bot,
  rag: FileText,
}

export function RecentActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [convResp, tasksResp] = await Promise.allSettled([
        chatApi.listConversations(),
        agentsApi.listTasks(),
      ])

      const items: ActivityItem[] = []

      if (convResp.status === 'fulfilled') {
        for (const conv of convResp.value.conversations.slice(0, 5)) {
          items.push({
            id: `chat-${conv.id}`,
            type: 'chat',
            title: conv.title || 'Chat session',
            description: `${conv.messageCount} message${conv.messageCount !== 1 ? 's' : ''}`,
            time: timeAgo(conv.updatedAt),
            status: 'success',
          })
        }
      }

      if (tasksResp.status === 'fulfilled') {
        for (const task of tasksResp.value.tasks.slice(0, 5)) {
          items.push({
            id: `agent-${task.id}`,
            type: 'agent',
            title: 'Agent task',
            description: task.prompt.length > 60 ? task.prompt.slice(0, 60) + '…' : task.prompt,
            time: timeAgo(task.createdAt),
            status:
              task.status === 'completed'
                ? 'success'
                : task.status === 'failed' || task.status === 'cancelled'
                  ? 'error'
                  : 'running',
          })
        }
      }

      // Sort by most recent first (approximate — all items have relative time string)
      setActivities(
        items.sort((a, b) => {
          // items are already fetched in recency order from API
          // interleave by keeping original API order
          return 0
        })
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Your latest platform interactions</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} className="h-8 w-8">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          {loading ? (
            <div className="flex flex-col">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 border-b border-border px-6 py-3">
                  <Skeleton className="mt-0.5 h-7 w-7 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-52" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load}>
                Retry
              </Button>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Clock className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Start a chat or run an agent task to see activity here
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {activities.map((activity) => {
                const Icon = typeIcons[activity.type] ?? FileText
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 border-b border-border px-6 py-3 last:border-b-0"
                  >
                    <div className="mt-0.5 rounded-md bg-muted p-1.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium leading-none">{activity.title}</p>
                        <Badge
                          variant={
                            activity.status === 'error'
                              ? 'destructive'
                              : activity.status === 'running'
                                ? 'default'
                                : 'secondary'
                          }
                          className="text-xs"
                        >
                          {activity.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {activity.time}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
