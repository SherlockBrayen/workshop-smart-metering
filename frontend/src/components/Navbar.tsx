import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function Navbar() {
  const { disconnect } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    disconnect();
    navigate('/', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-700 text-white'
        : 'text-blue-100 hover:bg-blue-600 hover:text-white'
    }`;

  return (
    <nav className="bg-blue-800 shadow-md">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between">
          <span className="text-sm font-bold text-white">Workshop Smart Metering</span>

          <div className="flex items-center gap-1">
            <NavLink to="/dashboard" className={linkClass}>Dasbor</NavLink>
            <NavLink to="/devices" className={linkClass}>Gateway</NavLink>
            <NavLink to="/audit" className={linkClass}>Audit</NavLink>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-md px-3 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-700 hover:text-white"
          >
            Keluar
          </button>
        </div>
      </div>
    </nav>
  );
}
