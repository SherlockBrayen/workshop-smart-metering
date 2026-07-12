import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { Zap, Activity, Gauge, Battery, Radio, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import apiClient from '@/services/apiClient'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface EnergyReading {
  measuredAt: string
  voltage: number
  current: number
  power: number
  energy: number
  energyDelta: number
  frequency: number
  powerFactor: number
  batchId: string
}

type MetricKey = 'power' | 'voltage' | 'current'

const metricConfig: Record<MetricKey, {
  label: string
  unit: string
  color: string
  decimals: number
  defaultMax: number
  step: number
}> = {
  power: {
    label: 'Daya (W)',
    unit: 'W',
    color: 'hsl(142, 76%, 36%)',
    decimals: 1,
    defaultMax: 500,
    step: 50,
  },
  voltage: {
    label: 'Tegangan (V)',
    unit: 'V',
    color: 'hsl(221, 83%, 53%)',
    decimals: 1,
    defaultMax: 220,
    step: 10,
  },
  current: {
    label: 'Arus (A)',
    unit: 'A',
    color: 'hsl(38, 92%, 50%)',
    decimals: 3,
    defaultMax: 4,
    step: 0.5,
  },
}

const ROOM_COLORS: Record<number, string> = {
  1: 'hsl(142, 76%, 36%)',
  2: 'hsl(221, 83%, 53%)',
  3: 'hsl(38, 92%, 50%)',
  4: 'hsl(280, 70%, 50%)',
  5: 'hsl(0, 84%, 55%)',
}

function fmt(value: number | undefined, decimals = 2): string {
  if (value === undefined || value === null) return '-'
  return value.toFixed(decimals)
}

function getMetricDomain(metric: MetricKey, values: number[]): [number, number] {
  const cfg = metricConfig[metric]
  const maxValue = values.length > 0 ? Math.max(...values) : 0

  if (maxValue <= cfg.defaultMax) {
    return [0, cfg.defaultMax]
  }

  const padded = maxValue * 1.1
  const upper = Math.ceil(padded / cfg.step) * cfg.step
  return [0, Number(upper.toFixed(3))]
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="space-y-1 rounded-lg border bg-background p-3 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">{Number(entry.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

function PowerChart({ data, room }: { data: EnergyReading[]; room: number }) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('power')

  if (data.length < 2) {
    return <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">Minimal 2 data diperlukan untuk menampilkan grafik</div>
  }

  const chartData = [...data]
    .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime())
    .map((d) => ({
      time: new Date(d.measuredAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      fullTime: new Date(d.measuredAt).toLocaleString('id-ID'),
      power: parseFloat(d.power.toFixed(2)),
      voltage: parseFloat(d.voltage.toFixed(1)),
      current: parseFloat(d.current.toFixed(3)),
    }))

  const cfg = metricConfig[activeMetric]
  const values = chartData.map((d) => d[activeMetric])
  const [yMin, yMax] = getMetricDomain(activeMetric, values)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const avgVal = parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(cfg.decimals))
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(metricConfig) as MetricKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveMetric(key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeMetric === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {metricConfig[key].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-muted/50 px-3 py-2"><p className="text-muted-foreground">Min</p><p className="font-semibold">{minVal.toFixed(cfg.decimals)} {cfg.unit}</p></div>
        <div className="rounded-md bg-muted/50 px-3 py-2"><p className="text-muted-foreground">Rata-rata</p><p className="font-semibold">{avgVal.toFixed(cfg.decimals)} {cfg.unit}</p></div>
        <div className="rounded-md bg-muted/50 px-3 py-2"><p className="text-muted-foreground">Maks</p><p className="font-semibold">{maxVal.toFixed(cfg.decimals)} {cfg.unit}</p></div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="time" label={{ value: 'Waktu Pengukuran', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={tickInterval} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
          <YAxis domain={[yMin, yMax]} label={{ value: cfg.label, angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} width={55} />
          <Tooltip content={<CustomTooltip />} labelFormatter={(label) => { const found = chartData.find((d) => d.time === label); return found ? found.fullTime : label }} />
          <ReferenceLine y={avgVal} stroke={cfg.color} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: `Rata-rata: ${avgVal.toFixed(cfg.decimals)} ${cfg.unit}`, position: 'right', fontSize: 9, fill: cfg.color }} />
          <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }} />
          <Line type="monotone" dataKey={activeMetric} name={cfg.label} stroke={cfg.color} strokeWidth={2} dot={chartData.length <= 30 ? { r: 3, fill: cfg.color } : false} activeDot={{ r: 5, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-right text-xs text-muted-foreground">Kamar {room} - {data.length} pembacaan</p>
    </div>
  )
}

function AllRoomsChart({ allData }: { allData: Record<number, EnergyReading[]> }) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('power')
  const cfg = metricConfig[activeMetric]

  const roomEntries = Object.entries(allData)
    .map(([roomStr, readings]) => ({
      room: Number(roomStr),
      sorted: [...readings].sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()),
    }))
    .filter((e) => e.sorted.length >= 2)

  if (roomEntries.length === 0) {
    return <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">Minimal 2 data diperlukan untuk menampilkan grafik</div>
  }

  const maxLen = Math.max(...roomEntries.map((e) => e.sorted.length))
  const values: number[] = []
  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const refRoom = roomEntries.find((e) => e.sorted[i])
    const ts = refRoom ? new Date(refRoom.sorted[i].measuredAt) : new Date()
    const entry: Record<string, string | number | null> = {
      time: ts.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      fullTime: ts.toLocaleString('id-ID'),
    }

    for (const { room, sorted } of roomEntries) {
      const reading = sorted[i]
      const value = reading ? parseFloat(reading[activeMetric].toFixed(activeMetric === 'current' ? 3 : 1)) : null
      entry[`room${room}`] = value
      if (typeof value === 'number') values.push(value)
    }

    return entry
  })

  const [yMin, yMax] = getMetricDomain(activeMetric, values)
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8))

  const totalPerRoom: Record<number, number> = {}
  for (const [roomStr, readings] of Object.entries(allData)) {
    const room = Number(roomStr)
    totalPerRoom[room] = readings.reduce((sum, r) => sum + (r.energyDelta ?? 0), 0)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(metricConfig) as MetricKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveMetric(key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activeMetric === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {metricConfig[key].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((room) => (
          <div key={room} className="rounded-md bg-muted/50 px-3 py-2" style={{ borderLeft: `3px solid ${ROOM_COLORS[room]}` }}>
            <p className="text-muted-foreground">Kamar {room}</p>
            <p className="font-semibold">{((totalPerRoom[room] ?? 0) * 1000).toFixed(3)} Wh</p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="time" label={{ value: 'Waktu Pengukuran', position: 'insideBottom', offset: -28, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={tickInterval} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
          <YAxis domain={[yMin, yMax]} label={{ value: cfg.label, angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} width={55} />
          <Tooltip content={<CustomTooltip />} labelFormatter={(label) => { const found = chartData.find((d) => d.time === label); return found ? String(found.fullTime) : label }} />
          <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }} />
          {[1, 2, 3, 4, 5].map((room) => (
            <Line key={room} type="monotone" dataKey={`room${room}`} name={`Kamar ${room}`} stroke={ROOM_COLORS[room]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-right text-xs text-muted-foreground">{roomEntries.length} kamar - {chartData.length} titik waktu</p>
    </div>
  )
}

function RoomCard({ room }: { room: number }) {
  const { data, isLoading, isError, error } = useQuery<EnergyReading[]>({
    queryKey: ['room-latest', room],
    queryFn: async () => {
      const res = await apiClient.get<EnergyReading[]>('/api/readings', { params: { limit: 1, room } })
      return res.data
    },
    refetchInterval: 30_000,
  })

  const reading = data?.[0]
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const minutesAgo = reading ? Math.floor((Date.now() - new Date(reading.measuredAt).getTime()) / 60_000) : null
  const lastUpdateLabel = minutesAgo === null ? null
    : minutesAgo === 0 ? 'baru saja'
    : minutesAgo < 60 ? `${minutesAgo} menit lalu`
    : `${Math.floor(minutesAgo / 60)} jam lalu`

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Kamar {room}</CardTitle>
          {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {isError && <Badge variant="destructive" className="text-xs">Error</Badge>}
        </div>
        {reading && (
          <div className="space-y-0.5">
            <CardDescription className="text-xs">Pembacaan terakhir: <span className="font-medium text-foreground">{new Date(reading.measuredAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></CardDescription>
            {lastUpdateLabel && <CardDescription className="text-xs">Pembaruan: <span className="font-medium text-foreground">{lastUpdateLabel}</span></CardDescription>}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && !reading && <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}</div>}
        {isError && <div className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /><span>{(error as Error).message}</span></div>}
        {reading && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-yellow-500" /><span className="text-muted-foreground">Tegangan</span></div>
            <span className="font-medium">{fmt(reading.voltage, 1)} V</span>
            <div className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-blue-500" /><span className="text-muted-foreground">Arus</span></div>
            <span className="font-medium">{fmt(reading.current, 3)} A</span>
            <div className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-green-500" /><span className="text-muted-foreground">Daya</span></div>
            <span className="font-medium">{fmt(reading.power, 1)} W</span>
            <div className="flex items-center gap-1.5"><Battery className="h-3.5 w-3.5 text-purple-500" /><span className="text-muted-foreground">Delta Energi</span></div>
            <span className="font-medium">{fmt(reading.energyDelta, 6)} kWh</span>
            <div className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-orange-500" /><span className="text-muted-foreground">Frekuensi</span></div>
            <span className="font-medium">{fmt(reading.frequency, 1)} Hz</span>
            <div className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-red-500" /><span className="text-muted-foreground">Faktor Daya</span></div>
            <span className="font-medium">{fmt(reading.powerFactor, 2)}</span>
          </div>
        )}
        {!isLoading && !isError && !reading && <p className="text-sm text-gray-400">Belum ada data. Menunggu pembacaan sensor.</p>}
      </CardContent>
    </Card>
  )
}

function HistorySection() {
  const [selectedRoom, setSelectedRoom] = useState<number | 'all' | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery<EnergyReading[]>({
    queryKey: ['room-history', selectedRoom],
    queryFn: async () => {
      const res = await apiClient.get<EnergyReading[]>('/api/readings', {
        params: { room: selectedRoom, limit: 200 },
      })
      return res.data
    },
    enabled: selectedRoom !== null && selectedRoom !== 'all',
  })

  const allRoomsQueries = useQueries({
    queries: [1, 2, 3, 4, 5].map((room) => ({
      queryKey: ['room-history-all', room],
      queryFn: async () => {
        const res = await apiClient.get<EnergyReading[]>('/api/readings', { params: { room, limit: 200 } })
        return res.data
      },
      enabled: selectedRoom === 'all',
    })),
  })

  const allRoomsLoading = allRoomsQueries.some((q) => q.isLoading)
  const allRoomsData: Record<number, EnergyReading[]> = {}
  if (selectedRoom === 'all') {
    allRoomsQueries.forEach((q, i) => {
      if (q.data && q.data.length > 0) allRoomsData[i + 1] = q.data
    })
  }

  const rows = data ?? []
  const isCurrentlyLoading = selectedRoom === 'all' ? allRoomsLoading : isLoading

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold">Riwayat Konsumsi</h2>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Kamar</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((r) => (
              <Button key={r} size="sm" variant={selectedRoom === r ? 'default' : 'outline'} onClick={() => setSelectedRoom(r)}>{r}</Button>
            ))}
            <Button size="sm" variant={selectedRoom === 'all' ? 'default' : 'outline'} onClick={() => setSelectedRoom('all')}>Semua</Button>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => { if (selectedRoom === 'all') allRoomsQueries.forEach(q => q.refetch()); else refetch() }} disabled={selectedRoom === null || isCurrentlyLoading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isCurrentlyLoading ? 'animate-spin' : ''}`} />Segarkan
        </Button>
      </div>

      {selectedRoom === null && <p className="text-sm text-muted-foreground">Pilih kamar untuk melihat riwayat.</p>}
      {isError && selectedRoom !== 'all' && <div className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /><span>{(error as Error).message}</span></div>}
      {isCurrentlyLoading && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}</div>}

      {selectedRoom === 'all' && !allRoomsLoading && Object.keys(allRoomsData).length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Grafik Konsumsi Energi - Semua Kamar</CardTitle>
            <CardDescription className="text-xs">Perbandingan seluruh kamar. Klik nama kamar di legenda untuk sembunyikan atau tampilkan.</CardDescription>
          </CardHeader>
          <CardContent><AllRoomsChart allData={allRoomsData} /></CardContent>
        </Card>
      )}

      {selectedRoom === 'all' && !allRoomsLoading && Object.keys(allRoomsData).length === 0 && (
        <p className="text-sm text-muted-foreground">Data belum ditemukan.</p>
      )}

      {selectedRoom !== 'all' && !isLoading && rows.length > 0 && (
        <>
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Grafik Konsumsi Energi - Kamar {selectedRoom}</CardTitle>
              <CardDescription className="text-xs">Pilih metrik untuk melihat Daya, Tegangan, atau Arus.</CardDescription>
            </CardHeader>
            <CardContent><PowerChart data={rows} room={selectedRoom as number} /></CardContent>
          </Card>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Waktu', 'Tegangan (V)', 'Arus (A)', 'Daya (W)', 'Delta Energi (kWh)', 'Frekuensi (Hz)', 'Faktor Daya'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{new Date(row.measuredAt).toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2">{fmt(row.voltage)}</td>
                    <td className="px-3 py-2">{fmt(row.current)}</td>
                    <td className="px-3 py-2">{fmt(row.power)}</td>
                    <td className="px-3 py-2">{fmt(row.energyDelta, 6)}</td>
                    <td className="px-3 py-2">{fmt(row.frequency)}</td>
                    <td className="px-3 py-2">{fmt(row.powerFactor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Menampilkan {rows.length} data terbaru</p>
        </>
      )}

      {selectedRoom !== 'all' && !isLoading && selectedRoom !== null && rows.length === 0 && !isError && (
        <p className="text-sm text-muted-foreground">Data belum ditemukan untuk pilihan ini.</p>
      )}
    </section>
  )
}

export default function Dashboard() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">Dasbor Energi</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5].map((room) => (
          <RoomCard key={room} room={room} />
        ))}
      </div>
      <HistorySection />
    </div>
  )
}
