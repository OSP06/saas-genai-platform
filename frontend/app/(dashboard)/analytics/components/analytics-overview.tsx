'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Zap, DollarSign, Clock, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { analyticsApi } from '@/lib/api-client'
import type { AnalyticsOverviewResponse } from '@/lib/types'

export function AnalyticsOverview() {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    analyticsApi
      .getOverview()
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="mt-4 space-y-1.5">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {error ?? 'No data available'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const stats = [
    {
      title: 'Total Requests',
      value: data.totalRequests >= 1000
        ? `${(data.totalRequests / 1000).toFixed(1)}k`
        : String(data.totalRequests),
      change: data.trends.requestsTrend,
      icon: Zap,
      description: 'last 30 days',
      higherIsBetter: true,
    },
    {
      title: 'Total Cost',
      value: `$${data.totalCost.toFixed(2)}`,
      change: data.trends.costTrend,
      icon: DollarSign,
      description: 'last 30 days',
      higherIsBetter: false,
    },
    {
      title: 'Avg Latency',
      value: data.avgLatency < 1000
        ? `${Math.round(data.avgLatency)}ms`
        : `${(data.avgLatency / 1000).toFixed(1)}s`,
      change: data.trends.latencyTrend,
      icon: Clock,
      description: 'last 30 days',
      higherIsBetter: false,
    },
    {
      title: 'Active Users',
      value: String(data.activeUsers),
      change: null,
      icon: Users,
      description: 'last 30 days',
      higherIsBetter: true,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const isPositive = (stat.change ?? 0) >= 0
        const isGood = stat.higherIsBetter ? isPositive : !isPositive
        return (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="rounded-lg bg-muted p-2">
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                {stat.change !== null && (
                  <span
                    className={`flex items-center text-sm font-medium ${
                      isGood ? 'text-chart-2' : 'text-destructive'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="mr-1 h-4 w-4" />
                    ) : (
                      <TrendingDown className="mr-1 h-4 w-4" />
                    )}
                    {Math.abs(stat.change).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
