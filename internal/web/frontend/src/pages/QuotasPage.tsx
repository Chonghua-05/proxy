import { useState, useEffect, useCallback } from 'react'
import {
  RotateCwIcon,
  ServerIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  HelpCircleIcon,
  LayersIcon,
  SearchIcon,
  CopyIcon,
  CheckIcon,
} from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { listQuotas, getProviderQuota, type QuotaResult, type QuotaBucket } from '@/api/client'
import { cn } from '@/lib/utils'

function StatusBadge({ status }: { status: QuotaResult['status'] }) {
  const { t } = useI18n()
  switch (status) {
    case 'ok':
      return (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1 font-mono text-xs">
          <CheckCircle2Icon className="size-3" />
          {t('quotas.statusOk')}
        </Badge>
      )
    case 'warning':
      return (
        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1 font-mono text-xs">
          <AlertTriangleIcon className="size-3" />
          {t('quotas.statusWarning')}
        </Badge>
      )
    case 'exhausted':
      return (
        <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10 gap-1 font-mono text-xs">
          <XCircleIcon className="size-3" />
          {t('quotas.statusExhausted')}
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10 gap-1 font-mono text-xs">
          <XCircleIcon className="size-3" />
          {t('quotas.statusError')}
        </Badge>
      )
    default:
      return (
        <Badge variant="secondary" className="gap-1 font-mono text-xs">
          <HelpCircleIcon className="size-3" />
          {t('quotas.statusUnsupported')}
        </Badge>
      )
  }
}

function BucketProgressBar({
  bucket,
  onViewModels,
}: {
  bucket: QuotaBucket
  onViewModels?: (bucket: QuotaBucket) => void
}) {
  const { t } = useI18n()
  const pct = bucket.remaining_percent ?? (bucket.remaining_fraction !== undefined ? bucket.remaining_fraction * 100 : null)
  let barColor = 'bg-primary'
  if (pct !== null) {
    if (pct <= 20) barColor = 'bg-rose-500'
    else if (pct <= 50) barColor = 'bg-amber-500'
    else barColor = 'bg-emerald-500'
  }

  const title = bucket.display_name || bucket.model_id
  const hasModels = bucket.models && bucket.models.length > 0

  return (
    <div className="flex flex-col gap-2 p-3.5 rounded-lg border border-border/50 bg-card/70 hover:bg-card/90 transition-colors">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-foreground truncate" title={bucket.model_id}>
            {title}
          </span>
          {bucket.window && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase shrink-0 font-normal">
              {bucket.window === 'weekly' ? '周度' : bucket.window === '5h' ? '5小时' : bucket.window}
            </Badge>
          )}
        </div>
        <span className="font-bold text-sm tracking-tight text-foreground ml-2 shrink-0">
          {pct !== null ? `${pct.toFixed(1)}%` : '—'}
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300 rounded-full', barColor)}
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
        />
      </div>

      <div className="text-[11px] text-muted-foreground flex items-center justify-between font-mono pt-0.5">
        <span>重置时间</span>
        <span>{bucket.reset_time_formatted || '—'}</span>
      </div>

      {hasModels && (
        <div className="pt-2 border-t border-border/30 mt-0.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onViewModels?.(bucket)}
            className="flex items-center gap-1.5 text-xs font-mono text-foreground/80 hover:text-foreground hover:underline transition-colors py-0.5 group"
          >
            <LayersIcon className="size-3.5 text-brass group-hover:scale-110 transition-transform" />
            <span>{t('quotas.viewModels')} ({bucket.models?.length})</span>
          </button>
          <span className="text-[10px] font-mono text-muted-foreground/60">{t('quotas.clickToView')}</span>
        </div>
      )}
    </div>
  )
}

