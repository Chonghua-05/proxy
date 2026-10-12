import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'

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
import {
  listGuardrails,
  createGuardrail,
  deleteGuardrail,
  listGuardrailEvents,
  deleteGuardrailEvent,
  type Guardrail,
  type GuardrailEvent,
} from '@/api/client'

function ModeBadge({ mode }: { mode: string }) {
  const { t } = useI18n()
  const isReject = mode === 'reject'
  return (
    <Badge variant={isReject ? 'default' : 'outline'}>
      {isReject ? t('guardrails.modeReject') : t('guardrails.modeReplace')}
    </Badge>
  )
}

export default function GuardrailsPage() {
  const { t } = useI18n()
  const [guardrails, setGuardrails] = useState<Guardrail[]>([])
  const [events, setEvents] = useState<GuardrailEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Guardrail | null>(null)

  const [pattern, setPattern] = useState('')
  const [mode, setMode] = useState('reject')
  const [replaceBy, setReplaceBy] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  useEffect(() => {
    let stale = false
    ;(async () => {
      try {
        const [g, e] = await Promise.all([
          listGuardrails(),
          listGuardrailEvents({ limit: '50' }),
        ])
        if (stale) return
        setGuardrails(g || [])
        setEvents(e.records || [])
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
    if (!pattern || !mode) {
      setError(t('guardrails.requiredFields'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await createGuardrail({
        pattern,
        mode,
        replace_by: mode === 'replace' ? replaceBy : undefined,
      })
      setFlash(t('guardrails.createdSuccess'))
      setPattern('')
      setMode('reject')
      setReplaceBy('')
      setModalOpen(false)
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create guardrail')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteGuardrail(id: string) {
    try {
      await deleteGuardrail(id)
      setFlash(t('guardrails.deletedSuccess'))
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete guardrail')
    }
  }

  async function handleDeleteEvent(id: string) {
    try {
      await deleteGuardrailEvent(id)
      setFlash(t('guardrails.eventDeletedSuccess'))
      reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete event')
    }
  }

  return (
    <div>
      <PageHeader
        index="04"
        title={t('guardrails.title')}
        description={t('guardrails.description')}
        actions={
          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <PlusIcon className="size-4" /> {t('guardrails.add')}
          </Button>
        }
      />

      {flash && <DismissibleAlert variant="success" className="mb-4" onClose={() => setFlash('')}>{flash}</DismissibleAlert>}
      {error && <DismissibleAlert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</DismissibleAlert>}

      {/* Guardrail rules */}
      <p className="kicker mb-2 text-muted-foreground">{t('guardrails.rulesTab')}</p>
      <div className="mb-8 overflow-x-auto border-y">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/30">
              <TableHead>{t('common.id')}</TableHead>
              <TableHead>{t('guardrails.pattern')}</TableHead>
              <TableHead>{t('guardrails.mode')}</TableHead>
              <TableHead>{t('guardrails.replaceBy')}</TableHead>
              <TableHead>{t('common.created')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : guardrails.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('guardrails.empty')}
                </TableCell>
              </TableRow>
            ) : (
              guardrails.map((g) => (
                <TableRow key={g.id} className="border-b hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{g.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{g.pattern}</TableCell>
                  <TableCell className="whitespace-nowrap"><ModeBadge mode={g.mode} /></TableCell>
                  <TableCell className="font-mono text-xs">{g.replace_by || '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(g.created_at)}</TableCell>
                  <TableCell className="py-1 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete guardrail rule"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(g)}
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

      {/* Guardrail events */}
      <p className="kicker mb-2 text-muted-foreground">{t('guardrails.eventsTab')}</p>
      <div className="overflow-x-auto border-y">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/30">
              <TableHead>{t('common.id')}</TableHead>
              <TableHead>{t('guardrails.pattern')}</TableHead>
              <TableHead>{t('guardrails.mode')}</TableHead>
              <TableHead>{t('keys.title')}</TableHead>
              <TableHead>{t('guardrails.matchedInput')}</TableHead>
              <TableHead>{t('usage.timestamp')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center font-mono text-xs text-muted-foreground">
                  {t('guardrails.eventsEmpty')}
                </TableCell>
              </TableRow>
            ) : (
              events.map((ev) => (
                <TableRow key={ev.id} className="border-b hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{ev.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{ev.pattern}</TableCell>
                  <TableCell className="whitespace-nowrap"><ModeBadge mode={ev.mode} /></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{ev.api_key_id.slice(0, 8)}</TableCell>
                  <TableCell className="max-w-xs truncate whitespace-nowrap text-xs" title={ev.input_text}>
                    {ev.input_text}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(ev.created_at)}</TableCell>
                  <TableCell className="py-1 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete event"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteEvent(ev.id)}
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

      {/* Create rule */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('guardrails.modalTitle')}</DialogTitle>
            <DialogDescription>{t('guardrails.modalDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-pattern">{t('guardrails.pattern')}</Label>
              <Input
                id="rule-pattern"
                className="font-mono text-xs"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder={t('guardrails.patternPlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-mode">{t('guardrails.mode')}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v || 'reject')}>
                <SelectTrigger id="rule-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reject">{t('guardrails.modeReject')}</SelectItem>
                  <SelectItem value="replace">{t('guardrails.modeReplace')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'replace' && (
              <div className="grid gap-2">
                <Label htmlFor="rule-replace">{t('guardrails.replaceBy')}</Label>
                <Input
                  id="rule-replace"
                  value={replaceBy}
                  onChange={(e) => setReplaceBy(e.target.value)}
                  placeholder={t('guardrails.replacePlaceholder')}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('common.submitting') : t('guardrails.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t('guardrails.deleteConfirmTitle')}
        description={t('guardrails.deleteConfirmDesc', { pattern: deleteTarget?.pattern || '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => { if (deleteTarget) handleDeleteGuardrail(deleteTarget.id) }}
      />
    </div>
  )
}
