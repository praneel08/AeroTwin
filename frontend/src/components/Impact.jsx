import { useMemo } from 'react'
import { POLICY_COLOR, POLICY_LABEL, POLICY_ORDER, fmtDate, movingAvg, useApi } from '../lib'
import { LineChart } from './Charts'

const MODEL_NAME = { xgb: 'XGBoost', cnn: '1D CNN', lstm: 'LSTM', transformer: 'Transformer' }
const FAULT_NAME = { spike: 'Spikes', drift: 'Slow drift', stuck: 'Stuck sensor', noise_burst: 'Noise bursts' }
const FDS = ['FD001', 'FD002', 'FD003', 'FD004']
const find = (h, p) => h[Object.keys(h).find((k) => k.startsWith(p))]

function Stat({ label, value, unit, sub, hero }) {
  return (
    <div className={`card tile ${hero ? 'hero' : ''}`}>
      <span className="eyebrow">{label}</span>
      <div className="v tnum">{value}<small>{unit}</small></div>
      <span className="sub">{sub}</span>
    </div>
  )
}

function Bars({ rows, max, fmt, color }) {
  return rows.map((r) => (
    <div className="hbar" key={r.label}>
      <span>{r.label}</span>
      <div className="track"><i style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, '--c': r.color ?? color }} /></div>
      <span className="tnum" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{fmt(r.value)}</span>
    </div>
  ))
}

