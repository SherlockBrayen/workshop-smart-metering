import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, MonitorSmartphone, ShieldCheck, LogOut, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useContract } from '@/hooks/useContract'
import { useQuery } from '@tanstack/react-query'

export default function Layout() {
  const { address, isAdmin, disconnect } = useAuth()
  const { getRegisteredDevices } = useContract()
  const navigate = useNavigate()

  const { data: devices } = useQuery({
    queryKey: ['registered-devices'],
    queryFn: () => getRegisteredDevices(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const pendingCount = devices?.filter((d) => d.status === 'pending').length ?? 0

  const handleDisconnect = () => {
    disconnect()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="h-5 w-5 text-primary" />
            <span>Workshop Smart Metering</span>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <LayoutDashboard className="h-4 w-4" />Dasbor
            </NavLink>

            <NavLink
              to="/devices"
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <MonitorSmartphone className="h-4 w-4" />Gateway
              {pendingCount > 0 && (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>

            <NavLink
              to="/audit"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <ShieldCheck className="h-4 w-4" />Audit
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            {address && (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Admin</span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleDisconnect} className="gap-1.5">
              <LogOut className="h-4 w-4" />Keluar
            </Button>
          </div>
        </div>
      </header>

      <main><Outlet /></main>
    </div>
  )
}
