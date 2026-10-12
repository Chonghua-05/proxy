import { useState, useEffect, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, BarChart3Icon, TrendingUpIcon, PieChartIcon, RefreshCwIcon } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import DismissibleAlert from '@/components/DismissibleAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1.5 py-3 sm:py-4">
      <CardContent className="px-3 sm:px-4">
        <p className="kicker text-muted-foreground truncate">{label}</p>
        <p className="mt-1 font-mono text-xl sm:text-2xl font-medium" title={value.toLocaleString()}>
          {formatCompact(value)}
        </p>
      </CardContent>
    </Card>
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
    <div>
      <PageHeader
        index="03"
        title={t('usage.title')}
        description={t('usage.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={refreshing || loading}
            className="gap-1.5"
            aria-label={t('common.refresh')}
          >
            <RefreshCwIcon className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? t('common.refreshing') : t('common.refresh')}</span>
          </Button>
        }
      />

      {error && <DismissibleAlert variant="destructive" className="mb-4" onClose={() => setError('')}>{error}</DismissibleAlert>}

      {/* Filters */}
      <Card className="mb-4 py-4">
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap items-end gap-3 sm:gap-4 px-3 sm:px-4">
          <div className="grid gap-1.5 w-full lg:w-48">
            <Label htmlFor="filter-key">{t('usage.filterKey')}</Label>
            <Select value={filterKeyId} onValueChange={(v) => { setFilterKeyId(v); setPage(1) }}>
              <SelectTrigger id="filter-key" size="sm" className="w-full">
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
          <div className="grid gap-1.5 w-full lg:w-48">
            <Label htmlFor="filter-provider">{t('usage.filterProvider')}</Label>
            <Select value={filterProviderId} onValueChange={(v) => { setFilterProviderId(v); setPage(1) }}>
              <SelectTrigger id="filter-provider" size="sm" className="w-full">
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
          <div className="grid gap-1.5 w-full lg:w-44">
            <Label htmlFor="filter-start">{t('usage.filterStart')}</Label>
            <Input
              id="filter-start"
              type="datetime-local"
              className="h-8 font-mono text-xs w-full"
              value={filterStart}
              onChange={(e) => { setFilterStart(e.target.value); setPage(1) }}
            />
          </div>
          <div className="grid gap-1.5 w-full lg:w-44">
            <Label htmlFor="filter-end">{t('usage.filterEnd')}</Label>
            <Input
              id="filter-end"
              type="datetime-local"
              className="h-8 font-mono text-xs w-full"
              value={filterEnd}
              onChange={(e) => { setFilterEnd(e.target.value); setPage(1) }}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={clearFilters} className="w-full sm:w-auto mt-2 sm:mt-0">
            {t('usage.clearFilters')}
          </Button>
        </CardContent>
      </Card>

      {/* Stats overall */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <StatTile label={t('usage.statRequests')} value={summary?.total_requests || total} />
        <StatTile label={t('usage.statPrompt')} value={summary?.total_prompt || 0} />
        <StatTile label={t('usage.statCompletion')} value={summary?.total_completion || 0} />
        <StatTile label={t('usage.statTotal')} value={summary?.total_tokens || 0} />
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Timeline Bar Chart */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-brass" />
              <h2 className="text-sm font-medium">{t('usage.timelineTitle')}</h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {timeline.length} {t('usage.requestsTrend')}
            </span>
          </div>

          {timeline.length === 0 ? (
            <div className="flex h-40 items-center justify-center font-mono text-xs text-muted-foreground">
              {t('usage.noChartData')}
            </div>
          ) : (
            <div className="flex h-44 items-end gap-1.5 pt-4 overflow-x-auto pb-2 border-b">
              {timeline.map((tp, idx) => {
                const heightPct = Math.max(8, Math.round((tp.total_tokens / maxTokens) * 100))
                const shortTime = tp.timestamp.slice(5)
                return (
                  <div
                    key={idx}
                    className="group relative flex flex-1 min-w-[20px] flex-col items-center justify-end h-full"
                  >
                    <div className="absolute -top-10 z-10 hidden whitespace-nowrap rounded bg-popover px-2 py-1 font-mono text-[11px] shadow border text-popover-foreground group-hover:flex flex-col items-center">
                      <span>{tp.timestamp}</span>
                      <span>{tp.total_tokens.toLocaleString()} tokens ({tp.requests} reqs)</span>
                    </div>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full rounded-xs bg-brass/80 transition-all group-hover:bg-brass"
                    />
                    <span className="mt-1 font-mono text-[9px] text-muted-foreground/70 -rotate-45 truncate max-w-[28px]">
                      {shortTime}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Top Models & Top Keys Distribution */}
        <Card className="p-4 flex flex-col justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3Icon className="size-4 text-brass" />
              <h2 className="text-sm font-medium">{t('usage.topModelsTitle')}</h2>
            </div>
            {topModels.length === 0 ? (
              <p className="py-4 text-center font-mono text-xs text-muted-foreground">{t('usage.noChartData')}</p>
            ) : (
              <div className="space-y-2.5">
                {topModels.slice(0, 5).map((m, idx) => {
                  const pct = Math.round((m.total_tokens / maxModelTokens) * 100)
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="truncate max-w-[150px]" title={m.model}>{m.model}</span>
                        <span className="text-muted-foreground">{formatCompact(m.total_tokens)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className="h-full bg-foreground/80 rounded-full" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t">
            <div className="mb-2 flex items-center gap-2">
              <PieChartIcon className="size-4 text-brass" />
              <h2 className="text-sm font-medium">{t('usage.topKeysTitle')}</h2>
            </div>
            {topKeys.length === 0 ? (
              <p className="py-2 text-center font-mono text-xs text-muted-foreground">{t('usage.noChartData')}</p>
            ) : (
              <div className="space-y-2">
                {topKeys.slice(0, 3).map((k, idx) => {
                  const pct = Math.round((k.total_tokens / maxKeyTokens) * 100)
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="truncate max-w-[150px]">{keyName(k.api_key_id)}</span>
                        <span className="text-muted-foreground">{formatCompact(k.total_tokens)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className="h-full bg-brass/90 rounded-full" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Detailed Request Logs */}
      <p className="kicker mb-2 text-muted-foreground">{t('usage.recentLogs')}</p>
      <Card className="gap-0 py-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={8} className="py-6 text-center font-mono text-xs text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center font-mono text-xs text-muted-foreground">
                    {t('usage.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
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
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {t('common.page')} {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
