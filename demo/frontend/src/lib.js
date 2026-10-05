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

// ---- vocabulary: plain but technical -------------------------------------------------------------------------------
export const STATUS = {
  Serviceable: { color: 'var(--good)', label: 'Ready' },
  Watch: { color: 'var(--warn)', label: 'Watch' },
  'Maintenance scheduled': { color: 'var(--accent)', label: 'Swap booked' },
  'Awaiting spare': { color: 'var(--serious)', label: 'Waiting for spare' },
  'In maintenance': { color: 'var(--idle)', label: 'In workshop' },
  AOG: { color: 'var(--crit)', label: 'Grounded' },
}
export const HEALTH_COLOR = { healthy: 'var(--good)', watch: 'var(--warn)', critical: 'var(--crit)', maintenance: 'var(--idle)', failed: 'var(--crit)' }
export const TONE = { good: 'var(--good)', warn: 'var(--warn)', crit: 'var(--crit)', idle: 'var(--idle)' }
export const ORDER = ['AOG', 'Awaiting spare', 'Watch', 'Maintenance scheduled', 'In maintenance', 'Serviceable']

export const POLICIES = [
  { key: 'corrective', label: 'Run to failure', color: 'var(--s3)', blurb: 'Engines run until they fail, then get repaired.' },
  { key: 'time_based', label: 'Fixed interval', color: 'var(--s2)', blurb: 'Engines are swapped after a set number of flights.' },
  { key: 'predictive', label: 'AeroTwin', color: 'var(--s1)', blurb: 'Each engine is swapped just before it is predicted to fail.' },
]
export const POLICY = Object.fromEntries(POLICIES.map((p) => [p.key, p]))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDate(day, withYear = false) {
  const d = new Date(Date.UTC(2026, 0, 1 + day))
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ' ' + d.getUTCFullYear() : ''}`
}
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
export const movingAvg = (a, w) => a.map((_, i) => mean(a.slice(Math.max(0, i - w + 1), i + 1)))

const SIGNALS = {
  T24: 'Intake air temperature', T30: 'Compressor temperature', T50: 'Turbine temperature', P30: 'Compressor pressure',
  Nf: 'Fan speed', Nc: 'Core speed', Ps30: 'Pressure at compressor exit', phi: 'Fuel flow', NRf: 'Fan speed (corrected)',
  NRc: 'Core speed (corrected)', BPR: 'Air bypass ratio', htBleed: 'Bleed-air energy', W31: 'Turbine cooling air', W32: 'Turbine cooling air (low)',
}
export const signalName = (k) => SIGNALS[k] ?? k

/** The sensor signals that changed most over the last stretch. */
export function topSignals(sensors, n = 3) {
  return Object.entries(sensors || {})
    .map(([k, v]) => {
      const a = v.slice(0, 6), b = v.slice(-6)
      const change = b.reduce((s, x) => s + x, 0) / b.length - a.reduce((s, x) => s + x, 0) / a.length
      return { key: k, name: signalName(k), values: v, change }
    })
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
    .slice(0, n)
}

/** Plain sentence about one engine. */
export function engineSentence(e) {
  const flights = Math.max(0, Math.round(e.rul_mean))
  const lo = Math.max(0, Math.round(e.rul_mean - 2 * e.rul_sigma)), hi = Math.round(e.rul_mean + 2 * e.rul_sigma)
  if (e.state === 'in_maintenance') return { text: 'In the workshop for a swap.', tone: 'idle', flights, lo, hi }
  if (e.state === 'failed' || e.state === 'awaiting_spare') return { text: 'Failed; being repaired.', tone: 'crit', flights, lo, hi }
  if (e.health === 'critical') return { text: `About ${flights} flights left (range ${lo}–${hi}).`, tone: 'crit', flights, lo, hi }
  if (e.health === 'watch') return { text: `Wearing: about ${flights} flights left.`, tone: 'warn', flights, lo, hi }
  return { text: `Healthy: ${flights >= 120 ? '120+' : `about ${flights}`} flights left.`, tone: 'good', flights, lo, hi }
}
export function planSentence(e, stock) {
  if (e.state === 'in_maintenance') return 'Swap in progress.'
  if (e.scheduled_day != null) return `Swap booked for ${fmtDate(e.scheduled_day)}${e.scheduled_depot ? ` at ${e.scheduled_depot.replace('Depot ', '')} workshop` : ''}.`
  if (e.health === 'critical') return stock <= 0 ? 'Waiting for a spare engine to come back from refurbishment.' : 'Waiting for a free workshop slot.'
  if (e.health === 'watch') return 'Monitored. No action needed yet.'
  return 'No action needed.'
}
/** Wear 0-1 -> colour token (used by the 3D engine sections and the wear bars). */
export const wearTone = (v) => (v > 0.8 ? 'var(--crit)' : v > 0.5 ? 'var(--warn)' : 'var(--good)')

export const MODS = ['Fan', 'Compressor', 'Combustor', 'Turbine']
/** Wear of every engine section at a given engine age (cycle). Interpolates the backend's wear history. */
export function wearAt(info, age) {
  const h = info?.modules_history
  if (!h?.length || age == null || age >= h[h.length - 1].cycle) return info?.modules ?? {}
  const i = h.findIndex((x) => x.cycle >= age)
  if (i <= 0) return h[0]
  const a = h[i - 1], b = h[i], t = (age - a.cycle) / Math.max(1, b.cycle - a.cycle)
  return Object.fromEntries(MODS.map((m) => [m, a[m] + (b[m] - a[m]) * t]))
}
