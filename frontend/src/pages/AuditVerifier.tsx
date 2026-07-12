import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import apiClient from '@/services/apiClient'

interface VerifyResult {
  verified: boolean
  status: string
  batchId: string
  computedHash?: string
  onChainHash?: string
  readingsCount?: number
}

interface RecordedBatch {
  deviceAddress: string
  batchId: string
  onChainHash: string
  hourWindowStart: number
  recordedAt: string
  txHash: string
  blockNumber: number
}

const BATCH_ID_REGEX = /^0x[a-fA-F0-9]{64}$/

function validateBatchId(value: string): string | null {
  if (!value.trim()) return 'Batch ID wajib diisi.'
  if (!BATCH_ID_REGEX.test(value.trim())) return 'Format tidak valid. Gunakan 0x diikuti 64 karakter heksadesimal.'
  return null
}

function toDateInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function shortHash(value: string, start = 10, end = 8): string {
  if (!value || value.length <= start + end) return value
  return `${value.slice(0, start)}...${value.slice(-end)}`
}

function HashRow({
  label,
  value,
  highlight,
}: {
  label: string
  value?: string
  highlight?: 'match' | 'mismatch' | 'warning'
}) {
  if (!value) return null
  const colorClass =
    highlight === 'match' ? 'text-green-700 bg-green-50 border-green-200'
    : highlight === 'mismatch' ? 'text-red-700 bg-red-50 border-red-200'
    : highlight === 'warning' ? 'text-amber-800 bg-amber-50 border-amber-200'
    : 'text-muted-foreground bg-muted/40 border-border'

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`break-all rounded border px-3 py-2 font-mono text-xs ${colorClass}`}>{value}</p>
    </div>
  )
}

