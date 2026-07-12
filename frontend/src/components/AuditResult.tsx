import { cn } from '@/lib/utils';

interface AuditResultProps {
  verified: boolean;
  batchId: string;
  onChainHash: string;
  computedHash: string;
  txHash?: string;
}

const ETHERSCAN_BASE = 'https://sepolia.etherscan.io/tx/';

function HashDisplay({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span
        className="truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700"
        title={hash}
      >
        {hash}
      </span>
    </div>
  );
}

export default function AuditResult({
  verified,
  batchId,
  onChainHash,
  computedHash,
  txHash,
}: AuditResultProps) {
  return (
    <div className="mt-6 space-y-4">
      <div
        className={cn(
          'rounded-lg border px-4 py-3 text-center text-lg font-semibold',
          verified
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        )}
      >
        {verified
          ? 'VALID - Data integritas terjaga'
          : 'TAMPERED - Hash tidak cocok'}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Detail Verifikasi
        </h3>

        <div className="space-y-3">
          <HashDisplay label="Batch ID" hash={batchId} />
          <HashDisplay label="Hash On-chain" hash={onChainHash} />
          <HashDisplay label="Hash Hitung Ulang (dari DB)" hash={computedHash} />
        </div>

        {txHash && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <a
              href={`${ETHERSCAN_BASE}${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              <span>Lihat transaksi di Etherscan</span>
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
