import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { PlusIcon, Trash2Icon, PencilIcon } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { listProviders, createProvider, updateProvider, deleteProvider, type Provider } from '@/api/client'

export default function ProvidersPage() {
  const { t } = useI18n()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [editTarget, setEditTarget] = useState<Provider | null>(null)

  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [quotaType, setQuotaType] = useState('none')
  const [quotaConfig, setQuotaConfig] = useState('')

  const [editName, setEditName] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editQuotaType, setEditQuotaType] = useState('none')
  const [editQuotaConfig, setEditQuotaConfig] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  useEffect(() => {
    let stale = false
    ;(async () => {
      try {
        const data = await listProviders()
        if (stale) return
        setProviders(data || [])
      } catch (err: unknown) {
        if (!stale) setError(err instanceof Error ? err.message : 'Failed to load providers')
      } finally {
        if (!stale) setLoading(false)
      }
    })()
    return () => { stale = true }
  }, [reloadTick])

  function openEdit(p: Provider) {
    setEditTarget(p)
    setEditName(p.name)
    setEditBaseUrl(p.base_url)
    setEditApiKey('')
    setEditQuotaType(p.quota_type || 'none')
    setEditQuotaConfig(p.quota_config || '')
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name || !baseUrl || !apiKey) {
      setError(t('providers.allRequired'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await createProvider({
        name,
        base_url: baseUrl,
        api_key: apiKey,
        quota_type: quotaType,
        quota_config: quotaConfig,
      })
      setFlash(t('providers.createdSuccess'))
      setName('')
      setBaseUrl('')
      setApiKey('')
      setQuotaType('none')
      setQuotaConfig('')
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create provider')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setSubmitting(true)
    setError('')
    try {
      await updateProvider(editTarget.id, {
        name: editName || undefined,
        base_url: editBaseUrl || undefined,
        api_key: editApiKey || undefined,
        quota_type: editQuotaType,
        quota_config: editQuotaConfig,
      })
      setFlash('提供商配置已更新。')
      setEditTarget(null)
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update provider')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProvider(id)
      setFlash(t('providers.deletedSuccess'))
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider')
    }
  }

  return (
    <div>
      <PageHeader
        index="01"
        title={t('providers.title')}
        description={t('providers.description')}
        actions={
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <PlusIcon className="size-4" /> {t('providers.add')}
          </Button>
        }
      />

      {flash && <DismissibleAlert variant="success" className="mb-4" onClose={() => setFlash('')}>{flash}</DismissibleAlert>}
      {error && <DismissibleAlert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</DismissibleAlert>}

      <div className="overflow-x-auto border-y">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/30">
              <TableHead>{t('common.id')}</TableHead>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('providers.baseUrl')}</TableHead>
              <TableHead>{t('providers.quotaType')}</TableHead>
              <TableHead>{t('common.created')}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : providers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('providers.empty')}
                </TableCell>
              </TableRow>
            ) : (
              providers.map((p) => (
                <TableRow key={p.id} className="border-b hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{p.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{p.base_url}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.quota_type === 'antigravity' ? (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                        Antigravity
                      </Badge>
                    ) : p.quota_type === 'balance' ? (
                      <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                        Balance
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-mono text-[11px] text-muted-foreground">
                        None
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(p.created_at)}</TableCell>
                  <TableCell className="py-1 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit provider ${p.name}`}
                      className="text-muted-foreground hover:text-foreground mr-1"
                      onClick={() => openEdit(p)}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete provider ${p.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Provider Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('providers.modalTitle')}</DialogTitle>
            <DialogDescription>{t('providers.modalDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-name">{t('common.name')}</Label>
              <Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('providers.namePlaceholder')} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-url">{t('providers.baseUrl')}</Label>
              <Input
                id="provider-url"
                className="font-mono text-xs"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={t('providers.baseUrlPlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-key">{t('providers.apiKey')}</Label>
              <Input
                id="provider-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('providers.apiKeyPlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-quota-type">{t('providers.quotaType')}</Label>
              <Select value={quotaType} onValueChange={setQuotaType}>
                <SelectTrigger id="provider-quota-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('providers.quotaTypeNone')}</SelectItem>
                  <SelectItem value="antigravity">{t('providers.quotaTypeAntigravity')}</SelectItem>
                  <SelectItem value="balance">{t('providers.quotaTypeBalance')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {quotaType !== 'none' && (
              <div className="grid gap-2">
                <Label htmlFor="provider-quota-config">{t('providers.quotaConfig')}</Label>
                <Input
                  id="provider-quota-config"
                  className="font-mono text-xs"
                  value={quotaConfig}
                  onChange={(e) => setQuotaConfig(e.target.value)}
                  placeholder={t('providers.quotaConfigPlaceholder')}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('common.submitting') : t('providers.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Provider Modal */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑提供商配置</DialogTitle>
            <DialogDescription>修改上游接口端点、认证凭证与号源额度驱动配置。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-provider-name">{t('common.name')}</Label>
              <Input
                id="edit-provider-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('providers.namePlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-provider-url">{t('providers.baseUrl')}</Label>
              <Input
                id="edit-provider-url"
                className="font-mono text-xs"
                value={editBaseUrl}
                onChange={(e) => setEditBaseUrl(e.target.value)}
                placeholder={t('providers.baseUrlPlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-provider-key">{t('providers.apiKey')}</Label>
              <Input
                id="edit-provider-key"
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="留空表示不修改上游密钥"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-provider-quota-type">{t('providers.quotaType')}</Label>
              <Select value={editQuotaType} onValueChange={setEditQuotaType}>
                <SelectTrigger id="edit-provider-quota-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('providers.quotaTypeNone')}</SelectItem>
                  <SelectItem value="antigravity">{t('providers.quotaTypeAntigravity')}</SelectItem>
                  <SelectItem value="balance">{t('providers.quotaTypeBalance')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editQuotaType !== 'none' && (
              <div className="grid gap-2">
                <Label htmlFor="edit-provider-quota-config">{t('providers.quotaConfig')}</Label>
                <Input
                  id="edit-provider-quota-config"
                  className="font-mono text-xs"
                  value={editQuotaConfig}
                  onChange={(e) => setEditQuotaConfig(e.target.value)}
                  placeholder={t('providers.quotaConfigPlaceholder')}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('common.submitting') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t('providers.deleteConfirmTitle')}
        description={t('providers.deleteConfirmDesc', { name: deleteTarget?.name || '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id) }}
      />
    </div>
  )
}
