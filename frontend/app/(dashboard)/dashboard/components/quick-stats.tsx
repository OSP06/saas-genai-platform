'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Zap, Clock, DollarSign, Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { analyticsApi } from '@/lib/api-client'
import type { AnalyticsOverviewResponse } from '@/lib/types'

export function QuickStats() {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi
      .getOverview()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const stats = data
    ? [
        {
          title: 'Total Requests',
          value:
            data.totalRequests >= 1000
              ? `${(data.totalRequests / 1000).toFixed(1)}k`
              : String(data.totalRequests),
          change: data.trends.requestsTrend,
          icon: Zap,
          higherIsBetter: true,
        },
        {
          title: 'Total Cost',
          value: `$${data.totalCost.toFixed(2)}`,
          change: data.trends.costTrend,
          icon: DollarSign,
          higherIsBetter: false,
        },
        {
          title: 'Avg Latency',
          value:
            data.avgLatency < 1000
              ? `${Math.round(data.avgLatency)}ms`
              : `${(data.avgLatency / 1000).toFixed(1)}s`,
          change: data.trends.latencyTrend,
          icon: Clock,
          higherIsBetter: false,
        },
        {
          title: 'Active Users',
          value: String(data.activeUsers),
          change: null,
          icon: Activity,
          higherIsBetter: true,
        },
      ]
    : [
        { title: 'Total Requests', value: '—', change: null, icon: Zap, higherIsBetter: true },
        { title: 'Total Cost', value: '—', change: null, icon: DollarSign, higherIsBetter: false },
        { title: 'Avg Latency', value: '—', change: null, icon: Clock, higherIsBetter: false },
        { title: 'Active Users', value: '—', change: null, icon: Activity, higherIsBetter: true },
      ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const isPositive = (stat.change ?? 0) >= 0
        const isGood = stat.higherIsBetter ? isPositive : !isPositive
        return (
          <Card key={stat.title}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-muted p-2.5">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-semibold">{stat.value}</p>
                  {stat.change !== null && (
                    <span
                      className={`flex items-center text-xs font-medium ${
                        isGood ? 'text-chart-2' : 'text-muted-foreground'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="mr-0.5 h-3 w-3" />
                      ) : (
                        <TrendingDown className="mr-0.5 h-3 w-3" />
                      )}
                      {Math.abs(stat.change).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
