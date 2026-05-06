'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { analyticsApi } from '@/lib/api-client'
import type { UsageDataPoint } from '@/lib/types'

export function UsageGraph() {
  const [data, setData] = useState<UsageDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    analyticsApi
      .getUsage({
        from: thirtyDaysAgo.toISOString(),
        to: new Date().toISOString(),
        granularity: 'day',
      })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return d
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time</CardTitle>
        <CardDescription>Request volume by module — last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : error ? (
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No usage data yet</p>
          </div>
        ) : (
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.7 0.15 200)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.7 0.15 200)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAgent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.65 0.15 150)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.65 0.15 150)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorChat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.6 0.15 280)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.6 0.15 280)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  className="text-xs"
                  tick={{ fill: 'oklch(0.6 0 0)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'oklch(0.6 0 0)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  labelFormatter={formatDate}
                  contentStyle={{
                    backgroundColor: 'oklch(0.14 0 0)',
                    border: '1px solid oklch(0.25 0 0)',
                    borderRadius: '8px',
                    color: 'oklch(0.95 0 0)',
                  }}
                  labelStyle={{ color: 'oklch(0.6 0 0)' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="rag"
                  name="RAG"
                  stroke="oklch(0.7 0.15 200)"
                  fillOpacity={1}
                  fill="url(#colorRag)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="agent"
                  name="Agent"
                  stroke="oklch(0.65 0.15 150)"
                  fillOpacity={1}
                  fill="url(#colorAgent)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="chat"
                  name="Chat"
                  stroke="oklch(0.6 0.15 280)"
                  fillOpacity={1}
                  fill="url(#colorChat)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
