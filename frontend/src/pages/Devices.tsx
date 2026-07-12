import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useContract, type DeviceInfo, type DeviceStatus } from '@/hooks/useContract'
import { useAuth, useWallet } from '@/hooks/useAuth'

const ETHERSCAN_BASE = 'https://sepolia.etherscan.io'

function StatusBadge({ status }: { status: DeviceStatus }) {
  switch (status) {
    case 'approved':
      return <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3" />Disetujui</Badge>
    case 'rejected':
      return <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3" />Ditolak</Badge>
    case 'pending':
      return <Badge className="gap-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3" />Menunggu</Badge>
    default:
      return <Badge variant="outline">Tidak dikenal</Badge>
  }
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

interface DeviceRowProps {
  device: DeviceInfo
  isAdmin: boolean
  onAction: (address: string, action: 'approve' | 'reject') => void
  pendingAction: string | null
  confirmation: { address: string; txHash: string } | null
}

function DeviceRow({ device, isAdmin, onAction, pendingAction, confirmation }: DeviceRowProps) {
  const isBusy = pendingAction === device.address
  const isConfirmed = confirmation?.address === device.address

  return (
    <tr className="border-b transition-colors last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-foreground" title={device.address}>
            {truncateAddress(device.address)}
          </span>
          <a href={`${ETHERSCAN_BASE}/address/${device.address}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
        {device.registeredAt.toLocaleString('id-ID')}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={device.status} />
      </td>
      <td className="px-4 py-3">
        {isConfirmed ? (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle className="h-3.5 w-3.5" />Terkonfirmasi
          </span>
        ) : isAdmin && device.status === 'pending' ? (
          <div className="flex gap-2">
            <Button size="sm" variant="default" disabled={isBusy} onClick={() => onAction(device.address, 'approve')} className="h-7 px-2 text-xs">
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Setujui'}
            </Button>
            <Button size="sm" variant="destructive" disabled={isBusy} onClick={() => onAction(device.address, 'reject')} className="h-7 px-2 text-xs">
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Tolak'}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  )
}

export default function Devices() {
  const queryClient = useQueryClient()
  const { getRegisteredDevices, approveDevice, rejectDevice } = useContract()
  const { isAdmin } = useAuth()
  const { signer } = useWallet()

  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ address: string; txHash: string } | null>(null)

  const { data: devices, isLoading, isError, error, refetch, isFetching } = useQuery<DeviceInfo[]>({
    queryKey: ['registered-devices'],
    queryFn: () => getRegisteredDevices(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const handleAction = async (address: string, action: 'approve' | 'reject') => {
    if (!signer) {
      setActionError('Wallet belum terhubung.')
      return
    }

    setPendingAction(address)
    setActionError(null)
    setConfirmation(null)

    try {
      const txHash = action === 'approve'
        ? await approveDevice(signer, address)
        : await rejectDevice(signer, address)
      setConfirmation({ address, txHash })
      await queryClient.invalidateQueries({ queryKey: ['registered-devices'] })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaksi gagal'
      setActionError(msg.toLowerCase().includes('user rejected') ? 'Transaksi dibatalkan oleh pengguna.' : msg)
    } finally {
      setPendingAction(null)
    }
  }

  const pendingCount = devices?.filter((d) => d.status === 'pending').length ?? 0

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Gateway</h1>
          {pendingCount > 0 && (
            <p className="mt-1 text-sm text-yellow-700">
              {pendingCount} gateway menunggu persetujuan
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Segarkan
        </Button>
      </div>

      {actionError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{actionError}</span>
        </div>
      )}

      {confirmation && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Transaksi terkonfirmasi. Tx: <span className="font-mono text-xs">{truncateAddress(confirmation.txHash)}</span>{' '}
            <a href={`${ETHERSCAN_BASE}/tx/${confirmation.txHash}`} target="_blank" rel="noopener noreferrer" className="underline">Lihat di Etherscan</a>
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Gateway Terdaftar</CardTitle>
          <CardDescription>Gateway yang sudah memanggil <span className="font-mono text-xs">registerDevice()</span> pada kontrak.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-6">{[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}</div>
          )}
          {isError && (
            <div className="flex items-center gap-2 p-6 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /><span>{(error as Error).message}</span>
            </div>
          )}
          {!isLoading && !isError && (!devices || devices.length === 0) && (
            <p className="p-6 text-sm text-muted-foreground">Belum ada gateway terdaftar. Jalankan Edge Simulator untuk register.</p>
          )}
          {!isLoading && devices && devices.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    {['Alamat', 'Waktu Register', 'Status', 'Aksi'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <DeviceRow key={device.address} device={device} isAdmin={isAdmin} onAction={handleAction} pendingAction={pendingAction} confirmation={confirmation} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!isAdmin && devices && devices.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Hubungkan wallet admin untuk menyetujui atau menolak gateway.</p>
      )}
    </div>
  )
}
