'use client'

import { useState } from 'react'
import { FileText, MoreVertical, Search, Trash2, Download, Eye } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const mockDocuments = [
  {
    id: '1',
    name: 'Q4 Financial Report 2024.pdf',
    type: 'PDF',
    size: '2.4 MB',
    chunks: 142,
    uploadedAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Product Roadmap.docx',
    type: 'Word',
    size: '856 KB',
    chunks: 67,
    uploadedAt: '2024-01-14',
  },
  {
    id: '3',
    name: 'Engineering Guidelines.md',
    type: 'Markdown',
    size: '124 KB',
    chunks: 34,
    uploadedAt: '2024-01-12',
  },
  {
    id: '4',
    name: 'Customer Research Summary.pdf',
    type: 'PDF',
    size: '5.1 MB',
    chunks: 234,
    uploadedAt: '2024-01-10',
  },
  {
    id: '5',
    name: 'API Documentation.txt',
    type: 'Text',
    size: '45 KB',
    chunks: 23,
    uploadedAt: '2024-01-08',
  },
]

export function DocumentList() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredDocuments = mockDocuments.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Knowledge Base</CardTitle>
            <CardDescription>
              {mockDocuments.length} documents indexed
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="flex flex-col">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 border-b border-border px-6 py-3 last:border-b-0 hover:bg-muted/30"
              >
                <div className="rounded-lg bg-muted p-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{doc.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{doc.type}</span>
                    <span>-</span>
                    <span>{doc.size}</span>
                    <span>-</span>
                    <span>{doc.uploadedAt}</span>
                  </div>
                </div>
                <Badge variant="secondary">{doc.chunks} chunks</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
