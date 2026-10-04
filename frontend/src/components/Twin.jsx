import { lazy, Suspense, useEffect, useState } from 'react'
import { HEALTH, STATUS, fmtDate, useApi } from '../lib'
import { AnomalyBars, RulChart, Spark } from './Charts'

const Aircraft3D = lazy(() => import('./Aircraft3D'))
const MODS = ['Fan', 'Compressor', 'Combustor', 'Turbine']
const SPARKS = ['T30', 'T50', 'P30', 'Nc', 'Ps30', 'BPR']
const modTone = (v) => (v > 0.75 ? 'var(--serious)' : v > 0.5 ? 'var(--warn)' : 'var(--good)')

function nextAction(e, stock) {
  if (e.state === 'in_maintenance') return 'In the hangar'
  if (e.state === 'failed' || e.state === 'awaiting_spare') return 'Failed · in repair'
  if (e.scheduled_day != null) return `Swap ${fmtDate(e.scheduled_day)}`
  if (e.health === 'critical') return stock <= 0 ? 'Awaiting spare' : 'Awaiting slot'
  return 'Monitor'
}

export default function Twin({ day, policy, fleet, sel, setSel }) {
  const [eng, setEng] = useState(null)
  useEffect(() => {
    if (sel == null && fleet) {
      const w = fleet.aircraft.reduce((a, b) => (b.min_rul < a.min_rul && b.status !== 'In maintenance' ? b : a), fleet.aircraft[0])
      setSel(w.index)
    }
  }, [fleet, sel, setSel])
  useEffect(() => setEng(null), [sel])

  const raw = useApi(sel != null ? `/api/aircraft/${sel}?day=${day}&policy=${policy}` : null)
  const ac = raw && raw.index === sel ? raw : null
  if (!fleet || !ac) return <div className="view empty">Loading twin…</div>

  const stock = fleet.kpi.spares_stock
  const lower = ac.engines[0].rul_mean <= ac.engines[1].rul_mean ? 0 : 1
  const cur = eng ?? lower
  const e = ac.engines[cur]
  const mods = e.modules
  return (
    <div className="view twin">
      <section className="stage">
        <Suspense fallback={<div className="empty" style={{ paddingTop: 200 }}>Loading 3D…</div>}>
          <Aircraft3D engines={ac.engines} selected={eng} onSelect={setEng} />
        </Suspense>
        <div className="stage-tl">
          <span className="eyebrow">Digital twin</span>
          <span className="tail">{ac.tail}</span>
          <span className="chip" style={{ width: 'fit-content' }}><span className="dot" style={{ '--c': STATUS[ac.status] }} />{ac.status}</span>
        </div>
        <div className="stage-tr">
          <select className="select" value={sel} onChange={(ev) => setSel(+ev.target.value)} aria-label="Aircraft">
            {fleet.aircraft.map((a) => <option key={a.index} value={a.index}>{a.tail} · {a.status}</option>)}
          </select>
        </div>
        <div className="stage-bl">
          <span className="legend"><span className="dot" style={{ '--c': 'var(--good)' }} />Nominal drift</span>
          <span className="legend"><span className="dot" style={{ '--c': 'var(--warn)' }} />Elevated</span>
          <span className="legend"><span className="dot" style={{ '--c': 'var(--serious)' }} />High</span>
          <span className="legend"><span className="dot" style={{ '--c': 'var(--idle)' }} />Removed</span>
        </div>
        <div className="stage-br">Drag to orbit · scroll to zoom · click an engine</div>
      </section>

      <div className="panel">
        <div className="eng-tabs">
          {ac.engines.map((x, i) => (
            <button key={x.slot} className="eng-tab" aria-pressed={cur === i} onClick={() => setEng(i)}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="dot" style={{ '--c': HEALTH[x.health] }} />{x.position}</span>
              <b className="tnum">{Math.round(x.rul_mean)}<small>± {Math.round(2 * x.rul_sigma)} cycles</small></b>
            </button>
          ))}
        </div>

        <section className="card">
          <div className="card-h"><div><div className="card-t">Remaining useful life</div><div className="card-s">Predicted cycles to failure · shaded band is the 95% interval</div></div></div>
          <div className="card-b">
            <RulChart history={e.rul_history} fmtX={fmtDate} />
            <div className="kv">
              <div><span>Failure risk · 40 d</span><b className="tnum">{(e.risk * 100).toFixed(0)}%</b></div>
              <div><span>Cycles flown</span><b className="tnum">{e.cycle}</b></div>
              <div><span>Next action</span><b style={{ fontSize: 13 }}>{nextAction(e, stock)}</b></div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div><div className="card-t">Module condition</div><div className="card-s">Sensor-drift index vs this engine's own baseline</div></div></div>
          <div className="card-b">
            {MODS.map((m) => (
              <div className="mod" key={m}>
                <span>{m}</span>
                <div className="track"><i style={{ width: `${Math.max(3, mods[m] * 100)}%`, '--c': modTone(mods[m]) }} /></div>
                <span className="tnum" style={{ color: 'var(--ink-2)', textAlign: 'right' }}>{mods[m].toFixed(2)}</span>
              </div>
            ))}
            <p className="note" style={{ marginTop: 8 }}>Sensors are grouped by the engine module they observe. Illustrative mapping; C-MAPSS does not label module-level faults.</p>
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div><div className="card-t">Sensor trends</div><div className="card-s">Last 60 cycles, normalised</div></div></div>
          <div className="card-b">
            <div className="sparks">
              {SPARKS.map((k) => e.sensors[k] && (
                <div className="spark" key={k}><span><b style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{k}</b></span><Spark values={e.sensors[k]} /></div>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div><div className="card-t">Flight-data anomalies</div><div className="card-s">Last 30 days · one flight per day · autoencoder score ÷ threshold</div></div>
            <span className="chip"><span className="dot" style={{ '--c': ac.anomaly.flagged_days ? 'var(--warn)' : 'var(--good)' }} />{ac.anomaly.flagged_days} flagged</span></div>
          <div className="card-b">
            <AnomalyBars ratio={ac.anomaly.ratio} days={ac.anomaly.days} fmtX={fmtDate} />
            {ac.anomaly.flagged_days > 0 && <p className="note" style={{ marginTop: 8 }}>Most deviating signal on the latest flight: <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{ac.anomaly.latest_top_parameter}</b></p>}
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div><div className="card-t">Maintenance records</div><div className="card-s">Clustered with text analysis of aviation logbook entries</div></div></div>
          <div className="card-b">
            {ac.logs.length ? ac.logs.map((l, i) => (
              <div className="log" key={i}>
                <div className="meta"><span className="mono">{fmtDate(l.day)}</span><span>{l.engine === 0 ? 'Port' : 'Starboard'} engine</span><span className="chip">{l.component}</span></div>
                <p>{l.text}</p>
                <div className="meta"><span>Issue cluster: {l.cluster_terms.join(' · ')}</span></div>
              </div>
            )) : <div className="empty">No maintenance events yet</div>}
            <p className="note" style={{ marginTop: 6 }}>Log text is sampled from real MaintNet aviation records and attached to simulated events.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
