import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, title: '', desc: '', onOk: null, loading: false });

  const confirm = useCallback((title, desc, onOk) => {
    setState({ open: true, title, desc, onOk, loading: false });
  }, []);

  async function handleOk() {
    if (!state.onOk) return;
    setState(s => ({ ...s, loading: true }));
    try {
      await state.onOk();
      setState(s => ({ ...s, open: false, loading: false }));
    } catch (e) {
      setState(s => ({ ...s, loading: false }));
      // Error should be handled by the caller's toast, keep dialog open
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !state.loading) setState(s => ({ ...s, open: false })); }}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="confirm-body">
              <div className="icon">⚠️</div>
              <div className="modal-title">{state.title}</div>
              <p>{state.desc}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" disabled={state.loading} onClick={() => setState(s => ({ ...s, open: false }))}>取消</button>
              <button className="btn btn-danger" disabled={state.loading} onClick={handleOk}>{state.loading ? '處理中...' : '確定'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}