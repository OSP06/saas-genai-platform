'use client'

import { TrendingUp, TrendingDown, FileText, Zap, Clock, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const stats = [
  {
    title: 'Total Queries',
    value: '12,847',
    change: '+12.5%',
    trend: 'up',
    icon: FileText,
  },
  {
    title: 'Tokens Used',
    value: '2.4M',
    change: '+8.2%',
    trend: 'up',
    icon: Zap,
  },
  {
    title: 'Avg Response Time',
    value: '1.2s',
    change: '-15%',
    trend: 'down',
    icon: Clock,
  },
  {
    title: 'Monthly Cost',
    value: '$847',
    change: '+5.1%',
    trend: 'up',
    icon: DollarSign,
  },
]

export function QuickStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-muted p-2.5">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-semibold">{stat.value}</p>
                <span
                  className={`flex items-center text-xs font-medium ${
                    stat.trend === 'up' && stat.title !== 'Avg Response Time'
                      ? 'text-chart-2'
                      : stat.trend === 'down' && stat.title === 'Avg Response Time'
                        ? 'text-chart-2'
                        : 'text-muted-foreground'
                  }`}
                >
                  {stat.trend === 'up' ? (
                    <TrendingUp className="mr-0.5 h-3 w-3" />
                  ) : (
                    <TrendingDown className="mr-0.5 h-3 w-3" />
                  )}
                  {stat.change}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
