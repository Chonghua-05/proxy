import { useState, useEffect, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, TrendingUpIcon, RefreshCwIcon } from 'lucide-react'

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
import { cn } from '@/lib/utils'
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
  const [rankingTab, setRankingTab] = useState<'keys' | 'models'>('keys')
  const [chartRange, setChartRange] = useState<'7d' | '14d' | '30d' | 'all'>('7d')
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
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

  const rawTimeline = summary?.timeline || []
  
  // 根据 chartRange 过滤最近 N 天，隐藏更早数据，防止图表撑爆溢出
  const timeline = (() => {
    if (chartRange === 'all' || rawTimeline.length === 0) return rawTimeline
    const days = chartRange === '7d' ? 7 : chartRange === '14d' ? 14 : 30
    const now = new Date()
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    
    const filtered = rawTimeline.filter((tp) => {
      // timestamp 格式可能是 "2026-10-15 11:00" 或 ISO
      const t = new Date(tp.timestamp.replace(' ', 'T'))
      return isNaN(t.getTime()) || t >= cutoff
    })
    // 如果筛选后数据较少，至少保留最新 20 个点以防空白
    if (filtered.length < 5 && rawTimeline.length >= 5) {
      return rawTimeline.slice(-20)
    }
    return filtered
  })()

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
        {/* 柱状时序走势：高度 h-56，自适应防溢出 */}
        <div className="lg:col-span-2 flex flex-col justify-between h-56 min-w-0">
          <div className="flex items-center justify-between shrink-0 mb-1 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUpIcon className="size-4 text-brass shrink-0" />
              <h2 className="text-sm font-medium truncate">{t('usage.timelineTitle')}</h2>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {/* 快速范围切换按钮组 */}
              <div className="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-md text-[11px] font-mono">
                {(['7d', '14d', '30d', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setChartRange(r)}
                    className={`px-1.5 py-0.5 rounded transition-all ${
                      chartRange === r
                        ? 'bg-card text-foreground font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r === '7d' ? '近7天' : r === '14d' ? '近14天' : r === '30d' ? '近30天' : '全部'}
                  </button>
                ))}
              </div>
              <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
                {timeline.length} {t('usage.requestsTrend')}
              </span>
            </div>
          </div>

          {timeline.length === 0 ? (
            <div className="flex flex-1 items-center justify-center font-mono text-xs text-muted-foreground border border-dashed rounded-md">
              {t('usage.noChartData')}
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-between pt-2 min-w-0">
              <div className="relative flex-1 flex items-end min-w-0">
                {/* 背景水平参考线 */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-30">
                  <div className="border-b border-dashed border-border w-full" />
                  <div className="border-b border-dashed border-border w-full" />
                  <div className="border-b border-border w-full" />
                </div>

                {/* 柱状图：自适应 flex 均分 */}
                <div className="relative z-10 flex w-full h-full items-end gap-1 px-1 min-w-0">
                  {timeline.map((tp, idx) => {
                    const heightPct = Math.max(8, Math.round((tp.total_tokens / maxTokens) * 100))
                    const isActive = activeIdx === idx
                    const alignClass = idx < 2 ? 'left-0' : idx > timeline.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onMouseLeave={() => setActiveIdx((cur) => (cur === idx ? null : cur))}
                        className="group relative flex flex-1 min-w-0 flex-col items-center justify-end h-full cursor-pointer hover:bg-muted/30 rounded-t-xs transition-colors"
                      >
                        {isActive && (
                          <div
                            className={cn(
                              'absolute -top-12 z-30 whitespace-nowrap rounded-md bg-popover px-2.5 py-1.5 font-mono text-[11px] shadow-lg border text-popover-foreground flex flex-col items-center pointer-events-none animate-in fade-in-0 zoom-in-95',
                              alignClass
                            )}
                          >
                            <span className="text-muted-foreground">{tp.timestamp}</span>
                            <span className="font-medium text-foreground">
                              {tp.total_tokens.toLocaleString()} tokens ({tp.requests} reqs)
                            </span>
                          </div>
                        )}
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={cn(
                            'w-full transition-all rounded-t-xs',
                            isActive ? 'bg-brass shadow-xs' : 'bg-brass/80 group-hover:bg-brass'
                          )}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 平整的时间刻度：动态自适应坐标轴 */}
              <div className="mt-2 flex justify-between border-t pt-1.5 font-mono text-[10px] text-muted-foreground/80 shrink-0 select-none">
                <span>{timeline[0]?.timestamp.slice(5)}</span>
                {timeline.length > 6 && <span>{timeline[Math.floor(timeline.length / 3)]?.timestamp.slice(5)}</span>}
                {timeline.length > 6 && <span>{timeline[Math.floor((timeline.length * 2) / 3)]?.timestamp.slice(5)}</span>}
                <span>{timeline[timeline.length - 1]?.timestamp.slice(5)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 右侧排行榜：高度 h-56，严格与左侧一致，顶部带 Tab 切换 */}
        <div className="flex flex-col justify-between h-56">
          <div className="flex items-center justify-between shrink-0 pb-1 border-b">
            <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-md">
              <button
                type="button"
                onClick={() => setRankingTab('keys')}
                className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                  rankingTab === 'keys'
                    ? 'bg-card text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('usage.topKeysTitle')}
              </button>
              <button
                type="button"
                onClick={() => setRankingTab('models')}
                className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                  rankingTab === 'models'
                    ? 'bg-card text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('usage.topModelsTitle')}
              </button>
            </div>
          </div>

          {/* 榜单内容区：撑满剩余高度并均匀排版 */}
          <div className="flex-1 overflow-y-auto py-2 space-y-2.5">
            {rankingTab === 'keys' ? (
              topKeys.length === 0 ? (
                <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
                  {t('usage.noChartData')}
                </div>
              ) : (
                topKeys.slice(0, 5).map((k, idx) => {
                  const pct = Math.round((k.total_tokens / maxKeyTokens) * 100)
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                          <span className="text-[10px] text-muted-foreground/60 w-3.5">{idx + 1}.</span>
                          <span className="truncate">{keyName(k.api_key_id)}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0">{formatCompact(k.total_tokens)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
                        <div style={{ width: `${pct}%` }} className="h-full bg-brass/90 rounded-full" />
                      </div>
                    </div>
                  )
                })
              )
            ) : (
              topModels.length === 0 ? (
                <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
                  {t('usage.noChartData')}
                </div>
              ) : (
                topModels.slice(0, 5).map((m, idx) => {
                  const pct = Math.round((m.total_tokens / maxModelTokens) * 100)
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                          <span className="text-[10px] text-muted-foreground/60 w-3.5">{idx + 1}.</span>
                          <span className="truncate" title={m.model}>{m.model}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0">{formatCompact(m.total_tokens)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary overflow-hidden rounded-full">
                        <div style={{ width: `${pct}%` }} className="h-full bg-foreground/80 rounded-full" />
                      </div>
                    </div>
                  )
                })
              )
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
