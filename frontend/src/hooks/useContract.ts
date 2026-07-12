import { useCallback, useMemo } from 'react'
import { Contract, JsonRpcProvider, type Signer, BrowserProvider, type InterfaceAbi } from 'ethers'
import deployment from '@contracts/sepolia.json'

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || deployment.address
const RPC_URL = import.meta.env.VITE_RPC_URL as string
const REQUIRED_CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID ?? '11155111', 10)

// Use full ABI from deployment if available, fallback to minimal
const RAW_ABI = ((deployment.abi && deployment.abi.length > 0)
  ? deployment.abi
  : [
    'function getAdmin() external view returns (address)',
    'function getDeviceStatus(address device) external view returns (uint8)',
    'function getHash(bytes32 batchId) external view returns (bytes32)',
    'function approveDevice(address device) external',
    'function rejectDevice(address device) external',
    'event DeviceRegistered(address indexed device, uint256 timestamp)',
    'event DeviceApproved(address indexed device, uint256 timestamp)',
    'event DeviceRejected(address indexed device, uint256 timestamp)',
    'event HashRecorded(address indexed device, bytes32 batchId, bytes32 hash, uint256 hourWindowStart, uint256 timestamp)',
  ]) as InterfaceAbi

async function ensureCorrectNetwork(): Promise<void> {
  if (!window.ethereum) throw new Error('MetaMask belum terpasang')
  const provider = new BrowserProvider(window.ethereum)
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== REQUIRED_CHAIN_ID) {
    const chainIdHex = `0x${REQUIRED_CHAIN_ID.toString(16)}`
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
    } catch (switchError: unknown) {
      const err = switchError as { code?: number }
      if (err?.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainIdHex,
            chainName: 'Sepolia Testnet',
            nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        })
      } else {
        throw new Error('Pindahkan jaringan MetaMask ke Sepolia untuk melanjutkan.')
      }
    }
  }
}

export type DeviceStatus = 'pending' | 'approved' | 'rejected' | 'unregistered'

// Workshop contract: 0=UNREGISTERED, 1=PENDING, 2=APPROVED, 3=REJECTED
const STATUS_MAP: Record<number, DeviceStatus> = {
  0: 'unregistered',
  1: 'pending',
  2: 'approved',
  3: 'rejected',
}

export interface DeviceInfo {
  address: string
  status: DeviceStatus
  registeredAt: Date
}

interface UseContractReturn {
  readContract: Contract
  getWriteContract: (signer: Signer) => Contract
  getAdmin: () => Promise<string>
  getDeviceStatus: (deviceAddress: string) => Promise<DeviceStatus>
  getRegisteredDevices: () => Promise<DeviceInfo[]>
  approveDevice: (signer: Signer, deviceAddress: string) => Promise<string>
  rejectDevice: (signer: Signer, deviceAddress: string) => Promise<string>
  getHash: (batchId: string) => Promise<string>
}

export function useContract(): UseContractReturn {
  const readContract = useMemo(() => {
    const provider = new JsonRpcProvider(RPC_URL)
    return new Contract(CONTRACT_ADDRESS, RAW_ABI, provider)
  }, [])

  const getWriteContract = useCallback(
    (signer: Signer) => new Contract(CONTRACT_ADDRESS, RAW_ABI, signer),
    [],
  )

  const getAdmin = useCallback(async (): Promise<string> => {
    return readContract.getAdmin() as Promise<string>
  }, [readContract])

  const getDeviceStatus = useCallback(async (deviceAddress: string): Promise<DeviceStatus> => {
    const statusNum: number = await readContract.getDeviceStatus(deviceAddress)
    return STATUS_MAP[statusNum] ?? 'unregistered'
  }, [readContract])

  const getRegisteredDevices = useCallback(async (): Promise<DeviceInfo[]> => {
    // Query from deployBlock to avoid Infura 10k block range limit
    const DEPLOY_BLOCK = deployment.deployBlock ?? parseInt(import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK ?? '0', 10)
    const filter = readContract.filters.DeviceRegistered()
    const events = await readContract.queryFilter(filter, DEPLOY_BLOCK, 'latest')

    // Deduplicate by address (keep last registration event)
    const seen = new Map<string, { registeredAt: Date }>()
    for (const ev of events) {
      if (!('args' in ev)) continue
      const deviceAddr: string = ev.args[0] as string
      const timestamp: bigint = ev.args[1] as bigint
      seen.set(deviceAddr.toLowerCase(), {
        registeredAt: new Date(Number(timestamp) * 1000),
      })
    }

    // Fetch current status for each device
    const entries = Array.from(seen.entries())
    const results = await Promise.all(
      entries.map(async ([addr, meta]) => {
        const statusNum: number = await readContract.getDeviceStatus(addr)
        const status: DeviceStatus = STATUS_MAP[statusNum] ?? 'unregistered'
        return { address: addr, status, registeredAt: meta.registeredAt } satisfies DeviceInfo
      }),
    )

    const ORDER: Record<DeviceStatus, number> = { pending: 0, approved: 1, rejected: 2, unregistered: 3 }
    return results.sort(
      (a, b) => ORDER[a.status] - ORDER[b.status] || b.registeredAt.getTime() - a.registeredAt.getTime(),
    )
  }, [readContract])

  const approveDevice = useCallback(async (signer: Signer, deviceAddress: string): Promise<string> => {
    await ensureCorrectNetwork()
    const contract = new Contract(CONTRACT_ADDRESS, RAW_ABI, signer)
    const tx = await contract.approveDevice(deviceAddress)
    const receipt = await tx.wait()
    return receipt.hash as string
  }, [])

  const rejectDevice = useCallback(async (signer: Signer, deviceAddress: string): Promise<string> => {
    await ensureCorrectNetwork()
    const contract = new Contract(CONTRACT_ADDRESS, RAW_ABI, signer)
    const tx = await contract.rejectDevice(deviceAddress)
    const receipt = await tx.wait()
    return receipt.hash as string
  }, [])

  const getHash = useCallback(async (batchId: string): Promise<string> => {
    return readContract.getHash(batchId) as Promise<string>
  }, [readContract])

  return { readContract, getWriteContract, getAdmin, getDeviceStatus, getRegisteredDevices, approveDevice, rejectDevice, getHash }
}
