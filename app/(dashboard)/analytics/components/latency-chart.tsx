'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

const data = [
  { time: '00:00', p50: 420, p95: 890, p99: 1200 },
  { time: '04:00', p50: 380, p95: 820, p99: 1100 },
  { time: '08:00', p50: 520, p95: 1100, p99: 1450 },
  { time: '12:00', p50: 680, p95: 1350, p99: 1800 },
  { time: '16:00', p50: 590, p95: 1200, p99: 1600 },
  { time: '20:00', p50: 450, p95: 950, p99: 1300 },
  { time: '24:00', p50: 410, p95: 880, p99: 1180 },
]

export function LatencyChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Latency</CardTitle>
        <CardDescription>
          Latency percentiles over the past 24 hours (in milliseconds)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="time"
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
                tickFormatter={(value) => `${value}ms`}
              />
              <Tooltip
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
              <Line
                type="monotone"
                dataKey="p50"
                name="P50"
                stroke="oklch(0.65 0.15 150)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p95"
                name="P95"
                stroke="oklch(0.7 0.15 80)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p99"
                name="P99"
                stroke="oklch(0.65 0.15 30)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
