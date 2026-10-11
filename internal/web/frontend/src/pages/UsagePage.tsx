import { useState, useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

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
import { queryUsage, listKeys, listProviders, type UsageRecord, type APIKey, type Provider } from '@/api/client'

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
  const [keys, setKeys] = useState<APIKey[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [filterKeyId, setFilterKeyId] = useState(ALL)
  const [filterProviderId, setFilterProviderId] = useState(ALL)
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [page, setPage] = useState(1)
  const perPage = 50

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

        const [result, k, p] = await Promise.all([
          queryUsage(params),
          listKeys(),
          listProviders(),
        ])
        if (stale) return
        setRecords(result.records || [])
        setTotal(result.total)
        setKeys(k || [])
        setProviders(p || [])
      } catch (err: unknown) {
        if (!stale) setError(err instanceof Error ? err.message : 'Failed to load usage')
      } finally {
        if (!stale) setLoading(false)
      }
    })()
    return () => { stale = true }
  }, [page, filterKeyId, filterProviderId, filterStart, filterEnd])

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  // Compute page-level stats
  const promptTotal = records.reduce((s, r) => s + r.prompt_tokens, 0)
  const completionTotal = records.reduce((s, r) => s + r.completion_tokens, 0)
  const allTotal = records.reduce((s, r) => s + r.total_tokens, 0)

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

  return (
    <div>
      <PageHeader
        index="03"
        title={t('usage.title')}
        description={t('usage.description')}
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

      {/* Stats for the current page of records */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <StatTile label={t('usage.statRequests')} value={total} />
        <StatTile label={t('usage.statPrompt')} value={promptTotal} />
        <StatTile label={t('usage.statCompletion')} value={completionTotal} />
        <StatTile label={t('usage.statTotal')} value={allTotal} />
      </div>

      {/* Records */}
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
