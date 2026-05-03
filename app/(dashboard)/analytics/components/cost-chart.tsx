'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

const data = [
  { month: 'Sep', tokens: 1200, compute: 450, storage: 120 },
  { month: 'Oct', tokens: 1450, compute: 520, storage: 145 },
  { month: 'Nov', tokens: 1680, compute: 580, storage: 165 },
  { month: 'Dec', tokens: 1520, compute: 620, storage: 180 },
  { month: 'Jan', tokens: 1890, compute: 680, storage: 195 },
  { month: 'Feb', tokens: 2100, compute: 750, storage: 220 },
]

export function CostChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Breakdown</CardTitle>
        <CardDescription>
          Monthly cost distribution by category (in USD)
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'oklch(0.14 0 0)',
                  border: '1px solid oklch(0.25 0 0)',
                  borderRadius: '8px',
                  color: 'oklch(0.95 0 0)',
                }}
                labelStyle={{ color: 'oklch(0.6 0 0)' }}
                formatter={(value: number) => [`$${value}`, '']}
              />
              <Legend />
              <Bar
                dataKey="tokens"
                name="Token Usage"
                fill="oklch(0.7 0.15 200)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="compute"
                name="Compute"
                fill="oklch(0.65 0.15 150)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="storage"
                name="Storage"
                fill="oklch(0.7 0.15 80)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
