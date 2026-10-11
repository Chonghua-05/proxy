import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { listProviders, createProvider, deleteProvider, type Provider } from '@/api/client'

export default function ProvidersPage() {
  const { t } = useI18n()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)

  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name || !baseUrl || !apiKey) {
      setError(t('providers.allRequired'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await createProvider({ name, base_url: baseUrl, api_key: apiKey })
      setFlash(t('providers.createdSuccess'))
      setName('')
      setBaseUrl('')
      setApiKey('')
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create provider')
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

      <Card className="gap-0 py-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.id')}</TableHead>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('providers.baseUrl')}</TableHead>
                <TableHead>{t('common.created')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center font-mono text-xs text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : providers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center font-mono text-xs text-muted-foreground">
                    {t('providers.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{p.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">{p.base_url}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(p.created_at)}</TableCell>
                    <TableCell className="py-1 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete provider ${p.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

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
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('common.submitting') : t('providers.add')}
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
