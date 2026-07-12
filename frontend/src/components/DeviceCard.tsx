import { cn, formatDate } from '@/lib/utils';

export interface DeviceCardProps {
  deviceId: number;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNREGISTERED';
  latestReading?: { power: number; energyDelta: number; measuredAt: string };
}

const statusConfig: Record<DeviceCardProps['status'], { label: string; className: string }> = {
  APPROVED: { label: 'Disetujui', className: 'bg-green-100 text-green-800' },
  PENDING: { label: 'Menunggu', className: 'bg-yellow-100 text-yellow-800' },
  REJECTED: { label: 'Ditolak', className: 'bg-red-100 text-red-800' },
  UNREGISTERED: { label: 'Belum terdaftar', className: 'bg-gray-100 text-gray-800' },
};

export default function DeviceCard({ name, status, latestReading }: DeviceCardProps) {
  const badge = statusConfig[status];

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </div>

      {latestReading ? (
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Daya</span>
            <span className="font-medium text-gray-900">
              {latestReading.power.toFixed(2)} W
            </span>
          </div>
          <div className="flex justify-between">
            <span>Delta Energi</span>
            <span className="font-medium text-gray-900">
              {latestReading.energyDelta.toFixed(6)} kWh
            </span>
          </div>
          <div className="mt-2 border-t pt-2 text-xs text-gray-500">
            {formatDate(latestReading.measuredAt)}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Belum ada data</p>
      )}
    </div>
  );
}
