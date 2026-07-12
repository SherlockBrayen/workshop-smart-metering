import { useState, useEffect } from 'react'
import { useWallet } from './useWallet'
import { useContract } from './useContract'

interface UseAuthReturn {
  isAdmin: boolean
  isLoading: boolean
  adminAddress: string | null
  address: string | null
  connect: () => Promise<void>
  disconnect: () => void
  isConnecting: boolean
  error: string | null
}

export function useAuth(): UseAuthReturn {
  const { address, isConnecting, error, connect, disconnect } = useWallet()
  const { getAdmin } = useContract()

  const [adminAddress, setAdminAddress] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchAdmin = async () => {
      setIsLoading(true)
      try {
        const admin = await getAdmin()
        if (!cancelled) setAdminAddress(admin)
      } catch {
        if (!cancelled) setAdminAddress(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchAdmin()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAdmin =
    !!address && !!adminAddress && address.toLowerCase() === adminAddress.toLowerCase()

  return { isAdmin, isLoading: isLoading || isConnecting, adminAddress, address, connect, disconnect, isConnecting, error }
}

// Expose signer for consumers that need it
export { useWallet }
