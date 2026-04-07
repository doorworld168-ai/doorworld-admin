import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// JWT login via n8n proxy — no passwords in frontend
async function apiLogin(username, password) {
  const res = await fetch(`${import.meta.env.VITE_N8N_BASE_URL}/webhook/admin-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: import.meta.env.VITE_PROXY_TOKEN, action: 'login', username, password })
  });
  if (!res.ok) throw new Error('伺服器錯誤');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '帳號或密碼錯誤');
  return data; // { success, token, user }
}

// Decode JWT payload (no verification — server already signed it)
function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from stored JWT
    const token = sessionStorage.getItem('dw_token');
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload && payload.exp > Date.now() / 1000) {
        setUser({
          id: payload.sub,
          display_name: payload.displayName,
          username: payload.username,
          isAdmin: payload.isAdmin,
          permissions: payload.permissions || {}
        });
      } else {
        // Token expired
        sessionStorage.removeItem('dw_token');
        sessionStorage.removeItem('dw_auth');
      }
    }
    setLoading(false);
  }, []);

  async function login(username, password) {
    const data = await apiLogin(username, password);
    // Store JWT token
    sessionStorage.setItem('dw_token', data.token);
    const userData = {
      id: data.user.id,
      display_name: data.user.display_name,
      username: data.user.username,
      isAdmin: data.user.isAdmin,
      permissions: data.user.permissions || {}
    };
    setUser(userData);
    sessionStorage.setItem('dw_auth', JSON.stringify(userData));
    return userData;
  }

  function logout() {
    setUser(null);
    sessionStorage.removeItem('dw_auth');
    sessionStorage.removeItem('dw_token');
  }

  function hasPerm(module, action) {
    if (!user) return false;
    if (user.isAdmin) return true;
    return user.permissions?.[module]?.[action] || false;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPerm }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
