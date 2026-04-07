import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/UI/Toast';
import { ConfirmProvider } from './components/UI/Confirm';
import ErrorBoundary from './components/UI/ErrorBoundary';
import Sidebar from './components/Layout/Sidebar';
import Topbar from './components/Layout/Topbar';
import MobileNav from './components/Layout/MobileNav';
import Login from './pages/Login';
import './styles/globals.css';

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const BossView = lazy(() => import('./pages/BossView'));
const Members = lazy(() => import('./pages/Members'));
const Products = lazy(() => import('./pages/Products'));
const Service = lazy(() => import('./pages/Service'));
const Quotes = lazy(() => import('./pages/Quotes'));
const NewQuote = lazy(() => import('./pages/NewQuote'));
const Measurement = lazy(() => import('./pages/Measurement'));
const Drafting = lazy(() => import('./pages/Drafting'));
const FormalQuote = lazy(() => import('./pages/FormalQuote'));
const NewFormalQuote = lazy(() => import('./pages/NewFormalQuote'));
const Cases = lazy(() => import('./pages/Cases'));
const Ordering = lazy(() => import('./pages/Ordering'));
const SalesOrder = lazy(() => import('./pages/SalesOrder'));
const InternalOrder = lazy(() => import('./pages/InternalOrder'));
const ChinaFactory = lazy(() => import('./pages/ChinaFactory'));
const TwFactory = lazy(() => import('./pages/TwFactory'));
const Installation = lazy(() => import('./pages/Installation'));
const PaymentTracking = lazy(() => import('./pages/PaymentTracking'));
const Finance = lazy(() => import('./pages/Finance'));
const Accessories = lazy(() => import('./pages/Accessories'));
const Staff = lazy(() => import('./pages/Staff'));
const AIPrompt = lazy(() => import('./pages/AIPrompt'));

const TITLES = {
  '/': '儀表板', '/bossview': '老闆視角', '/members': '會員管理',
  '/products': '產品管理', '/service': '施工費用', '/quotes': '估價單',
  '/quotes/new': '新增估價單', '/measurement': '丈量安排', '/drafting': '製圖進度',
  '/formalquote': '報價單總表', '/formalquote/new': '新增報價單', '/cases': '案件總覽',
  '/ordering': '下單追蹤', '/salesorder': '業務下單', '/internalorder': '內勤下單',
  '/chinafactory': '大陸工廠', '/twfactory': '台灣工廠', '/installation': '安裝排程',
  '/payment': '收款追蹤', '/finance': '財務管理', '/accessories': '五金配件', '/staff': '員工帳號',
  '/aiprompt': 'AI 提示詞管理',
};

function PageLoader() {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="loading"><div className="spinner" /><br />載入頁面...</div></div>;
}

function NotFound() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 64, opacity: 0.2, marginBottom: 16 }}>404</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>找不到頁面</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>你要找的頁面不存在或已被移除。</p>
      <a href={import.meta.env.BASE_URL} style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', background: 'var(--gold)', color: '#3d2e00', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>回到儀表板</a>
    </div>
  );
}

// Route guard: check permission before rendering
function Guard({ perm, adminOnly, children }) {
  const { user, hasPerm } = useAuth();
  if (adminOnly && !user?.isAdmin) return <NotFound />;
  if (perm && !hasPerm(perm, 'view')) return <NotFound />;
  return children;
}

function AppContent() {
  const location = useLocation();
  const title = TITLES[location.pathname] || 'Admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div id="app" style={{ display: 'block' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="layout">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <div className="main">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/bossview" element={<Guard adminOnly><BossView /></Guard>} />
                <Route path="/members" element={<Guard perm="members"><Members /></Guard>} />
                <Route path="/products" element={<Guard perm="products"><Products /></Guard>} />
                <Route path="/service" element={<Guard perm="service"><Service /></Guard>} />
                <Route path="/quotes" element={<Quotes />} />
                <Route path="/quotes/new" element={<NewQuote />} />
                <Route path="/measurement" element={<Measurement />} />
                <Route path="/drafting" element={<Drafting />} />
                <Route path="/formalquote" element={<FormalQuote />} />
                <Route path="/formalquote/new" element={<NewFormalQuote />} />
                <Route path="/cases" element={<Guard perm="cases"><Cases /></Guard>} />
                <Route path="/ordering" element={<Ordering />} />
                <Route path="/salesorder" element={<SalesOrder />} />
                <Route path="/internalorder" element={<InternalOrder />} />
                <Route path="/chinafactory" element={<ChinaFactory />} />
                <Route path="/twfactory" element={<TwFactory />} />
                <Route path="/installation" element={<Installation />} />
                <Route path="/payment" element={<PaymentTracking />} />
                <Route path="/finance" element={<Guard perm="finance"><Finance /></Guard>} />
                <Route path="/accessories" element={<Accessories />} />
                <Route path="/staff" element={<Guard adminOnly><Staff /></Guard>} />
                <Route path="/aiprompt" element={<AIPrompt />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      <MobileNav onMenuClick={() => setSidebarOpen(true)} />
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading"><div className="spinner" /><br />載入中...</div></div>;
  if (!user) return <Login />;
  return <AppContent />;
}

const VALID_ROUTES = Object.keys(TITLES);
const spaRedirect = sessionStorage.getItem('spa_redirect');
if (spaRedirect) {
  sessionStorage.removeItem('spa_redirect');
  if (VALID_ROUTES.some(r => spaRedirect === r || spaRedirect.startsWith(r + '/'))) {
    window.history.replaceState(null, '', import.meta.env.BASE_URL.slice(0, -1) + spaRedirect);
  }
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
