import { useEffect, useState } from 'react'

/** Fetch JSON; keeps the previous payload while a new one loads so the UI never flashes empty. */
export function useApi(path) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!path) return
    const ac = new AbortController()
    fetch(path, { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(setData)
      .catch(() => {})
    return () => ac.abort()
  }, [path])
  return data
}

export const STATUS = {
  Serviceable: 'var(--good)',
  Watch: 'var(--warn)',
  'Maintenance scheduled': 'var(--accent)',
  'Awaiting spare': 'var(--serious)',
  'In maintenance': 'var(--idle)',
  AOG: 'var(--crit)',
}
export const HEALTH = {
  healthy: 'var(--good)', watch: 'var(--warn)', critical: 'var(--crit)', maintenance: 'var(--idle)', failed: 'var(--crit)',
}
export const POLICY_LABEL = { predictive: 'AeroTwin predictive', time_based: 'Fixed interval', corrective: 'Repair on failure' }
export const POLICY_COLOR = { predictive: 'var(--s1)', time_based: 'var(--s2)', corrective: 'var(--s3)' }
export const POLICY_ORDER = ['predictive', 'time_based', 'corrective']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDate(day, withYear = false) {
  const d = new Date(Date.UTC(2026, 0, 1 + day))
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ' ' + d.getUTCFullYear() : ''}`
}
export const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
export const movingAvg = (a, w) => a.map((_, i) => mean(a.slice(Math.max(0, i - w + 1), i + 1)))
export const compact = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
