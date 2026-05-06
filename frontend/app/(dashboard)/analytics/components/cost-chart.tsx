'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { analyticsApi } from '@/lib/api-client'
import type { CostDataPoint } from '@/lib/types'

export function CostChart() {
  const [data, setData] = useState<CostDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    analyticsApi
      .getCosts({ granularity: 'month' })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Breakdown</CardTitle>
        <CardDescription>Monthly cost distribution by category (USD)</CardDescription>
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
            <p className="text-sm text-muted-foreground">No cost data yet</p>
          </div>
        ) : (
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="month"
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
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'oklch(0.14 0 0)',
                    border: '1px solid oklch(0.25 0 0)',
                    borderRadius: '8px',
                    color: 'oklch(0.95 0 0)',
                  }}
                  labelStyle={{ color: 'oklch(0.6 0 0)' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                />
                <Legend />
                <Bar dataKey="tokens" name="Token Usage" fill="oklch(0.7 0.15 200)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="compute" name="Compute" fill="oklch(0.65 0.15 150)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="storage" name="Storage" fill="oklch(0.7 0.15 80)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
