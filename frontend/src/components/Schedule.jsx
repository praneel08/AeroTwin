import { POLICY_LABEL, fmtDate } from '../lib'
import { useApi } from '../lib'
import { LineChart, Meter } from './Charts'

export default function Schedule({ day, policy, open }) {
  const d = useApi(`/api/schedule?day=${day}&policy=${policy}`)
  if (!d) return <div className="view empty">Loading schedule…</div>
  const noPlan = policy === 'corrective'
  const maxBays = 3
  return (
    <div className="view">
      <div className="pageh">
        <div>
          <h1>Maintenance schedule</h1>
          <p>{noPlan ? 'Repair on failure plans nothing in advance' : `Rolling 30-day plan · solved daily under depot-slot and spares limits · ${POLICY_LABEL[policy]}`}</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
        <section className="card">
          <div className="card-h"><div><div className="card-t">Upcoming engine swaps</div><div className="card-s">{d.upcoming.length} planned from {fmtDate(day)}</div></div></div>
          <div className="card-b">
            {d.upcoming.length ? (
              <table>
                <thead><tr><th>Aircraft</th><th>Engine</th><th>Starts</th><th>Depot</th><th className="r">Predicted RUL</th><th className="r">Risk before start</th></tr></thead>
                <tbody>
                  {d.upcoming.map((u) => (
                    <tr key={`${u.aircraft}-${u.engine}`} style={{ cursor: 'pointer' }} onClick={() => open(u.aircraft)}>
                      <td className="mono">{u.tail}</td>
                      <td>{u.engine}</td>
                      <td>{fmtDate(u.start_day)} <span style={{ color: 'var(--ink-3)' }}>· {u.in_days === 0 ? 'today' : `in ${u.in_days} d`}</span></td>
                      <td>{u.depot}</td>
                      <td className="r">{Math.round(u.rul_mean)} cycles</td>
                      <td className="r" style={{ color: u.risk_before_start > 0.15 ? 'var(--serious)' : 'var(--ink-2)' }}>{(u.risk_before_start * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{noPlan ? 'This policy waits for failures, so there is nothing to schedule.' : 'No swaps planned in the next 30 days'}</div>}
          </div>
        </section>

        <aside className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-h"><div><div className="card-t">Depot activity</div><div className="card-s">Swaps started in the last 3 days</div></div></div>
            <div className="card-b">
              {Object.entries(d.depot_load).map(([name, n]) => (
                <div key={name} style={{ padding: '7px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{name}</span><span className="tnum" style={{ color: 'var(--ink-2)' }}>{n} in work</span></div>
                  <Meter value={n} max={maxBays} color="var(--accent)" />
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-h"><div><div className="card-t">Spare engine pool</div><div className="card-s">Serviceable engines in stock · {d.spares_stock} now</div></div></div>
            <div className="card-b">
              <LineChart series={[{ key: 's', label: 'Spares in stock', color: 'var(--s1)', values: d.spares_series }]} yMin={0} yMax={10} height={170} markX={day} step wash
                fmtX={(i) => fmtDate(i)} yTicks={5} xTicks={4} />
            </div>
          </section>
          {!!d.in_progress.length && (
            <section className="card">
              <div className="card-h"><div className="card-t">In the hangar</div></div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="rows">
                  {d.in_progress.map((p) => (
                    <div className="row" key={`${p.tail}-${p.day}`}>
                      <div className="row-main"><div className="row-title"><span className="mono">{p.tail}</span><span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{p.engine}</span></div><div className="row-sub">{p.depot} · since {fmtDate(p.day)}</div></div>
                      <div className="row-val tnum"><b>{p.remaining_life}</b><span>cycles left at swap</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
