'use client'

import { FileText, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import type { Citation } from '../page'

interface CitationPanelProps {
  citations: Citation[]
}

export function CitationPanel({ citations }: CitationPanelProps) {
  return (
    <Card className="hidden w-80 shrink-0 lg:flex lg:flex-col">
      <CardHeader className="border-b border-border py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Citations</CardTitle>
          {citations.length > 0 && (
            <Badge variant="secondary">{citations.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <AnimatePresence mode="wait">
            {citations.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center p-8 text-center"
              >
                <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No citations yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Citations will appear here when viewing responses
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="citations"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3 p-4"
              >
                {citations.map((citation, index) => (
                  <motion.div
                    key={citation.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="border-border/50 bg-muted/30">
                      <CardContent className="p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="line-clamp-1 text-xs font-medium">
                              {citation.documentName}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                          >
                            {Math.round(citation.relevanceScore * 100)}%
                          </Badge>
                        </div>
                        <p className="mb-2 line-clamp-4 text-xs text-muted-foreground">
                          {citation.content}
                        </p>
                        <div className="flex items-center justify-between">
                          {citation.page && (
                            <span className="text-[10px] text-muted-foreground">
                              Page {citation.page}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 text-[10px]"
                          >
                            <ExternalLink className="mr-1 h-3 w-3" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
