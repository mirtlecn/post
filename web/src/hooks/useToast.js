import { useCallback, useEffect, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((kind, message) => {
    setToast({ kind, message });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return { showToast, toast, clearToast };
}
