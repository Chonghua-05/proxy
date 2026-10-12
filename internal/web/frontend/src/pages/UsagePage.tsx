import { useState, useEffect, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, TrendingUpIcon, BarChart3Icon, PieChartIcon, RefreshCwIcon } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import { Button } from '@/components/ui/button'
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
import { formatCompact, formatDateTime } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import {
  queryUsage,
  getUsageSummary,
  listKeys,
  listProviders,
  type UsageRecord,
  type UsageSummary,
  type APIKey,
  type Provider,
} from '@/api/client'

const ALL = 'all'

function MetricItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col py-0.5">
      <span className="text-[11px] font-mono tracking-wider uppercase text-muted-foreground">{label}</span>
      <span className="mt-1 font-mono text-xl font-medium tracking-tight" title={value.toLocaleString()}>
        {formatCompact(value)}
      </span>
    </div>
  )
}

export default function UsagePage() {
  const { t } = useI18n()
  const [records, setRecords] = useState<UsageRecord[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [keys, setKeys] = useState<APIKey[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Filters
  const [filterKeyId, setFilterKeyId] = useState(ALL)
  const [filterProviderId, setFilterProviderId] = useState(ALL)
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 50

  const [refreshTick, setRefreshTick] = useState(0)
  const reload = useCallback(() => {
    setRefreshing(true)
    setRefreshTick((t) => t + 1)
  }, [])

  useEffect(() => {
    let stale = false
    ;(async () => {
      try {
        const params: Record<string, string> = {
          limit: String(perPage),
          offset: String((page - 1) * perPage),
        }
        if (filterKeyId !== ALL) params.api_key_id = filterKeyId
        if (filterProviderId !== ALL) params.provider_id = filterProviderId
        if (filterStart) params.start = new Date(filterStart).toISOString()
        if (filterEnd) params.end = new Date(filterEnd).toISOString()

        const summaryParams: Record<string, string> = {}
        if (filterKeyId !== ALL) summaryParams.api_key_id = filterKeyId
        if (filterProviderId !== ALL) summaryParams.provider_id = filterProviderId
        if (filterStart) summaryParams.start = new Date(filterStart).toISOString()
        if (filterEnd) summaryParams.end = new Date(filterEnd).toISOString()

        const [result, sum, k, p] = await Promise.all([
          queryUsage(params),
          getUsageSummary(summaryParams),
          listKeys(),
          listProviders(),
        ])
        if (stale) return
        setRecords(result.records || [])
        setTotal(result.total)
        setSummary(sum)
        setKeys(k || [])
        setProviders(p || [])
      } catch (err: unknown) {
        if (!stale) setError(err instanceof Error ? err.message : 'Failed to load usage')
      } finally {
        if (!stale) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()
    return () => { stale = true }
  }, [page, filterKeyId, filterProviderId, filterStart, filterEnd, refreshTick])

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  function keyName(id: string): string {
    return keys.find((k) => k.id === id)?.name || id.slice(0, 8)
  }

  function providerName(id: string): string {
    return providers.find((p) => p.id === id)?.name || id.slice(0, 8)
  }

  function clearFilters() {
    setFilterKeyId(ALL)
    setFilterProviderId(ALL)
    setFilterStart('')
    setFilterEnd('')
    setPage(1)
  }

  const timeline = summary?.timeline || []
  const maxTokens = Math.max(1, ...timeline.map((tp) => tp.total_tokens))

  const topModels = summary?.top_models || []
  const maxModelTokens = Math.max(1, ...topModels.map((m) => m.total_tokens))

  const topKeys = summary?.top_keys || []
  const maxKeyTokens = Math.max(1, ...topKeys.map((k) => k.total_tokens))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('usage.title')}
        description={t('usage.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={refreshing || loading}
            className="h-8 gap-1.5 text-xs"
            aria-label={t('common.refresh')}
          >
            <RefreshCwIcon className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? t('common.refreshing') : t('common.refresh')}</span>
          </Button>
        }
      />

      {error && <DismissibleAlert variant="destructive" onClose={() => setError('')}>{error}</DismissibleAlert>}

      {/* 指标条 */}
      <div className="grid grid-cols-2 gap-4 pb-5 border-b sm:grid-cols-4">
        <MetricItem label={t('usage.statRequests')} value={summary?.total_requests || total} />
        <MetricItem label={t('usage.statPrompt')} value={summary?.total_prompt || 0} />
        <MetricItem label={t('usage.statCompletion')} value={summary?.total_completion || 0} />
        <MetricItem label={t('usage.statTotal')} value={summary?.total_tokens || 0} />
      </div>

      {/* 筛选器 */}
      <div className="flex flex-wrap items-center gap-3 pb-5 border-b text-xs">
        <div className="flex items-center gap-2">
          <Label htmlFor="filter-key" className="text-xs text-muted-foreground shrink-0">{t('usage.filterKey')}</Label>
          <Select value={filterKeyId} onValueChange={(v) => { setFilterKeyId(v); setPage(1) }}>
            <SelectTrigger id="filter-key" size="sm" className="h-8 w-36 bg-card/50 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {keys.map((k) => (
                <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-provider" className="text-xs text-muted-foreground shrink-0">{t('usage.filterProvider')}</Label>
          <Select value={filterProviderId} onValueChange={(v) => { setFilterProviderId(v); setPage(1) }}>
            <SelectTrigger id="filter-provider" size="sm" className="h-8 w-36 bg-card/50 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-start" className="text-xs text-muted-foreground shrink-0">{t('usage.filterStart')}</Label>
          <Input
            id="filter-start"
            type="datetime-local"
            className="h-8 w-44 font-mono text-xs bg-card/50"
            value={filterStart}
            onChange={(e) => { setFilterStart(e.target.value); setPage(1) }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="filter-end" className="text-xs text-muted-foreground shrink-0">{t('usage.filterEnd')}</Label>
          <Input
            id="filter-end"
            type="datetime-local"
            className="h-8 w-44 font-mono text-xs bg-card/50"
            value={filterEnd}
            onChange={(e) => { setFilterEnd(e.target.value); setPage(1) }}
          />
        </div>

        {(filterKeyId !== ALL || filterProviderId !== ALL || filterStart || filterEnd) && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
            {t('usage.clearFilters')}
          </Button>
        )}
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 gap-8 pb-6 border-b lg:grid-cols-3">
        {/* 柱状时序走势：固定 h-72 撑满上下 */}
        <div className="lg:col-span-2 flex flex-col justify-between h-72">
          <div className="flex items-center justify-between shrink-0 mb-1">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-brass" />
              <h2 className="text-sm font-medium">{t('usage.timelineTitle')}</h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {timeline.length} {t('usage.requestsTrend')}
            </span>
          </div>

          {timeline.length === 0 ? (
            <div className="flex flex-1 items-center justify-center font-mono text-xs text-muted-foreground border border-dashed rounded-md">
              {t('usage.noChartData')}
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-between pt-1">
              <div className="relative flex-1 flex items-end">
                {/* 背景水平参考线 */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-30">
                  <div className="border-b border-dashed border-border w-full" />
                  <div className="border-b border-dashed border-border w-full" />
                  <div className="border-b border-border w-full" />
                </div>

                {/* 柱状图 */}
                <div className="relative z-10 flex w-full h-full items-end gap-1.5 px-1">
                  {timeline.map((tp, idx) => {
                    const heightPct = Math.max(6, Math.round((tp.total_tokens / maxTokens) * 100))
                    return (
                      <div
                        key={idx}
                        className="group relative flex flex-1 min-w-[10px] flex-col items-center justify-end h-full"
                      >
                        <div className="absolute -top-12 z-20 hidden whitespace-nowrap rounded-md bg-popover px-2.5 py-1.5 font-mono text-[11px] shadow-lg border text-popover-foreground group-hover:flex flex-col items-center pointer-events-none">
                          <span className="text-muted-foreground">{tp.timestamp}</span>
                          <span className="font-medium text-foreground">{tp.total_tokens.toLocaleString()} tokens ({tp.requests} reqs)</span>
                        </div>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full bg-brass/80 hover:bg-brass transition-all rounded-t-xs"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 平整的时间刻度 */}
              <div className="mt-2 flex justify-between border-t pt-1.5 font-mono text-[10px] text-muted-foreground/80 shrink-0">
                <span>{timeline[0]?.timestamp.slice(5)}</span>
                {timeline.length > 4 && <span>{timeline[Math.floor(timeline.length / 2)]?.timestamp.slice(5)}</span>}
                <span>{timeline[timeline.length - 1]?.timestamp.slice(5)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 模型分布与活跃 Key 排行：固定 h-72，严格等高 */}
        <div className="flex flex-col justify-between h-72">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3Icon className="size-4 text-brass" />
              <h2 className="text-sm font-medium">{t('usage.topModelsTitle')}</h2>
            </div>
            {topModels.length === 0 ? (
              <p className="py-2 font-mono text-xs text-muted-foreground">{t('usage.noChartData')}</p>
            ) : (
              <div className="space-y-2 pt-0.5">
                {topModels.slice(0, 4).map((m, idx) => {
                  const pct = Math.round((m.total_tokens / maxModelTokens) * 100)
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="truncate max-w-[150px]" title={m.model}>{m.model}</span>
                        <span className="text-muted-foreground">{formatCompact(m.total_tokens)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
                        <div style={{ width: `${pct}%` }} className="h-full bg-foreground/80 rounded-full" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t">
            <div className="flex items-center gap-2">
              <PieChartIcon className="size-4 text-brass" />
              <h2 className="text-sm font-medium">{t('usage.topKeysTitle')}</h2>
            </div>
            {topKeys.length === 0 ? (
              <p className="py-2 font-mono text-xs text-muted-foreground">{t('usage.noChartData')}</p>
            ) : (
              <div className="space-y-2 pt-0.5">
                {topKeys.slice(0, 2).map((k, idx) => {
                  const pct = Math.round((k.total_tokens / maxKeyTokens) * 100)
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="truncate max-w-[150px]">{keyName(k.api_key_id)}</span>
                        <span className="text-muted-foreground">{formatCompact(k.total_tokens)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
                        <div style={{ width: `${pct}%` }} className="h-full bg-brass/90 rounded-full" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 明细日志 */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{t('usage.recentLogs')}</h3>
        <div className="overflow-x-auto border-y">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/20">
                <TableHead>{t('common.id')}</TableHead>
                <TableHead>{t('keys.title')}</TableHead>
                <TableHead>{t('keys.provider')}</TableHead>
                <TableHead>{t('usage.model')}</TableHead>
                <TableHead className="text-right">Prompt</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>{t('usage.timestamp')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center font-mono text-xs text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center font-mono text-xs text-muted-foreground">
                    {t('usage.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id} className="border-b hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{r.id.slice(0, 8)}</TableCell>
                    <TableCell className="whitespace-nowrap">{keyName(r.api_key_id)}</TableCell>
                    <TableCell className="whitespace-nowrap">{providerName(r.provider_id)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">{r.model}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{r.prompt_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{r.completion_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium tabular-nums">{r.total_tokens.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="pt-2 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              {t('common.page')} {page} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