function VerificationResult({ result }: { result: VerifyResult }) {
  const isValid = result.verified || result.status === 'VALID'
  const isNotRecorded = result.status === 'NOT_RECORDED'
  const hashMatch = isValid || (
    result.computedHash && result.onChainHash &&
    result.computedHash.toLowerCase() === result.onChainHash.toLowerCase()
  )

  const tone = isValid ? 'green' : isNotRecorded ? 'amber' : 'red'
  const borderClass = tone === 'green' ? 'border-green-300' : tone === 'amber' ? 'border-amber-300' : 'border-red-300'
  const titleClass = tone === 'green' ? 'text-green-800' : tone === 'amber' ? 'text-amber-800' : 'text-red-800'
  const badgeClass =
    tone === 'green' ? 'bg-green-100 text-green-800 hover:bg-green-100'
    : tone === 'amber' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
    : 'bg-red-100 text-red-800 hover:bg-red-100'

  return (
    <Card className={`mt-6 border-2 ${borderClass}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {isValid
            ? <CheckCircle2 className="mt-0.5 h-6 w-6 text-green-600" />
            : isNotRecorded
              ? <AlertCircle className="mt-0.5 h-6 w-6 text-amber-600" />
              : <XCircle className="mt-0.5 h-6 w-6 text-red-600" />}
          <div className="min-w-0 flex-1">
            <CardTitle className={`text-lg ${titleClass}`}>
              {isValid ? 'Integritas Valid' : isNotRecorded ? 'Batch Belum Tercatat' : 'Pemeriksaan Integritas Gagal'}
            </CardTitle>
            <CardDescription className="text-xs">
              {isValid
                ? 'Data off-chain sama dengan hash yang tersimpan on-chain.'
                : isNotRecorded
                  ? 'Hash on-chain untuk batch ini belum tersedia.'
                  : 'Hash berbeda. Data off-chain kemungkinan sudah berubah.'}
            </CardDescription>
          </div>
          <Badge className={`shrink-0 ${badgeClass}`}>
            {isValid ? 'VALID' : isNotRecorded ? 'NOT_RECORDED' : 'TAMPERED'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <HashRow label="Batch ID" value={result.batchId} />
        {result.readingsCount !== undefined && (
          <p className="text-xs text-muted-foreground">
            Jumlah reading: <span className="font-medium text-foreground">{result.readingsCount}</span>
          </p>
        )}
        <HashRow
          label="Hash Hitung Ulang (off-chain)"
          value={result.computedHash}
          highlight={hashMatch ? 'match' : isNotRecorded ? 'warning' : 'mismatch'}
        />
        <HashRow
          label="Hash On-chain"
          value={result.onChainHash}
          highlight={hashMatch ? 'match' : isNotRecorded ? 'warning' : 'mismatch'}
        />
      </CardContent>
    </Card>
  )
}

export default function AuditVerifier() {
  const [searchParams] = useSearchParams()
  const [batchId, setBatchId] = useState(searchParams.get('batchId') ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()))

  const {
    data: recordedBatches = [],
    isLoading: isLoadingBatches,
    isError: isBatchesError,
    error: batchesError,
    refetch: refetchBatches,
    isFetching: isFetchingBatches,
  } = useQuery<RecordedBatch[], Error>({
    queryKey: ['recorded-batches'],
    queryFn: async () => {
      const res = await apiClient.get<RecordedBatch[]>('/api/audit/batches')
      return res.data
    },
    refetchInterval: 60_000,
  })

  const { mutate, data, isPending, error, reset } = useMutation<VerifyResult, Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiClient.get<VerifyResult>(`/api/audit/verify/${id}`)
      return res.data
    },
  })

  const filteredBatches = recordedBatches.filter((batch) => {
    return toDateInputValue(new Date(batch.recordedAt)) === selectedDate
  })

  const verifyBatch = (id: string) => {
    const normalized = id.trim()
    const err = validateBatchId(normalized)
    if (err) {
      setValidationError(err)
      return
    }

    setBatchId(normalized)
    setValidationError(null)
    reset()
    mutate(normalized)
  }

  useEffect(() => {
    const fromUrl = searchParams.get('batchId')
    if (fromUrl && BATCH_ID_REGEX.test(fromUrl)) {
      verifyBatch(fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    verifyBatch(batchId)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBatchId(e.target.value)
    if (validationError) setValidationError(null)
  }

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">Audit Verifier</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="h-5 w-5 text-primary" />
                  Batch Tercatat
                </CardTitle>
                <CardDescription>Event HashRecorded dari EnergyPlatform.sol</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="recorded-date" className="sr-only">Tanggal batch tercatat</label>
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <input
                    id="recorded-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent text-sm outline-none"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchBatches()}
                  disabled={isFetchingBatches}
                  title="Segarkan daftar batch"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetchingBatches ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isBatchesError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{batchesError.message}</span>
              </div>
            )}

            {isLoadingBatches && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                ))}
              </div>
            )}

            {!isLoadingBatches && !isBatchesError && filteredBatches.length === 0 && (
              <p className="rounded-md border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                Belum ada batch tercatat pada tanggal ini.
              </p>
            )}

            {!isLoadingBatches && !isBatchesError && filteredBatches.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Waktu Tercatat', 'Batch ID', 'Gateway', 'Block', 'Aksi'].map((header) => (
                        <th key={header} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredBatches.map((batch) => (
                      <tr key={`${batch.txHash}-${batch.batchId}`} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {new Date(batch.recordedAt).toLocaleString('id-ID')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs" title={batch.batchId}>
                          {shortHash(batch.batchId)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs" title={batch.deviceAddress}>
                          {shortHash(batch.deviceAddress, 8, 6)}
                        </td>
                        <td className="px-3 py-2 text-xs">{batch.blockNumber}</td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => verifyBatch(batch.batchId)}
                            disabled={isPending}
                          >
                            {isPending && batchId === batch.batchId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Search className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Verifikasi</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verifikasi Manual</CardTitle>
            <CardDescription>Tempel Batch ID jika ingin mengecek nilai tertentu.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <label htmlFor="batch-id-input" className="text-sm font-medium">Batch ID</label>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <input
                    id="batch-id-input"
                    type="text"
                    value={batchId}
                    onChange={handleChange}
                    placeholder="0x0000...0000"
                    spellCheck={false}
                    autoComplete="off"
                    className={`min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring ${validationError ? 'border-destructive focus:ring-destructive' : 'border-input'}`}
                  />
                  <Button type="submit" disabled={isPending} className="shrink-0">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1.5">{isPending ? 'Memverifikasi...' : 'Verifikasi'}</span>
                  </Button>
                </div>
                {validationError && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{validationError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Format: <span className="font-mono">0x</span> diikuti 64 karakter heksadesimal.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error.message}</span>
        </div>
      )}

      {data && <VerificationResult result={data} />}
    </div>
  )
}
