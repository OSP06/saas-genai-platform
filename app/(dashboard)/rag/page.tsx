'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { DocumentUploader } from './components/document-uploader'
import { DocumentList } from './components/document-list'
import { ChatInterface } from './components/chat-interface'
import { CitationPanel } from './components/citation-panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface Citation {
  id: string
  documentId: string
  documentName: string
  content: string
  page?: number
  relevanceScore: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  timestamp: Date
}

export default function RAGPage() {
  const [selectedCitations, setSelectedCitations] = useState<Citation[]>([])
  const [messages, setMessages] = useState<Message[]>([])

  const handleCitationClick = (citations: Citation[]) => {
    setSelectedCitations(citations)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col gap-6"
    >
      {/* Top Section - Document Management */}
      <Tabs defaultValue="documents" className="w-full">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-4">
          <DocumentList />
        </TabsContent>
        <TabsContent value="upload" className="mt-4">
          <DocumentUploader />
        </TabsContent>
      </Tabs>

      {/* Bottom Section - Chat with Citations */}
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
