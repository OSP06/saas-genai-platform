'use client'

import { FileText, Bot, MessageSquare, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

const activities = [
  {
    id: 1,
    type: 'rag',
    title: 'Document query completed',
    description: 'Searched knowledge base for "Q4 revenue projections"',
    time: '2 minutes ago',
    status: 'success',
  },
  {
    id: 2,
    type: 'agent',
    title: 'Research agent finished',
    description: 'Compiled market analysis from 12 sources',
    time: '15 minutes ago',
    status: 'success',
  },
  {
    id: 3,
    type: 'chat',
    title: 'Chat session ended',
    description: '23 messages exchanged with Smart Router',
    time: '1 hour ago',
    status: 'success',
  },
  {
    id: 4,
    type: 'rag',
    title: 'Documents indexed',
    description: '5 new PDF files added to knowledge base',
    time: '2 hours ago',
    status: 'success',
  },
  {
    id: 5,
    type: 'agent',
    title: 'Agent task failed',
    description: 'API rate limit exceeded during data extraction',
    time: '3 hours ago',
    status: 'error',
  },
]

const typeIcons = {
  rag: FileText,
  agent: Bot,
  chat: MessageSquare,
}

export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Your latest platform interactions</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="flex flex-col">
            {activities.map((activity) => {
              const Icon = typeIcons[activity.type as keyof typeof typeIcons]
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 border-b border-border px-6 py-3 last:border-b-0"
                >
                  <div className="mt-0.5 rounded-md bg-muted p-1.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">{activity.title}</p>
                      <Badge
                        variant={activity.status === 'error' ? 'destructive' : 'secondary'}
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
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
