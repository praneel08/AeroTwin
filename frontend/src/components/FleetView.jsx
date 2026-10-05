import { useMemo } from 'react'
import { fmtDate, HEALTH_COLOR, ORDER, planSentence, POLICIES, POLICY, STATUS, useApi } from '../lib'

const LEGEND = ['Serviceable', 'Watch', 'Maintenance scheduled', 'In maintenance', 'AOG']
const NEEDS = new Set(['Watch', 'Awaiting spare', 'AOG'])

export default function FleetView({ day, policy, setPolicy, fleet, open, sel }) {
  const sched = useApi(`/api/schedule?day=${day}&policy=${policy}`)
  const sorted = useMemo(() => (fleet ? [...fleet.aircraft].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.index - b.index) : []), [fleet])
  if (!fleet) return <div className="loading">Loading fleet…</div>
  const k = fleet.kpi
  const total = fleet.aircraft.length
  const needs = fleet.aircraft.filter((a) => NEEDS.has(a.status)).length
  const risky = fleet.aircraft
    .flatMap((a) => a.engines.filter((e) => e.state === 'operational' && (e.health === 'critical' || e.health === 'watch')).map((e) => ({ ...e, tail: a.tail, ac: a.index })))
    .sort((x, y) => y.risk - x.risk).slice(0, 6)
  const next = (sched?.upcoming ?? []).filter((u) => u.in_days <= 14).slice(0, 6)

  return (
    <div className="page"><div className="wrap">
      <div className="head">
        <div>
          <div className="eyebrow">{fmtDate(day, true)}</div>
          <h1 className="h1">Fleet status</h1>
          <p className="sub">{POLICY[policy].blurb}</p>
        </div>
        <div className="seg" role="group" aria-label="Maintenance approach">
          {POLICIES.map((p) => <button key={p.key} aria-pressed={policy === p.key} onClick={() => setPolicy(p.key)}>{p.label}</button>)}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="eyebrow">Ready to fly</div>
          <div className="v tnum">{total - k.grounded}<small>of {total} aircraft</small></div>
          <p>{k.availability_to_date}% availability so far this year</p>
        </div>
        <div className="stat">
          <div className="eyebrow">Need attention</div>
          <div className="v tnum">{needs}<small>aircraft</small></div>
          <p>An engine is likely to fail within 40 flights, or the aircraft is grounded.</p>
        </div>
        <div className="stat">
          <div className="eyebrow">Spare engines</div>
          <div className="v tnum">{k.spares_stock}<small>of {k.spares_initial} in stock</small></div>
          <p>Serviceable and ready to install. Refurbished engines return after about three weeks.</p>
        </div>
      </div>

      <div className="map" aria-label="All aircraft">
        {sorted.map((a) => (
          <button key={a.index} className="cell" style={{ '--c': STATUS[a.status].color, borderColor: sel === a.index ? 'var(--accent)' : undefined }} onClick={() => open(a.index)}
            title={`${a.tail}: ${STATUS[a.status].label}`}>
            <span className="tail">{a.tail}</span>
            <span><span className="st">{STATUS[a.status].label}</span><span className="bar" style={{ display: 'block', marginTop: 5 }} /></span>
          </button>
        ))}
      </div>
      <div className="legend">{LEGEND.map((s) => <span key={s}><span className="dot" style={{ '--c': STATUS[s].color }} />{STATUS[s].label}</span>)}</div>

      <div className="cols">
        <section className="list">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Most at risk</div>
          {risky.length ? risky.map((e) => (
            <button key={e.slot} className="row" onClick={() => open(e.ac)}>
              <div><div className="t"><span className="dot" style={{ '--c': HEALTH_COLOR[e.health] }} />{e.tail} · {e.position} engine</div><div className="s">{planSentence(e, k.spares_stock)}</div></div>
              <div className="n tnum">{Math.max(0, Math.round(e.rul_mean))}<small>flights left</small></div>
            </button>
          )) : <p className="empty">No engines at elevated risk.</p>}
        </section>
        <section className="list">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Swaps in the next 14 days</div>
          {next.length ? next.map((u) => (
            <button key={`${u.aircraft}-${u.engine}`} className="row" onClick={() => open(u.aircraft)}>
              <div><div className="t">{u.tail} · {u.engine} engine</div><div className="s">{u.depot.replace('Depot ', '')} workshop</div></div>
              <div className="n tnum">{fmtDate(u.start_day)}<small>{u.in_days === 0 ? 'today' : `in ${u.in_days} days`}</small></div>
            </button>
          )) : <p className="empty">{policy === 'corrective' ? 'This approach does not plan swaps ahead.' : 'No swaps planned in the next 14 days.'}</p>}
        </section>
      </div>
    </div></div>
  )
}
