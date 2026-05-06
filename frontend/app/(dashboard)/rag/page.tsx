'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { DocumentUploader } from './components/document-uploader'
import { DocumentList } from './components/document-list'
import { ChatInterface } from './components/chat-interface'
import { CitationPanel } from './components/citation-panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Citation } from '@/lib/types'

export type { Citation }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  timestamp: Date
  isLoading?: boolean
}

export default function RAGPage() {
  const [selectedCitations, setSelectedCitations] = useState<Citation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState('documents')

  const handleCitationClick = useCallback((citations: Citation[]) => {
    setSelectedCitations(citations)
  }, [])

  const handleUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setActiveTab('documents')
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col gap-6"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-4">
          <DocumentList key={refreshKey} />
        </TabsContent>
        <TabsContent value="upload" className="mt-4">
          <DocumentUploader onUploaded={handleUploaded} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex-1">
          <ChatInterface
            messages={messages}
            setMessages={setMessages}
            onCitationClick={handleCitationClick}
          />
        </div>
        <CitationPanel citations={selectedCitations} />
      </div>
    </motion.div>
  )
}
