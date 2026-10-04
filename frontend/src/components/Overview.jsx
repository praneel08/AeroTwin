import { useMemo, useState } from 'react'
import { HEALTH, POLICY_COLOR, POLICY_LABEL, POLICY_ORDER, STATUS, fmtDate, mean, movingAvg } from '../lib'
import { LineChart, Meter } from './Charts'

const SHORT = { 'Maintenance scheduled': 'Scheduled', 'In maintenance': 'In hangar' }
const FILTERS = [['all', 'All'], ['attention', 'Needs attention'], ['grounded', 'Grounded']]
const ATTENTION = new Set(['Watch', 'Awaiting spare', 'Maintenance scheduled', 'AOG'])
const GROUNDED = new Set(['AOG', 'In maintenance'])

function actionFor(e, day, stock) {
  if (e.scheduled_day != null) {
    const n = e.scheduled_day - day
    return n <= 0 ? 'Swap today' : `Swap in ${n} d`
  }
  if (e.health === 'critical') return stock <= 0 ? 'Awaiting spare' : 'Awaiting slot'
  return 'Monitoring'
}

export default function Overview({ day, policy, fleet, kpis, sel, open, setView }) {
  const [filter, setFilter] = useState('all')
  const toDate = useMemo(() => {
    if (!kpis) return null
    return Object.fromEntries(POLICY_ORDER.map((p) => [p, mean(kpis.availability_series[p].slice(0, day + 1))]))
  }, [kpis, day])
  const series = useMemo(() => kpis && POLICY_ORDER.map((p) => ({
    key: p, label: POLICY_LABEL[p], color: POLICY_COLOR[p], values: movingAvg(kpis.availability_series[p], 14),
  })), [kpis])

  if (!fleet) return <div className="view empty">Loading fleet…</div>
  const k = fleet.kpi
  const stock = k.spares_stock
  const baseline = policy === 'corrective' ? 'predictive' : 'corrective'
  const delta = toDate ? (toDate[policy] - toDate[baseline]) : 0
  const visible = fleet.aircraft.filter((a) => filter === 'all' || (filter === 'attention' ? ATTENTION.has(a.status) : GROUNDED.has(a.status)))
  const risky = fleet.aircraft
    .flatMap((a) => a.engines.filter((e) => e.state === 'operational' && (e.health === 'critical' || e.health === 'watch')).map((e) => ({ ...e, tail: a.tail, ac: a.index })))
    .sort((x, y) => y.risk - x.risk).slice(0, 9)

  return (
    <div className="view">
      <div className="pageh">
        <div>
          <h1>Fleet readiness</h1>
          <p>{fleet.aircraft.length} aircraft · {fleet.aircraft.length * 2} engines · {POLICY_LABEL[policy]} policy</p>
        </div>
        <div className="legend chip"><span className="dot" style={{ '--c': 'var(--accent)' }} />{fmtDate(day, true)}</div>
      </div>

      <div className="kpis">
        <div className="card tile hero">
          <span className="eyebrow">Fleet availability · to date</span>
          <div className="v">{toDate ? toDate[policy].toFixed(1) : k.availability_to_date}<small>%</small></div>
          <span className={`delta ${delta < 0 ? 'neg' : ''}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} pts <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>vs {POLICY_LABEL[baseline].toLowerCase()}</span>
          </span>
        </div>
        <div className="card tile">
          <span className="eyebrow">Grounded now</span>
          <div className="v tnum">{k.grounded}<small>of {fleet.aircraft.length}</small></div>
          <Meter value={k.grounded} max={fleet.aircraft.length} color="var(--idle)" />
          <span className="sub">in maintenance or AOG</span>
        </div>
        <div className="card tile">
          <span className="eyebrow">Swaps · next 14 days</span>
          <div className="v tnum">{k.scheduled_next_14d}</div>
          <span className="sub">{k.planned_to_date} completed to date</span>
        </div>
        <div className="card tile">
          <span className="eyebrow">Spare engines</span>
          <div className="v tnum">{stock}<small>of {k.spares_initial}</small></div>
          <Meter value={stock} max={k.spares_initial} color={stock === 0 ? 'var(--serious)' : stock <= 2 ? 'var(--warn)' : 'var(--good)'} />
          <span className="sub">serviceable in stock</span>
        </div>
        <div className="card tile">
          <span className="eyebrow">Engine failures</span>
          <div className="v tnum">{k.failures_to_date}</div>
          <span className="sub">unplanned, to date</span>
        </div>
      </div>

      <div className="grid overview">
        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-h">
              <div><div className="card-t">Fleet board</div><div className="card-s">Click an aircraft to open its digital twin</div></div>
              <div className="seg" role="group" aria-label="Filter">
                {FILTERS.map(([v, l]) => <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
              </div>
            </div>
            <div className="card-b">
              <div className="board">
                {visible.map((a) => (
                  <button key={a.index} className={`ac ${a.anomaly_flag ? 'flag' : ''}`} aria-current={sel === a.index} onClick={() => open(a.index)}
                    title={a.anomaly_flag ? `Flight-data anomaly (${a.anomaly}× threshold)` : undefined}>
                    <div className="ac-top"><span className="ac-tail">{a.tail}</span></div>
                    <div className="ac-st"><span className="dot" style={{ '--c': STATUS[a.status] }} />{SHORT[a.status] ?? a.status}</div>
                    <div className="ac-eng">
                      {a.engines.map((e) => (
                        <div className="eng-bar" key={e.slot} title={`${e.position}: ${e.rul_mean} cycles`}>
                          <i style={{ width: `${Math.max(6, Math.min(100, (e.rul_mean / 125) * 100))}%`, '--c': HEALTH[e.health] }} />
                        </div>
                      ))}
                    </div>
                    <div className="ac-rul tnum"><span>P {Math.round(a.engines[0].rul_mean)}</span><span>S {Math.round(a.engines[1].rul_mean)}</span></div>
                  </button>
                ))}
              </div>
              {!visible.length && <div className="empty">Nothing in this view</div>}
            </div>
          </section>

          <section className="card">
            <div className="card-h">
              <div><div className="card-t">Availability by policy</div><div className="card-s">14-day rolling average of fleet availability, same simulated fleet</div></div>
              <div className="lgd">{POLICY_ORDER.map((p) => <span key={p} style={{ '--c': POLICY_COLOR[p] }}><i />{POLICY_LABEL[p]}</span>)}</div>
            </div>
            <div className="card-b">
              {series && <LineChart series={series} yMin={75} yMax={100} height={230} markX={day} yTicks={5} fmtY={(v) => `${v.toFixed(0)}%`} fmtX={(i) => fmtDate(i)} />}
            </div>
          </section>
        </div>

        <aside className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-h"><div><div className="card-t">Needs attention</div><div className="card-s">Engines ranked by failure risk in the next 40 days</div></div></div>
            <div className="card-b" style={{ paddingTop: 8 }}>
              <div className="rows">
                {risky.map((e) => (
                  <button key={e.slot} className="row" onClick={() => open(e.ac)}>
                    <div className="row-main">
                      <div className="row-title"><span className="dot" style={{ '--c': HEALTH[e.health] }} /><span className="mono">{e.tail}</span><span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{e.position}</span></div>
                      <div className="row-sub">{actionFor(e, day, stock)}</div>
                    </div>
                    <div className="row-val tnum"><b>{Math.round(e.rul_mean)}</b><span>± {Math.round(2 * e.rul_sigma)} cycles</span></div>
                  </button>
                ))}
                {!risky.length && <div className="empty">No engines at elevated risk</div>}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-b">
              <div className="card-t" style={{ marginBottom: 6 }}>About this data</div>
              <p className="note">Engine degradation is real NASA C-MAPSS run-to-failure data. Fleet composition, depots, spares and maintenance logs are simulated. Every remaining-life prediction comes from a model that never trained on that engine.</p>
              <button className="chip" style={{ marginTop: 12, cursor: 'pointer' }} onClick={() => setView('impact')}>See results →</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
