import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { CopyIcon, PlusIcon, Trash2Icon, PencilIcon } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { listKeys, createKey, updateKey, revokeKey, listProviders, type APIKey, type Provider } from '@/api/client'

export default function KeysPage() {
  const { t } = useI18n()
  const [keys, setKeys] = useState<APIKey[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [newKey, setNewKey] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<APIKey | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<APIKey | null>(null)

  // Form states for create
  const [name, setName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [rpm, setRpm] = useState('60')
  const [submitting, setSubmitting] = useState(false)

  // Form states for edit
  const [editName, setEditName] = useState('')
  const [editProviderId, setEditProviderId] = useState('')
  const [editRpm, setEditRpm] = useState('60')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  useEffect(() => {
    let stale = false
    ;(async () => {
      try {
        const [k, p] = await Promise.all([listKeys(), listProviders()])
        if (stale) return
        setKeys(k || [])
        setProviders(p || [])
      } catch (err: unknown) {
        if (!stale) setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        if (!stale) setLoading(false)
      }
    })()
    return () => { stale = true }
  }, [reloadTick])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name || !providerId) {
      setError(t('keys.requiredFields'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await createKey({
        name,
        provider_id: providerId,
        rate_limit_rpm: parseInt(rpm) || 60,
      })
      setNewKey(result.key)
      setName('')
      setProviderId('')
      setRpm('60')
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(k: APIKey) {
    setEditingKey(k)
    setEditName(k.name)
    setEditProviderId(k.provider_id)
    setEditRpm(String(k.rate_limit_rpm))
    setEditModalOpen(true)
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault()
    if (!editingKey) return
    if (!editName || !editProviderId) {
      setError(t('keys.requiredFields'))
      return
    }
    setEditSubmitting(true)
    setError('')
    try {
      await updateKey(editingKey.id, {
        name: editName,
        provider_id: editProviderId,
        rate_limit_rpm: parseInt(editRpm) || 60,
      })
      setFlash(t('keys.updatedSuccess'))
      setEditModalOpen(false)
      setEditingKey(null)
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update key')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeKey(id)
      setFlash(t('keys.revokedSuccess'))
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key')
    }
  }

  function providerName(id: string): string {
    return providers.find((p) => p.id === id)?.name || id.slice(0, 8)
  }

  return (
    <div>
      <PageHeader
        index="02"
        title={t('keys.title')}
        description={t('keys.description')}
        actions={
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <PlusIcon className="size-4" /> {t('keys.create')}
          </Button>
        }
      />

      {newKey && (
        <DismissibleAlert
          title={t('keys.createdAlert')}
          className="mb-4"
          onClose={() => setNewKey('')}
          endAction={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('common.copy')}
              onClick={() => {
                navigator.clipboard.writeText(newKey)
                setFlash(t('common.copied'))
              }}
            >
              <CopyIcon className="size-4" />
            </Button>
          }
        >
          <code className="font-mono text-xs break-all">{newKey}</code>
        </DismissibleAlert>
      )}

      {flash && <DismissibleAlert variant="success" className="mb-4" onClose={() => setFlash('')}>{flash}</DismissibleAlert>}
      {error && <DismissibleAlert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</DismissibleAlert>}

      <div className="overflow-x-auto border-y">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/30">
              <TableHead>{t('common.id')}</TableHead>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('keys.provider')}</TableHead>
              <TableHead className="text-right">RPM</TableHead>
              <TableHead>{t('keys.status')}</TableHead>
              <TableHead>{t('common.created')}</TableHead>
              <TableHead className="w-20 text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('keys.empty')}
                </TableCell>
              </TableRow>
            ) : (
              keys.map((k) => (
                <TableRow key={k.id} className="border-b hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{k.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{k.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{providerName(k.provider_id)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{k.rate_limit_rpm}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {k.revoked_at ? (
                      <Badge variant="muted">{t('keys.revoked')}</Badge>
                    ) : (
                      <Badge variant="outline">
                        <span className="size-1.5 bg-brass mr-1" aria-hidden />
                        {t('keys.active')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(k.created_at)}</TableCell>
                  <TableCell className="py-1 text-right whitespace-nowrap">
                    {!k.revoked_at && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${t('keys.edit')} ${k.name}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(k)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Revoke key ${k.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setRevokeTarget(k)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('keys.modalTitle')}</DialogTitle>
            <DialogDescription>{t('keys.modalDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="key-name">{t('common.name')}</Label>
              <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('keys.namePlaceholder')} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key-provider">{t('keys.provider')}</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger id="key-provider" className="w-full">
                  <SelectValue placeholder={t('keys.selectProvider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="key-rpm">{t('keys.rateLimit')}</Label>
              <Input id="key-rpm" type="number" value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder={t('keys.rpmPlaceholder')} />
              <p className="text-xs text-muted-foreground">{t('keys.rpmHint')}</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('common.submitting') : t('keys.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('keys.editModalTitle')}</DialogTitle>
            <DialogDescription>{editingKey ? editingKey.name : ''}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-key-name">{t('common.name')}</Label>
              <Input id="edit-key-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-key-provider">{t('keys.provider')}</Label>
              <Select value={editProviderId} onValueChange={setEditProviderId}>
                <SelectTrigger id="edit-key-provider" className="w-full">
                  <SelectValue placeholder={t('keys.selectProvider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-key-rpm">{t('keys.rateLimit')}</Label>
              <Input id="edit-key-rpm" type="number" value={editRpm} onChange={(e) => setEditRpm(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('keys.rpmHint')}</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? t('common.submitting') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
        title={t('keys.revokeConfirmTitle')}
        description={t('keys.revokeConfirmDesc', { name: revokeTarget?.name || '' })}
        confirmLabel={t('common.revoke')}
        onConfirm={() => { if (revokeTarget) handleRevoke(revokeTarget.id) }}
      />
    </div>
  )
}
