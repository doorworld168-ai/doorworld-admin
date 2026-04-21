import { useAuth } from '../../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { section: '總覽' },
  { path: '/', label: '儀表板', icon: 'dashboard' },
  { path: '/bossview', label: '老闆視角', icon: 'monitoring', adminOnly: true },
  { divider: true },
  { section: '客戶開發' },
  { path: '/members', label: '會員管理', icon: 'group', perm: 'members' },
  { divider: true },
  { section: '前置作業' },
  { path: '/quotes', label: '估價單', icon: 'receipt_long' },
  { path: '/measurement', label: '丈量安排', icon: 'straighten' },
  { path: '/measurement/tasks', label: '師傅待丈量', icon: 'engineering' },
  { path: '/drafting', label: '製圖進度', icon: 'draw' },
  { path: '/formalquote', label: '報價單', icon: 'request_quote' },
  { divider: true },
  { section: '案件進行' },
  { path: '/cases', label: '案件總覽', icon: 'assignment', perm: 'cases' },
  { path: '/ordering', label: '下單追蹤', icon: 'timeline' },
  { path: '/salesorder', label: '業務下單', icon: 'send' },
  { path: '/internalorder', label: '內勤下單', icon: 'inventory' },
  { path: '/chinafactory', label: '大陸工廠', icon: 'factory' },
  { path: '/twfactory', label: '台灣工廠', icon: 'precision_manufacturing' },
  { path: '/installation', label: '安裝排程', icon: 'construction' },
  { divider: true },
  { section: '財務' },
  { path: '/payment', label: '收款追蹤', icon: 'account_balance' },
  { path: '/finance', label: '財務管理', icon: 'payments', perm: 'finance' },
  { divider: true },
  { section: '設定' },
  { path: '/products', label: '產品管理', icon: 'door_front', perm: 'products' },
  { path: '/service', label: '施工費用', icon: 'build', perm: 'service' },
  { path: '/accessories', label: '五金配件', icon: 'hardware' },
  { path: '/colors', label: '色卡管理', icon: 'palette' },
  { path: '/staff', label: '員工帳號', icon: 'shield_person', adminOnly: true },
  { path: '/aiprompt', label: 'AI 提示詞', icon: 'psychology' },
];

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const { user, logout, hasPerm } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  function handleNav(path) {
    navigate(path);
    onClose();
  }

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'active' : ''}`} onClick={onClose} />
      <div className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`} id="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">
            <img src={import.meta.env.BASE_URL + 'logo.png'} alt="門的世界" />
          </div>
          {!collapsed && <div className="sidebar-brand-sub">Admin Console</div>}
        </div>

        {/* Nav */}
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item, i) => {
            if (item.divider) return collapsed ? null : <div key={i} className="sidebar-section-divider" />;
            if (item.section) return collapsed ? null : <div key={i} className="sidebar-section">{item.section}</div>;
            if (item.adminOnly && !user?.isAdmin) return null;
            if (item.perm && !hasPerm(item.perm, 'view')) return null;
            const active = location.pathname === item.path;
            return (
              <div key={item.path}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => handleNav(item.path)}
                title={collapsed ? item.label : undefined}>
                <span className="material-symbols-outlined">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-collapse-btn hide-mobile" onClick={onToggleCollapse} title={collapsed ? '展開側邊欄' : '收合側邊欄'}>
            <span className="material-symbols-outlined" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .3s ease' }}>chevron_left</span>
          </div>
          {!collapsed && (
            <>
              <div className="sidebar-avatar">
                <span className="material-symbols-outlined">manage_accounts</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sidebar-user-name">{user?.display_name || '管理員'}</div>
                <div className="sidebar-user-role">{user?.isAdmin ? 'Administrator' : 'Staff'}</div>
              </div>
            </>
          )}
          <div className="sidebar-logout" onClick={logout} title="登出">
            <span className="material-symbols-outlined">logout</span>
          </div>
        </div>
      </div>
    </>
  );
}
