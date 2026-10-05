import { lazy, Suspense, useEffect, useState } from 'react'
import { engineSentence, fmtDate, HEALTH_COLOR, MODS, planSentence, STATUS, TONE, topSignals, useApi, wearAt, wearTone } from '../lib'
import { AnomalyBars, RulChart, Spark } from './Charts'

const TwinScene = lazy(() => import('../scene/TwinScene'))
const Chev = ({ d }) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const Reset = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v3h3" /></svg>

export default function TwinView({ day, policy, fleet, sel, setSel, theme }) {
  const [eng, setEng] = useState(null)   // engine opened in 3D: 0 | 1 | null
  const [age, setAge] = useState(null)   // engine age shown by the wear slider (null = now)
  const [layers, setLayers] = useState({ condition: true, xray: false, alerts: true })
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (sel == null && fleet) setSel(fleet.aircraft.reduce((a, b) => (b.min_rul < a.min_rul && b.status !== 'In maintenance' ? b : a), fleet.aircraft[0]).index)
  }, [fleet, sel, setSel])
  useEffect(() => { setEng(null); setAge(null) }, [sel])
  useEffect(() => { setAge(null) }, [eng])

  const raw = useApi(sel != null ? `/api/aircraft/${sel}?day=${day}&policy=${policy}` : null)
  const ac = raw && raw.index === sel ? raw : null
  if (!fleet || !ac) return <div className="loading">Loading aircraft…</div>

  const total = fleet.aircraft.length, stock = fleet.kpi.spares_stock
  const worseIdx = ac.engines[0].rul_mean <= ac.engines[1].rul_mean ? 0 : 1
  const pe = eng ?? worseIdx, e = ac.engines[pe]
  const worst = ac.engines[worseIdx], ws = engineSentence(worst)
  const wear = wearAt(e, eng === pe ? age : null)
  const sigs = topSignals(e.sensors, 3)
  const headline = worst.state !== 'operational' ? ws.text
    : worst.health === 'critical' ? `The ${worst.position.toLowerCase()} engine could fail in about ${ws.flights} flights.`
      : worst.health === 'watch' ? `The ${worst.position.toLowerCase()} engine is wearing: about ${ws.flights} flights left.` : 'Both engines are healthy.'
  const go = (d) => setSel((sel + d + total) % total)
  const flagged = ac.anomaly.flagged_days
  const ageNow = e.cycle

  return (
    <div className="twin">
      <section className="stage">
        <Suspense fallback={<div className="loading">Loading 3D…</div>}>
          <TwinScene engines={ac.engines} anomaly={ac.anomaly} selected={eng} onSelect={setEng} layers={layers} age={age} theme={theme} resetKey={resetKey} />
        </Suspense>
        <div className="over tl">
          <div className="eyebrow">Digital twin</div>
          <div className="tailno">{ac.tail}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontWeight: 700, color: 'var(--ink-2)' }}>
            <span className="dot" style={{ '--c': STATUS[ac.status].color }} />{STATUS[ac.status].label}
          </div>
        </div>
        <div className="over tr">
          <div className="chips" role="group" aria-label="View layers">
            {[['condition', 'Condition'], ['xray', 'X-ray'], ['alerts', 'Alerts']].map(([k, l]) => (
              <button key={k} className="chip" aria-pressed={layers[k]} onClick={() => setLayers({ ...layers, [k]: !layers[k] })}>{l}</button>
            ))}
          </div>
          <button className="icon-btn" onClick={() => { setEng(null); setResetKey((x) => x + 1) }} aria-label="Reset view" title="Reset view"><Reset /></button>
        </div>
        <div className="over bl hint">{eng == null ? 'Drag to rotate · scroll to zoom · click an engine to open it' : 'Drag the slider to replay how this engine wore out'}</div>
        <div className="over br lg">
          <span><span className="dot" style={{ '--c': 'var(--good)' }} />Low wear</span>
          <span><span className="dot" style={{ '--c': 'var(--warn)' }} />Moderate</span>
          <span><span className="dot" style={{ '--c': 'var(--crit)' }} />High</span>
        </div>
        {eng != null && (
          <div className="over bc wear">
            <div className="lab">How this engine wore out<small>{age == null || age >= ageNow ? `Today · flight ${ageNow}` : `Flight ${Math.round(age)} of ${ageNow}`}</small></div>
            <div className="scrub"><input type="range" min="0" max={ageNow} step="1" value={age ?? ageNow} style={{ '--p': `${((age ?? ageNow) / Math.max(ageNow, 1)) * 100}%` }}
              onChange={(ev) => setAge(+ev.target.value >= ageNow ? null : +ev.target.value)} aria-label="Engine age" /></div>
            <button className="btn" onClick={() => setAge(null)} style={{ padding: '6px 12px' }}>Today</button>
          </div>
        )}
      </section>

      <aside className="panel">
        <div className="nav">
          <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous aircraft"><Chev d="M9 2L4 7l5 5" /></button>
          <select value={sel} onChange={(ev) => setSel(+ev.target.value)} aria-label="Choose aircraft">
            {fleet.aircraft.map((a) => <option key={a.index} value={a.index}>{a.tail} · {STATUS[a.status].label}</option>)}
          </select>
          <button className="icon-btn" onClick={() => go(1)} aria-label="Next aircraft"><Chev d="M5 2l5 5-5 5" /></button>
        </div>

        <p className="say">{headline}</p>

        <div className="sec">
          <h5>Engines · remaining life</h5>
          {ac.engines.map((x, i) => {
            const s = engineSentence(x), c = TONE[s.tone], ok = x.state === 'operational'
            const max = 130, pos = Math.min(100, (x.rul_mean / max) * 100)
            const lo = Math.min(100, (Math.max(0, x.rul_mean - 2 * x.rul_sigma) / max) * 100), hi = Math.min(100, ((x.rul_mean + 2 * x.rul_sigma) / max) * 100)
            return (
              <button key={x.slot} className="eng" aria-pressed={eng === i} onClick={() => setEng(eng === i ? null : i)}>
                <div className="r"><b>{x.position} engine</b><span className="num tnum">{ok ? (s.flights >= 120 ? '120+' : s.flights) : '–'}<small>flights left</small></span></div>
                {ok && <div className="range" style={{ '--c': c }}><div className="rng" style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} /><div className="pt" style={{ left: `${Math.max(2, pos)}%` }} /></div>}
                <div className="m">{s.text}</div>
                <div className="m" style={{ color: 'var(--ink)', marginTop: 2 }}>{planSentence(x, stock)}</div>
              </button>
            )
          })}
          <p className="fine">The shaded band is the range AeroTwin is 95% confident about.</p>
        </div>

        <div className="sec">
          <h5>Why AeroTwin thinks so · {e.position.toLowerCase()} engine</h5>
          {sigs.map((s) => {
            const up = s.change > 0.02, down = s.change < -0.02
            return (
              <div className="sig" key={s.key}>
                <span>{s.name}</span><Spark values={s.values} />
                <span className="a" style={{ color: up || down ? 'var(--ink)' : 'var(--ink-3)' }}>{up ? 'Rising ↑' : down ? 'Falling ↓' : 'Steady'}</span>
              </div>
            )
          })}
          <p className="fine" style={{ marginTop: 6 }}>The three sensor readings that changed most over the last 60 flights.</p>
        </div>

        <details className="more">
          <summary>More detail ▾</summary>
          <div className="sec" style={{ marginBottom: 22 }}>
            <h5>Predicted remaining life, {e.position.toLowerCase()} engine (flights)</h5>
            <RulChart history={e.rul_history} fmtX={fmtDate} />
          </div>
          <div className="sec" style={{ marginBottom: 22 }}>
            <h5>Wear by engine section{eng === pe && age != null ? ' (at selected age)' : ''}</h5>
            {MODS.map((m) => (
              <div className="mod" key={m}><span>{m}</span><div className="track"><i style={{ width: `${Math.max(3, (wear[m] ?? 0) * 100)}%`, '--c': wearTone(wear[m] ?? 0) }} /></div><span className="tnum" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{Math.round((wear[m] ?? 0) * 100)}%</span></div>
            ))}
            <p className="fine" style={{ marginTop: 6 }}>A sensor-drift index from an illustrative grouping of sensors by section; the NASA data does not label section-level faults.</p>
          </div>
          <div className="sec" style={{ marginBottom: 22 }}>
            <h5>Unusual flight readings · last 30 days</h5>
            <AnomalyBars ratio={ac.anomaly.ratio} days={ac.anomaly.days} fmtX={fmtDate} />
            <p className="fine" style={{ marginTop: 6 }}>{flagged ? `${flagged} flight${flagged > 1 ? 's' : ''} flagged. Most unusual signal on the latest flight: ${ac.anomaly.latest_top_parameter}.` : 'All recent flights looked normal.'}</p>
          </div>
          <div className="sec">
            <h5>Repair notes</h5>
            {ac.logs.length ? ac.logs.slice(0, 3).map((l, i) => <div className="rec" key={i}><small>{fmtDate(l.day)} · {l.engine === 0 ? 'Port' : 'Starboard'} engine</small><p>{l.text}</p></div>) : <p className="fine">No repairs recorded yet.</p>}
            <p className="fine" style={{ marginTop: 8 }}>Notes are sampled from real aviation maintenance logs and attached to simulated events.</p>
          </div>
        </details>
      </aside>
    </div>
  )
}
