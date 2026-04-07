import { Component } from 'react';

// Detect chunk load failures caused by stale cached HTML after deploy
function isChunkLoadError(error) {
  if (!error) return false;
  const msg = error.message || '';
  return msg.includes('Failed to fetch dynamically imported module') ||
         msg.includes('Loading chunk') ||
         msg.includes('Loading CSS chunk') ||
         msg.includes('error loading dynamically imported module');
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    // Auto-reload on chunk load failure (stale cache after deploy)
    if (isChunkLoadError(error)) {
      const reloadKey = 'dw_chunk_reload_at';
      const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
      // Avoid infinite reload loop: only reload once per 10 seconds
      if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div style={{
          padding: 40, textAlign: 'center', color: '#e5e2e1',
          background: '#0e0e0e', minHeight: '100vh', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16
        }}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>⚠</div>
          <h2 style={{ fontFamily: 'Lexend, sans-serif', fontSize: 20, fontWeight: 700 }}>
            {chunkError ? '系統已更新' : '頁面發生錯誤'}
          </h2>
          <p style={{ color: '#99907b', fontSize: 14, maxWidth: 400 }}>
            {chunkError ? '正在重新載入最新版本...' : (this.state.error?.message || '未知錯誤')}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => window.location.reload()} style={{
              padding: '10px 20px', background: '#c9a227', color: '#3d2e00', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif'
            }}>{chunkError ? '重新整理' : '重試此頁面'}</button>
            {!chunkError && <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = import.meta.env.BASE_URL; }} style={{
              padding: '10px 20px', background: 'transparent', color: '#99907b', border: '1px solid rgba(77,70,53,0.3)',
              borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif'
            }}>回到首頁</button>}
          </div>
          {!chunkError && import.meta.env.DEV && (
            <details style={{ marginTop: 20, color: '#99907b', fontSize: 11, maxWidth: 500 }}>
              <summary style={{ cursor: 'pointer' }}>技術細節</summary>
              <pre style={{ textAlign: 'left', background: '#1c1b1b', padding: 12, borderRadius: 8, marginTop: 8, overflow: 'auto', maxHeight: 200, fontSize: 10 }}>
                {this.state.error?.stack || 'No stack trace'}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
