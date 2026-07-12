import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

export default function Login() {
  const navigate = useNavigate()
  const { address, isAdmin, isLoading, isConnecting, error, connect, disconnect } = useAuth()

  useEffect(() => {
    if (address && isAdmin && !isLoading) {
      navigate('/dashboard', { replace: true })
    }
  }, [address, isAdmin, isLoading, navigate])

  const isMetaMaskInstalled = typeof window !== 'undefined' && !!window.ethereum

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Workshop Smart Metering</CardTitle>
          <CardDescription>Hubungkan wallet admin untuk membuka dasbor</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isMetaMaskInstalled && (
            <p className="text-sm text-red-600">
              MetaMask belum terpasang.{' '}
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="underline">
                Pasang MetaMask
              </a>
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!address && (
            <Button onClick={connect} disabled={isConnecting || !isMetaMaskInstalled} className="w-full">
              {isConnecting ? 'Menghubungkan...' : 'Hubungkan MetaMask'}
            </Button>
          )}

          {address && isLoading && (
            <div className="space-y-2 text-center">
              <p className="text-sm text-gray-500">Memeriksa akses admin...</p>
              <p className="break-all text-xs text-gray-400">{address}</p>
            </div>
          )}

          {address && !isLoading && !isAdmin && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-red-600">Wallet ini bukan wallet admin.</p>
              <p className="break-all text-xs text-gray-500">{address}</p>
              <Button variant="outline" onClick={disconnect} className="w-full">Putuskan Koneksi</Button>
            </div>
          )}

          <p className="text-center text-xs text-gray-400">
            Pastikan MetaMask terhubung ke jaringan Sepolia Testnet.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
