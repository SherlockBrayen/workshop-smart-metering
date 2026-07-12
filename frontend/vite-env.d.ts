/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_RPC_URL: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_CONTRACT_ADDRESS?: string
  readonly VITE_CONTRACT_DEPLOY_BLOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// MetaMask ethereum provider
interface Window {
  ethereum: import('ethers').Eip1193Provider & {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    on(event: string, handler: (...args: unknown[]) => void): void
    removeListener(event: string, handler: (...args: unknown[]) => void): void
  }
}

// Contract deployment JSON module declaration
declare module '@contracts/sepolia.json' {
  const deployment: {
    address: string
    abi: unknown[]
    network: string
    deployedAt: string
    deployer: string
    deployBlock?: number
  }
  export default deployment
}
