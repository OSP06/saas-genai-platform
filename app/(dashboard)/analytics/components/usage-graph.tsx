'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

const data = [
  { date: 'Jan 1', rag: 4200, agent: 1800, chat: 3200 },
  { date: 'Jan 8', rag: 4800, agent: 2100, chat: 3500 },
  { date: 'Jan 15', rag: 5200, agent: 2400, chat: 4100 },
  { date: 'Jan 22', rag: 4900, agent: 2800, chat: 3800 },
  { date: 'Jan 29', rag: 5500, agent: 3200, chat: 4500 },
  { date: 'Feb 5', rag: 6100, agent: 3500, chat: 4800 },
  { date: 'Feb 12', rag: 5800, agent: 3800, chat: 5200 },
  { date: 'Feb 19', rag: 6400, agent: 4200, chat: 5600 },
]

export function UsageGraph() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time</CardTitle>
        <CardDescription>
          Request volume by module over the past 8 weeks
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
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
      </CardContent>
    </Card>
  )
}
