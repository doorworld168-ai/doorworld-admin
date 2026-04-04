import { useLocation, useNavigate } from 'react-router-dom';

const MOBILE_ITEMS = [
  { path: '/', label: '總覽', icon: 'dashboard' },
  { path: '/cases', label: '案件', icon: 'assignment' },
  { path: '/internalorder', label: '下單', icon: 'inventory' },
  { path: '/finance', label: '財務', icon: 'payments' },
  { label: '更多', icon: 'menu', action: 'menu' },
];

export default function MobileNav({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="mobile-nav">
      {MOBILE_ITEMS.map(item => {
        if (item.action === 'menu') {
          return (
            <div key="menu" className="mobile-nav-item" onClick={onMenuClick}>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          );
        }
        const active = location.pathname === item.path;
        return (
          <div key={item.path}
            className={`mobile-nav-item ${active ? 'active' : ''}`}
            onClick={() => navigate(item.path)}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
