import { useState, useEffect, useCallback } from 'react'
import { BrowserProvider, type Signer } from 'ethers'

const SESSION_KEY = 'wallet_connected'

interface WalletState {
  address: string | null
  signer: Signer | null
  isConnecting: boolean
  error: string | null
}

interface UseWalletReturn extends WalletState {
  connect: () => Promise<void>
  disconnect: () => void
}

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    address: null,
    signer: null,
    isConnecting: false,
    error: null,
  })

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
  }, [])

  const disconnect = useCallback(() => {
    clearSession()
    setState({ address: null, signer: null, isConnecting: false, error: null })

    if (window.ethereum) {
      window.ethereum
        .request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
        .catch(() => undefined)
    }
  }, [clearSession])

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState((s) => ({ ...s, error: 'MetaMask belum terpasang' }))
      return
    }

    setState((s) => ({ ...s, isConnecting: true, error: null }))

    try {
      const provider = new BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()

      sessionStorage.setItem(SESSION_KEY, '1')
      setState({ address, signer, isConnecting: false, error: null })
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>
      const code =
        (errObj?.code as number) ??
        ((errObj?.info as Record<string, unknown>)?.error as Record<string, unknown>)?.code

      const isRejected =
        code === 4001 ||
        errObj?.code === 'ACTION_REJECTED' ||
        String(errObj?.message ?? '').toLowerCase().includes('user rejected') ||
        String(errObj?.message ?? '').toLowerCase().includes('user denied')

      const message =
        isRejected
          ? 'Koneksi wallet dibatalkan.'
          : code === -32002
            ? 'Popup MetaMask masih terbuka. Cek ekstensi browser.'
            : err instanceof Error
              ? err.message
              : 'Gagal menghubungkan wallet'

      setState({ address: null, signer: null, isConnecting: false, error: message })
    }
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) return

    const restore = async () => {
      if (!window.ethereum) return

      try {
        const provider = new BrowserProvider(window.ethereum)
        const accounts: string[] = await provider.send('eth_accounts', [])
        if (accounts.length === 0) {
          clearSession()
          return
        }

        const signer = await provider.getSigner()
        const address = await signer.getAddress()
        setState({ address, signer, isConnecting: false, error: null })
      } catch {
        clearSession()
      }
    }

    restore()
  }, [clearSession])

  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0])
        ? args[0].filter((account): account is string => typeof account === 'string')
        : []

      if (accounts.length === 0) disconnect()
      else connect()
    }

    const handleChainChanged = () => window.location.reload()

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum?.removeListener('chainChanged', handleChainChanged)
    }
  }, [connect, disconnect])

  return { ...state, connect, disconnect }
}