export default function Impact({ kpis }) {
  const models = useApi('/api/models')
  const sens = useApi('/api/sensitivity')
  const series = useMemo(() => kpis && POLICY_ORDER.map((p) => ({
    key: p, label: POLICY_LABEL[p], color: POLICY_COLOR[p], values: movingAvg(kpis.availability_series[p], 14),
  })), [kpis])
  if (!kpis || !models) return <div className="view empty">Loading results…</div>

  const h = kpis.headline
  const ours = find(h, 'predictive'), base = find(h, 'corrective'), fixed = find(h, 'time_based'), oracle = find(h, 'oracle')
  const rows = [['predictive', ours], ['time_based', fixed], ['corrective', base]]
  const bestRmse = Object.fromEntries(FDS.map((fd) => [fd, Math.min(...models.rul.filter((r) => r.fd === fd).map((r) => r.rmse[0]))]))
  const clusters = [...models.nlp.clusters].sort((a, b) => b.size - a.size).slice(0, 7)

  return (
    <div className="view">
      <div className="pageh">
        <div>
          <h1>Impact</h1>
          <p>{kpis.worlds} simulated fleets · 365 days · 40 aircraft · averages across fleets. Same fleet, same failures, different maintenance policy.</p>
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Stat hero label="Availability gain" value={`+${((ours.availability[0] - base.availability[0]) * 100).toFixed(1)}`} unit=" pts"
          sub={`${(ours.availability[0] * 100).toFixed(1)}% vs ${(base.availability[0] * 100).toFixed(1)}% repair on failure`} />
        <Stat label="Unplanned failures" value={`−${(100 * (1 - ours.failures[0] / base.failures[0])).toFixed(0)}`} unit="%"
          sub={`${ours.failures[0].toFixed(0)} vs ${base.failures[0].toFixed(0)} per year`} />
        <Stat label="Cost vs best fixed interval" value={`−${(100 * (1 - ours.cost[0] / fixed.cost[0])).toFixed(0)}`} unit="%"
          sub={`Interval tuned to ${kpis.best_T} cycles on these same fleets`} />
        <Stat label="Engine life wasted per swap" value={ours.mean_wasted_cycles[0].toFixed(0)} unit=" cycles"
          sub={`${fixed.mean_wasted_cycles[0].toFixed(0)} with the fixed interval`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', marginBottom: 16 }}>
        <section className="card">
          <div className="card-h">
            <div><div className="card-t">Fleet availability over the year</div><div className="card-s">14-day rolling average · one simulated fleet</div></div>
            <div className="lgd">{POLICY_ORDER.map((p) => <span key={p} style={{ '--c': POLICY_COLOR[p] }}><i />{POLICY_LABEL[p]}</span>)}</div>
          </div>
          <div className="card-b"><LineChart series={series} yMin={75} yMax={100} height={250} yTicks={5} fmtY={(v) => `${v.toFixed(0)}%`} fmtX={(i) => fmtDate(i)} /></div>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="card-t">Policy comparison</div><div className="card-s">Mean over {kpis.worlds} fleets</div></div></div>
          <div className="card-b">
            <table>
              <thead><tr><th>Policy</th><th className="r">Avail.</th><th className="r">Failures</th><th className="r">Swaps</th><th className="r">Cost</th></tr></thead>
              <tbody>
                {rows.map(([p, v]) => (
                  <tr key={p} className={p === 'predictive' ? 'hl' : ''}>
                    <td><span className="legend"><span className="dot" style={{ '--c': POLICY_COLOR[p] }} />{POLICY_LABEL[p]}</span></td>
                    <td className="r">{(v.availability[0] * 100).toFixed(1)}%</td><td className="r">{v.failures[0].toFixed(0)}</td>
                    <td className="r">{v.planned[0].toFixed(0)}</td><td className="r">{(v.cost[0] / 1000).toFixed(1)}k</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ color: 'var(--ink-3)' }}>Perfect-RUL reference</td>
                  <td className="r" style={{ color: 'var(--ink-3)' }}>{(oracle.availability[0] * 100).toFixed(1)}%</td><td className="r" style={{ color: 'var(--ink-3)' }}>{oracle.failures[0].toFixed(0)}</td>
                  <td className="r" style={{ color: 'var(--ink-3)' }}>{oracle.planned[0].toFixed(0)}</td><td className="r" style={{ color: 'var(--ink-3)' }}>{(oracle.cost[0] / 1000).toFixed(1)}k</td>
                </tr>
              </tbody>
            </table>
            <p className="note" style={{ marginTop: 10 }}>Fleet size, depots (3), spare pool (10 engines) and costs are simulation assumptions. The perfect-RUL reference plans with a small safety margin, so it is a reference point rather than a hard bound.</p>
          </div>
        </section>
      </div>


      {sens && (() => {
        const spares = sens.predictive.map((d) => d.spares)
        const ss = POLICY_ORDER.map((p) => ({ key: p, label: POLICY_LABEL[p], color: POLICY_COLOR[p], values: sens[p].map((d) => d.availability * 100) }))
        const cross = sens.predictive.find((d, i) => sens.predictive.slice(i).every((x, j) => x.availability > sens.time_based[i + j].availability))
        const at = (p, n) => sens[p].find((d) => d.spares === n)
        const ref = at('predictive', 10) ? 10 : spares[spares.length - 1]
        return (
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <div><div className="card-t">How many spare engines does the fleet need?</div><div className="card-s">Availability vs size of the serviceable spare pool · mean of 4 simulated fleets</div></div>
              <div className="lgd">{POLICY_ORDER.map((p) => <span key={p} style={{ '--c': POLICY_COLOR[p] }}><i />{POLICY_LABEL[p]}</span>)}</div>
            </div>
            <div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 28, alignItems: 'center' }}>
              <LineChart series={ss} yMin={50} yMax={100} height={230} yTicks={5} fmtY={(v) => `${v.toFixed(0)}%`} fmtX={(i) => `${spares[i]} spares`} xTicks={spares.length - 1} />
              <div>
                {cross && <p style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: '-0.01em' }}>AeroTwin pulls ahead from <b>{cross.spares} spare engines</b>. With {ref}, it delivers <b>{(at('predictive', ref).availability * 100).toFixed(1)}%</b> against {(at('time_based', ref).availability * 100).toFixed(1)}% for a fixed interval.</p>}
                <p className="note" style={{ marginTop: 10 }}>Spares are the binding constraint in this fleet. Below about 8, the pool runs dry and every policy collapses; there the fixed interval does slightly better, so the predictive gain depends on a sensible spare pool. Beyond about 12, extra engines add almost nothing.</p>
              </div>
            </div>
          </section>
        )
      })()}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)' }}>
        <section className="card">
          <div className="card-h"><div><div className="card-t">Remaining-life prediction</div><div className="card-s">Test-set RMSE in cycles on NASA C-MAPSS · lower is better · mean of 3 runs</div></div></div>
          <div className="card-b">
            <table>
              <thead><tr><th>Model</th>{FDS.map((f) => <th key={f} className="r">{f}</th>)}</tr></thead>
              <tbody>
                {Object.entries(MODEL_NAME).map(([m, name]) => (
                  <tr key={m}>
                    <td>{name}</td>
                    {FDS.map((fd) => {
                      const r = models.rul.find((x) => x.fd === fd && x.model === m)
                      const best = r && Math.abs(r.rmse[0] - bestRmse[fd]) < 1e-6
                      return <td key={fd} className="r" style={{ fontWeight: best ? 600 : 400, color: best ? 'var(--ink)' : 'var(--ink-2)' }}>{r ? r.rmse[0].toFixed(1) : '–'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note" style={{ marginTop: 10 }}>
              Published FD001 reference: {Object.entries(models.published_fd001_rmse).map(([k, v]) => `${k} ${v}`).join(' · ')}. Our models use one standard pipeline with no per-subset tuning, so they sit in the range of the early deep-learning baselines rather than the 2021 attention models.
            </p>
          </div>
        </section>

        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-h"><div><div className="card-t">Flight-data anomaly detection</div><div className="card-s">Autoencoder AUROC on injected faults · {(models.anomaly.false_alarm_rate_nominal_test * 100).toFixed(1)}% false alarms on nominal flights</div></div></div>
            <div className="card-b">
              <Bars rows={Object.entries(models.anomaly.faults).map(([k, v]) => ({ label: FAULT_NAME[k], value: v.auroc - 0.5 }))} max={0.5} color="var(--s1)" fmt={(v) => (v + 0.5).toFixed(2)} />
              <p className="note" style={{ marginTop: 6 }}>Trained on nominal NASA flight windows only; the threshold comes from nominal validation data. Stuck sensors on already-steady signals are inherently hard to see.</p>
            </div>
          </section>
          <section className="card">
            <div className="card-h"><div><div className="card-t">Maintenance-log analysis</div><div className="card-s">{models.nlp.clusters.reduce((s, c) => s + c.size, 0).toLocaleString()} aviation log entries · {models.nlp.clusters.length} issue clusters</div></div></div>
            <div className="card-b" style={{ paddingTop: 8 }}>
              <div className="rows">
                {clusters.map((c) => (
                  <div className="row" key={c.id}>
                    <div className="row-main"><div className="row-title" style={{ fontWeight: 500 }}>{c.top_terms.slice(0, 3).join(' · ')}</div><div className="row-sub">{c.main_component}</div></div>
                    <div className="row-val tnum"><b>{c.size}</b></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
