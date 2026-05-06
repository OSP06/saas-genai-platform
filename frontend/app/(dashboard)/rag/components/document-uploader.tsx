'use client'

import { useCallback, useState } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ragApi } from '@/lib/api-client'

interface UploadedFile {
  clientId: string
  name: string
  size: number
  status: 'uploading' | 'processing' | 'ready' | 'error'
  progress: number
  chunks?: number
  errorMsg?: string
  documentId?: string
}

export function DocumentUploader({ onUploaded }: { onUploaded?: () => void }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])

  const uploadFile = useCallback(
    async (file: File) => {
      const clientId = crypto.randomUUID()

      setFiles((prev) => [
        ...prev,
        { clientId, name: file.name, size: file.size, status: 'uploading', progress: 10 },
      ])

      try {
        // Upload — returns immediately with status=pending
        const doc = await ragApi.upload(file)

        setFiles((prev) =>
          prev.map((f) =>
            f.clientId === clientId
              ? { ...f, documentId: doc.id, status: 'processing', progress: 40 }
              : f
          )
        )

        // Poll status until ready or error
        const poll = async () => {
          for (let attempt = 0; attempt < 120; attempt++) {
            await new Promise((r) => setTimeout(r, 1000))
            try {
              const status = await ragApi.getStatus(doc.id)

              const progress =
                status.status === 'ready'
                  ? 100
                  : status.progress != null
                    ? Math.max(40, Math.round(status.progress * 100))
                    : Math.min(40 + attempt * 2, 90)

              setFiles((prev) =>
                prev.map((f) =>
                  f.clientId === clientId
                    ? {
                        ...f,
                        progress,
                        status: status.status === 'ready' ? 'ready' : status.status === 'error' ? 'error' : 'processing',
                        chunks: status.chunksCreated,
                        errorMsg: status.error ?? undefined,
                      }
                    : f
                )
              )

              if (status.status === 'ready') {
                onUploaded?.()
                return
              }
              if (status.status === 'error') return
            } catch {
              // swallow transient network errors during polling
            }
          }
          // Timeout — mark as error
          setFiles((prev) =>
            prev.map((f) =>
              f.clientId === clientId
                ? { ...f, status: 'error', errorMsg: 'Processing timed out' }
                : f
            )
          )
        }

        poll()
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.clientId === clientId
              ? { ...f, status: 'error', progress: 0, errorMsg: String(err) }
              : f
          )
        )
      }
    },
    [onUploaded]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      Array.from(e.dataTransfer.files).forEach(uploadFile)
    },
    [uploadFile]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) Array.from(e.target.files).forEach(uploadFile)
      e.target.value = ''
    },
    [uploadFile]
  )

  const removeFile = (clientId: string) =>
    setFiles((prev) => prev.filter((f) => f.clientId !== clientId))

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Documents</CardTitle>
          <CardDescription>
            PDF, Word, TXT, and Markdown files — up to 50 MB each
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/50'
            }`}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF, Word, TXT, and Markdown
            </p>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload Queue</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {files.map((file) => (
                  <motion.div
                    key={file.clientId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <div className="flex shrink-0 items-center gap-2">
                          {file.status === 'ready' && file.chunks !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {file.chunks} chunks
                            </span>
                          )}
                          <Badge
                            variant={
                              file.status === 'ready'
                                ? 'default'
                                : file.status === 'error'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {file.status === 'uploading' && 'Uploading…'}
                            {file.status === 'processing' && 'Processing…'}
                            {file.status === 'ready' && 'Ready'}
                            {file.status === 'error' && 'Error'}
                          </Badge>
                          {file.status === 'ready' && (
                            <CheckCircle className="h-4 w-4 text-chart-2" />
                          )}
                          {file.status === 'processing' && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {file.status === 'error' && (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeFile(file.clientId)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                        {file.status === 'error' && file.errorMsg && (
                          <p className="text-xs text-destructive truncate max-w-[200px]">
                            {file.errorMsg}
                          </p>
                        )}
                      </div>
                      {(file.status === 'uploading' || file.status === 'processing') && (
                        <Progress value={file.progress} className="mt-2 h-1" />
                      )}
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
