import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('mentor_ai_theme') as Theme) || 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('mentor_ai_theme', theme); } catch (e) {}
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => (t === 'light' ? 'dark' : 'light')), []);

  return { theme, toggleTheme };
}
