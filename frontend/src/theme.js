import { useEffect, useState } from 'react'

const KEY = 'aerotwin-theme'
export function initialTheme() {
  try { const t = localStorage.getItem(KEY); if (t === 'dark' || t === 'light') return t } catch { /* private mode */ }
  return 'light' // light by default, dark is opt-in
}
export function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
}
export function useTheme() {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => { applyTheme(theme) }, [theme])
  // apply synchronously so the 3D scene reads the new CSS colours in the same render
  return [theme, () => { const n = theme === 'light' ? 'dark' : 'light'; applyTheme(n); setTheme(n) }]
}
