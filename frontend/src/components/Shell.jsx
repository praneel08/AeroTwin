import { POLICY_LABEL, POLICY_ORDER, fmtDate } from '../lib'

const TABS = [['overview', 'Overview'], ['twin', 'Digital twin'], ['schedule', 'Schedule'], ['impact', 'Impact']]

export function TopBar({ view, setView, policy, setPolicy }) {
  return (
    <header className="top">
      <div className="brand">
        <div className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 32 32"><path d="M16 4l3.2 9.4 8.8 4.2v2.4l-8.6-1.6L18.4 25l3.2 2.2V29L16 27.4 10.4 29v-1.8l3.2-2.2-1-6.600L4 19.200v-2.400l8.800-4.200z" fill="var(--accent)" /></svg>
        </div>
        <span className="brand-name">AeroTwin</span>
        <span className="brand-sub">Fleet readiness</span>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} className="tab" role="tab" aria-selected={view === k} onClick={() => setView(k)}>{label}</button>
        ))}
      </nav>
      <div className="top-right">
        <div className="seg" role="group" aria-label="Maintenance policy">
          {POLICY_ORDER.map((p) => (
            <button key={p} aria-pressed={policy === p} onClick={() => setPolicy(p)}>{POLICY_LABEL[p]}</button>
          ))}
        </div>
        <span className="chip" title="Engine degradation is real NASA C-MAPSS data. Fleet, depots, spares and maintenance logs are simulated. Predictions are out-of-fold.">
          <span className="dot" style={{ '--c': 'var(--accent)' }} />Simulated fleet
        </span>
      </div>
    </header>
  )
}

const Play = () => <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.600v10.800a.6.6 0 0 0 .9.5l8.600-5.400a.6.6 0 0 0 0-1L3.900 1.100a.6.6 0 0 0-.9.500z" fill="currentColor" /></svg>
const Pause = () => <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.500" y="1.500" width="3" height="11" rx="1" fill="currentColor" /><rect x="8.500" y="1.500" width="3" height="11" rx="1" fill="currentColor" /></svg>

const SPEEDS = [[2, '2 d/s'], [6, '6 d/s'], [16, '16 d/s']]

export function Dock({ day, days, setDay, playing, setPlaying, speed, setSpeed }) {
  return (
    <footer className="dock">
      <button className="play" onClick={() => (day >= days - 1 ? (setDay(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause /> : <Play />}
      </button>
      <div className="scrub">
        <input type="range" min="0" max={days - 1} value={day} style={{ '--p': `${(day / (days - 1)) * 100}%` }}
          onChange={(e) => setDay(+e.target.value)} aria-label="Simulation day" />
        <div className="tick-labels"><span>{fmtDate(0)}</span><span>{fmtDate(Math.round(days / 4))}</span><span>{fmtDate(Math.round(days / 2))}</span><span>{fmtDate(Math.round((days * 3) / 4))}</span><span>{fmtDate(days - 1)}</span></div>
      </div>
      <div className="when tnum"><b>{fmtDate(day, true)}</b><span>Day {day + 1} of {days}</span></div>
      <div className="seg" role="group" aria-label="Replay speed">
        {SPEEDS.map(([v, l]) => <button key={v} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{l}</button>)}
      </div>
    </footer>
  )
}
