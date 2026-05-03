'use client'

import { TrendingUp, TrendingDown, Zap, DollarSign, Clock, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const stats = [
  {
    title: 'Total Requests',
    value: '1.2M',
    change: '+18.2%',
    trend: 'up',
    icon: Zap,
    description: 'vs last month',
  },
  {
    title: 'Total Cost',
    value: '$2,847',
    change: '+12.5%',
    trend: 'up',
    icon: DollarSign,
    description: 'vs last month',
  },
  {
    title: 'Avg Latency',
    value: '847ms',
    change: '-23%',
    trend: 'down',
    icon: Clock,
    description: 'vs last month',
  },
  {
    title: 'Active Users',
    value: '324',
    change: '+8.1%',
    trend: 'up',
    icon: Users,
    description: 'vs last month',
  },
]

export function AnalyticsOverview() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="rounded-lg bg-muted p-2">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <span
                className={`flex items-center text-sm font-medium ${
                  stat.trend === 'up' && stat.title !== 'Avg Latency'
                    ? 'text-chart-2'
                    : stat.trend === 'down' && stat.title === 'Avg Latency'
                      ? 'text-chart-2'
                      : 'text-destructive'
                }`}
              >
                {stat.trend === 'up' ? (
                  <TrendingUp className="mr-1 h-4 w-4" />
                ) : (
                  <TrendingDown className="mr-1 h-4 w-4" />
                )}
                {stat.change}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
