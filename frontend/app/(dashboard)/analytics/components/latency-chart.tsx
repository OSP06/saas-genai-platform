'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { analyticsApi } from '@/lib/api-client'
import type { LatencyDataPoint } from '@/lib/types'

export function LatencyChart() {
  const [data, setData] = useState<LatencyDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    analyticsApi
      .getLatency({
        from: twentyFourHoursAgo.toISOString(),
        to: new Date().toISOString(),
        granularity: 'hour',
      })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const formatTime = (t: string) => {
    try {
      return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      return t
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Latency</CardTitle>
        <CardDescription>Latency percentiles — last 24 hours (milliseconds)</CardDescription>
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
            <p className="text-sm text-muted-foreground">No latency data yet</p>
          </div>
        ) : (
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatTime}
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
                  tickFormatter={(v) => `${v}ms`}
                />
                <Tooltip
                  labelFormatter={formatTime}
                  contentStyle={{
                    backgroundColor: 'oklch(0.14 0 0)',
                    border: '1px solid oklch(0.25 0 0)',
                    borderRadius: '8px',
                    color: 'oklch(0.95 0 0)',
                  }}
                  labelStyle={{ color: 'oklch(0.6 0 0)' }}
                  formatter={(value: number) => [`${value}ms`, '']}
                />
                <Legend />
                <Line type="monotone" dataKey="p50" name="P50" stroke="oklch(0.65 0.15 150)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p95" name="P95" stroke="oklch(0.7 0.15 80)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p99" name="P99" stroke="oklch(0.65 0.15 30)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
