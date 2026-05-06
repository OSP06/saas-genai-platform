'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Key,
  Database,
  Bell,
  Shield,
  Palette,
  Plus,
  Trash2,
  Copy,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { settingsApi } from '@/lib/api-client'
import type { SettingsResponse, ApiKeySummary } from '@/lib/types'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New API key dialog
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // API key visibility
  const [showKeyField, setShowKeyField] = useState<Record<string, boolean>>({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, keys] = await Promise.all([settingsApi.get(), settingsApi.listApiKeys()])
      setSettings(s)
      setApiKeys(keys)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await settingsApi.update({
        apiConfiguration: settings.apiConfiguration,
        modelConfiguration: settings.modelConfiguration,
        notifications: settings.notifications,
        preferences: settings.preferences,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return
    setCreatingKey(true)
    try {
      const result = await settingsApi.createApiKey({ name: newKeyName.trim(), permissions: ['read', 'write'] })
      setCreatedKey(result.key)
      await settingsApi.listApiKeys().then(setApiKeys)
      setNewKeyName('')
    } catch (err) {
      setError(String(err))
      setDialogOpen(false)
    } finally {
      setCreatingKey(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id))
    try {
      await settingsApi.deleteApiKey(id)
    } catch {
      await settingsApi.listApiKeys().then(setApiKeys)
    }
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const patchSettings = (path: string[], value: unknown) => {
    if (!settings) return
    const [section, field] = path as [keyof SettingsResponse, string]
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            [section]: { ...(prev[section] as Record<string, unknown>), [field]: value },
          }
        : prev
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error && !settings) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={loadAll}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="mx-auto max-w-4xl">
      <Tabs defaultValue="api" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="api">API Keys</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        {/* ── API Keys ─────────────────────────────────────────────────────── */}
        <TabsContent value="api" className="mt-6 space-y-4">
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle>Platform API Keys</CardTitle>
                      <CardDescription className="mt-0.5">
                        Keys for external services to access this platform
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={loadAll} className="h-8 w-8">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Dialog
                      open={dialogOpen}
                      onOpenChange={(open) => {
                        setDialogOpen(open)
                        if (!open) {
                          setCreatedKey(null)
                          setNewKeyName('')
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="mr-1.5 h-4 w-4" />
                          New Key
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create API Key</DialogTitle>
                          <DialogDescription>
                            Give your key a name. The raw key is shown once — copy it immediately.
                          </DialogDescription>
                        </DialogHeader>
                        {createdKey ? (
                          <div className="space-y-3">
                            <p className="text-sm text-chart-2 font-medium">
                              ✓ Key created — copy it now, it won&apos;t be shown again.
                            </p>
                            <div className="flex items-center gap-2">
                              <Input
                                value={createdKey}
                                readOnly
                                className="font-mono text-xs"
                                type={showKeyField['new'] ? 'text' : 'password'}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setShowKeyField((p) => ({ ...p, new: !p['new'] }))
                                }
                              >
                                {showKeyField['new'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => copyKey(createdKey)}
                              >
                                {copiedKey ? (
                                  <CheckCircle className="h-4 w-4 text-chart-2" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <DialogFooter>
                              <Button onClick={() => setDialogOpen(false)}>Done</Button>
                            </DialogFooter>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="key-name">Key name</Label>
                              <Input
                                id="key-name"
                                placeholder="e.g. CI pipeline, Production app"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                              />
                            </div>
                            <DialogFooter>
                              <Button
                                onClick={handleCreateKey}
                                disabled={!newKeyName.trim() || creatingKey}
                              >
                                {creatingKey ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Create Key
                              </Button>
                            </DialogFooter>
                          </>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {apiKeys.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Key className="mb-3 h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No API keys yet</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Create a key to allow external access to this platform
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{key.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {key.keyPreview}
                          </p>
                          <div className="flex items-center gap-2">
                            {key.permissions.map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px]">
                                {p}
                              </Badge>
                            ))}
                            <span className="text-[10px] text-muted-foreground">
                              Created {new Date(key.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteKey(key.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Backend API config */}
          {settings && (
            <motion.div variants={item}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle>API Configuration</CardTitle>
                      <CardDescription>External service credentials</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Anthropic API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-ant-…"
                      value={settings.apiConfiguration.anthropicApiKey}
                      onChange={(e) =>
                        patchSettings(['apiConfiguration', 'anthropicApiKey'], e.target.value)
                      }
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Used for all LLM completions</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <Input
                      placeholder="https://your-app.com/webhook"
                      value={settings.apiConfiguration.webhookUrl ?? ''}
                      onChange={(e) =>
                        patchSettings(['apiConfiguration', 'webhookUrl'], e.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Receive notifications for agent task completions
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>

        {/* ── Models ───────────────────────────────────────────────────────── */}
        <TabsContent value="models" className="mt-6">
          {settings && (
            <motion.div variants={item}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle>Model Configuration</CardTitle>
                      <CardDescription>AI models used per module</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>RAG Query Model</Label>
                    <Select
                      value={settings.modelConfiguration.ragQueryModel}
                      onValueChange={(v) => patchSettings(['modelConfiguration', 'ragQueryModel'], v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6 (recommended)</SelectItem>
                        <SelectItem value="claude-opus-4-7">Claude Opus 4.7</SelectItem>
                        <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Model for RAG query responses</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Agent Execution Model</Label>
                    <Select
                      value={settings.modelConfiguration.agentExecutionModel}
                      onValueChange={(v) =>
                        patchSettings(['modelConfiguration', 'agentExecutionModel'], v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6 (recommended)</SelectItem>
                        <SelectItem value="claude-opus-4-7">Claude Opus 4.7</SelectItem>
                        <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Model for agent task planning and execution</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Embedding Model</Label>
                    <Input
                      value={settings.modelConfiguration.embeddingModel}
                      readOnly
                      className="bg-muted/50 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      Set via <code className="text-xs">EMBEDDING_MODEL</code> env var — requires re-ingestion if changed
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>

        {/* ── Notifications ────────────────────────────────────────────────── */}
        <TabsContent value="notifications" className="mt-6">
          {settings && (
            <motion.div variants={item}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle>Notification Settings</CardTitle>
                      <CardDescription>Configure notification preferences</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {(
                    [
                      ['agentTaskCompletions', 'Agent Task Completions', 'Notify when agent tasks complete'],
                      ['documentProcessing', 'Document Processing', 'Notify when documents finish indexing'],
                      ['usageAlerts', 'Usage Alerts', 'Alert when approaching usage limits'],
                      ['errorNotifications', 'Error Notifications', 'Notify when errors occur'],
                    ] as const
                  ).map(([field, label, desc], i, arr) => (
                    <div key={field}>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>{label}</Label>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        <Switch
                          checked={settings.notifications[field]}
                          onCheckedChange={(v) => patchSettings(['notifications', field], v)}
                        />
                      </div>
                      {i < arr.length - 1 && <Separator className="mt-6" />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>

        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <TabsContent value="preferences" className="mt-6">
          {settings && (
            <motion.div variants={item} className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Palette className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle>Display Preferences</CardTitle>
                      <CardDescription>Customize your interface</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Theme</Label>
                    <Select
                      value={settings.preferences.theme}
                      onValueChange={(v) => patchSettings(['preferences', 'theme'], v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Compact Mode</Label>
                      <p className="text-xs text-muted-foreground">Reduce spacing in the UI</p>
                    </div>
                    <Switch
                      checked={settings.preferences.compactMode}
                      onCheckedChange={(v) => patchSettings(['preferences', 'compactMode'], v)}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Show Timestamps</Label>
                      <p className="text-xs text-muted-foreground">
                        Display timestamps on messages
                      </p>
                    </div>
                    <Switch
                      checked={settings.preferences.showTimestamps}
                      onCheckedChange={(v) => patchSettings(['preferences', 'showTimestamps'], v)}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>

      {/* Save bar */}
      <motion.div variants={item} className="mt-6 flex items-center justify-between">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="ml-auto flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-sm text-chart-2">
              <CheckCircle className="h-4 w-4" />
              Saved
            </span>
          )}
          <Button onClick={handleSave} disabled={saving || !settings}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
