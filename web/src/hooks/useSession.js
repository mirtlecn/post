import { useCallback, useEffect, useState } from 'react';
import { TOKEN_KEY } from '../config.js';
import { apiRequest } from '../lib/api.js';

export function useSession() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [booting, setBooting] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setPassword('');
    setError('');
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return void setBooting(false);
    apiRequest(saved).then(() => setToken(saved)).catch(logout).finally(() => setBooting(false));
  }, [logout]);

  const login = useCallback(async (event) => {
    event.preventDefault();
    const nextToken = password.trim();
    if (!nextToken) return;
    setIsBusy(true);
    setError('');
    try {
      await apiRequest(nextToken);
      localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      setPassword('');
    } catch {
      setError('Wrong key');
    } finally {
      setIsBusy(false);
    }
  }, [password]);

  return { booting, error, isBusy, login, logout, password, setPassword, token };
}
