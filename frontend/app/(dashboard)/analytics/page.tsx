'use client'

import { motion } from 'framer-motion'
import { UsageGraph } from './components/usage-graph'
import { CostChart } from './components/cost-chart'
import { LatencyChart } from './components/latency-chart'
import { AnalyticsOverview } from './components/analytics-overview'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function AnalyticsPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6"
    >
      {/* Overview Stats */}
      <motion.div variants={item}>
        <AnalyticsOverview />
      </motion.div>

      {/* Charts */}
      <Tabs defaultValue="usage" className="w-full">
        <TabsList>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="cost">Cost</TabsTrigger>
          <TabsTrigger value="latency">Latency</TabsTrigger>
        </TabsList>

        <motion.div variants={item}>
          <TabsContent value="usage" className="mt-4">
            <UsageGraph />
          </TabsContent>
          <TabsContent value="cost" className="mt-4">
            <CostChart />
          </TabsContent>
          <TabsContent value="latency" className="mt-4">
            <LatencyChart />
          </TabsContent>
        </motion.div>
      </Tabs>
    </motion.div>
  )
}
