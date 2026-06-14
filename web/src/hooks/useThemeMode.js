import { useEffect } from 'react';

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function useThemeMode() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => applyTheme(media.matches ? 'dark' : 'light');

    syncTheme();
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, []);
}