function ModelsDialog({
  bucket,
  open,
  onOpenChange,
}: {
  bucket: QuotaBucket | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState('')
  const [copiedModel, setCopiedModel] = useState<string | null>(null)

  if (!bucket) return null

  const models = bucket.models || []
  const filtered = models.filter((m) =>
    m.toLowerCase().includes(filter.toLowerCase()),
  )

  const handleCopy = (m: string) => {
    navigator.clipboard.writeText(m)
    setCopiedModel(m)
    setTimeout(() => setCopiedModel(null), 1800)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <LayersIcon className="size-4 text-brass" />
            <DialogTitle className="font-mono text-base">
              {bucket.display_name || bucket.model_id} {t('quotas.modelsModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs font-mono text-muted-foreground">
            {t('quotas.modelsModalDesc', { count: models.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {models.length > 5 && (
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('quotas.modelsSearchPlaceholder')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 h-8 text-xs font-mono"
              />
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pr-1">
            {filtered.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground py-8 text-center">
                {t('quotas.modelsEmpty')}
              </div>
            ) : (
              filtered.map((m) => (
                <div
                  key={m}
                  className="flex items-center justify-between p-2 rounded-md border border-border/40 bg-card/60 hover:bg-card text-xs font-mono transition-colors"
                >
                  <span className="font-medium text-foreground select-all">{m}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(m)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                    title={t('common.copy')}
                  >
                    {copiedModel === m ? (
                      <>
                        <CheckIcon className="size-3 text-emerald-500" />
                        <span className="text-emerald-500">{t('common.copied')}</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="size-3" />
                        <span>{t('common.copy')}</span>
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function QuotasPage() {
  const { t } = useI18n()
  const [quotas, setQuotas] = useState<QuotaResult[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [selectedBucketForModels, setSelectedBucketForModels] = useState<QuotaBucket | null>(null)

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    setError('')
    try {
      const data = await listQuotas()
      setQuotas(data || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load quotas')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function refreshSingle(id: string) {
    setRefreshingId(id)
    try {
      const res = await getProviderQuota(id)
      setQuotas((prev) => prev.map((q) => (q.provider_id === id ? res : q)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh quota')
    } finally {
      setRefreshingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        index="02"
        title={t('quotas.title')}
        description={t('quotas.description')}
        actions={
          <Button
            variant="outline"
            onClick={() => fetchAll(true)}
            disabled={loading || refreshing}
            className="w-full sm:w-auto gap-2"
          >
            <RotateCwIcon className={cn('size-4', (refreshing || loading) && 'animate-spin')} />
            {t('quotas.refreshAll')}
          </Button>
        }
      />

      {error && (
        <DismissibleAlert variant="destructive" onClose={() => setError('')}>
          {error}
        </DismissibleAlert>
      )}

      {loading ? (
        <div className="py-16 text-center font-mono text-xs text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : quotas.length === 0 ? (
        <div className="py-16 text-center font-mono text-xs text-muted-foreground border rounded-lg">
          {t('quotas.empty')}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {quotas.map((q) => (
            <Card key={q.provider_id} className="border-border/60 shadow-xs bg-card/70 flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <ServerIcon className="size-4 text-muted-foreground" />
                        <CardTitle className="text-base font-semibold">{q.provider_name}</CardTitle>
                      </div>
                      <CardDescription className="font-mono text-xs">
                        {q.account ? (
                          <span className="text-foreground/80 font-medium">{q.account}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {q.quota_type === 'none' ? '未绑定独立号源' : `类型: ${q.quota_type}`}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={q.status} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={refreshingId === q.provider_id}
                        onClick={() => refreshSingle(q.provider_id)}
                        className="text-muted-foreground hover:text-foreground"
                        title="刷新该提供商额度"
                      >
                        <RotateCwIcon className={cn('size-3.5', refreshingId === q.provider_id && 'animate-spin')} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  {q.message && q.status === 'error' && (
                    <div className="p-3 mb-3 rounded-lg bg-destructive/10 text-destructive font-mono text-xs">
                      {q.message}
                    </div>
                  )}

                  {q.balance !== undefined && q.balance !== null && (
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/40 flex items-center justify-between font-mono">
                      <span className="text-xs text-muted-foreground">{t('quotas.balance')}</span>
                      <span className="text-lg font-bold text-foreground">
                        {q.balance.toFixed(2)} {q.currency || 'USD'}
                      </span>
                    </div>
                  )}

                  {q.buckets && q.buckets.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-mono font-medium text-muted-foreground">
                        <span>{t('quotas.modelQuota')} ({q.buckets.length})</span>
                        <span className="text-[11px] text-muted-foreground/80">点击条目可查看涵盖模型</span>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {q.buckets.map((b) => (
                          <BucketProgressBar
                            key={b.model_id}
                            bucket={b}
                            onViewModels={(bucket) => setSelectedBucketForModels(bucket)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {q.quota_type === 'none' && (!q.buckets || q.buckets.length === 0) && (
                    <div className="py-6 text-center text-xs text-muted-foreground font-mono">
                      当前未启用额度监控。可在模型提供商中将额度驱动设置为对应类型。
                    </div>
                  )}
                </CardContent>
              </div>

              <div className="px-6 py-3 border-t border-border/30 bg-muted/10 text-[11px] font-mono text-muted-foreground/70 flex justify-between items-center">
                <span>更新时间: {new Date(q.updated_at).toLocaleTimeString()}</span>
                <span className="capitalize">驱动: {q.quota_type}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ModelsDialog
        bucket={selectedBucketForModels}
        open={!!selectedBucketForModels}
        onOpenChange={(open) => {
          if (!open) setSelectedBucketForModels(null)
        }}
      />
    </div>
  )
}
