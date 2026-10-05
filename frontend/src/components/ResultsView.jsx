import { useMemo } from 'react'
import { fmtDate, movingAvg, POLICIES, POLICY, useApi } from '../lib'
import { LineChart } from './Charts'

const find = (h, p) => h[Object.keys(h).find((k) => k.startsWith(p))]
const ORDER = ['predictive', 'time_based', 'corrective']
const MODEL = { xgb: 'XGBoost', cnn: '1D CNN', lstm: 'LSTM', transformer: 'Transformer' }
const FAULT = { spike: 'Sudden spikes', drift: 'Slow drift', stuck: 'Stuck sensor', noise_burst: 'Noise bursts' }
const FDS = ['FD001', 'FD002', 'FD003', 'FD004']

function Bars({ rows, max, fmt }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className={`r ${r.us ? 'us' : ''}`} key={r.label}>
          <span>{r.label}</span><div className="t"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, '--c': r.color }} /></div><b className="tnum">{fmt(r.value)}</b>
        </div>
      ))}
    </div>
  )
}
const Legend = ({ items }) => <div className="lgd">{items.map((p) => <span key={p.key} style={{ '--c': p.color }}><i />{p.label}</span>)}</div>

export default function ResultsView({ day, policy, open }) {
  const kpis = useApi('/api/kpis')
  const models = useApi('/api/models')
  const sens = useApi('/api/sensitivity')
  const sched = useApi(`/api/schedule?day=${day}&policy=${policy}`)
  const series = useMemo(() => kpis && POLICIES.map((p) => ({ key: p.key, label: p.label, color: p.color, values: movingAvg(kpis.availability_series[p.key], 14) })), [kpis])
  if (!kpis || !models) return <div className="loading">Loading results…</div>

  const h = kpis.headline
  const v = { predictive: find(h, 'predictive'), time_based: find(h, 'time_based'), corrective: find(h, 'corrective') }
  const extra = Math.round((v.predictive.availability[0] - v.corrective.availability[0]) * 40)
  const costCut = Math.round(100 * (1 - v.predictive.cost[0] / v.corrective.cost[0]))
  const mk = (key, val) => ({ label: POLICY[key].label, value: val, color: POLICY[key].color, us: key === 'predictive' })
  const faults = Object.entries(models.anomaly.faults)
  const meanAuc = faults.reduce((s, [, f]) => s + f.auroc, 0) / faults.length
  const best = models.best_fd001
  const ours = Object.keys(MODEL).map((m) => ({ label: MODEL[m], value: models.rul.find((r) => r.fd === 'FD001' && r.model === m).rmse[0], color: 'var(--accent)', us: true }))
  const refs = Object.entries(models.published_fd001_rmse).map(([k, val]) => ({ label: k.replace(/ \(.*\)/, ''), value: val, color: 'var(--idle)' }))
  const acc = [...ours, ...refs].sort((a, b) => a.value - b.value)
  const bestRmse = Object.fromEntries(FDS.map((fd) => [fd, Math.min(...models.rul.filter((r) => r.fd === fd).map((r) => r.rmse[0]))]))
  const clusters = [...models.nlp.clusters].sort((a, b) => b.size - a.size).slice(0, 5)
  const logs = models.nlp.clusters.reduce((s, c) => s + c.size, 0)
  const sensSeries = sens && POLICIES.map((p) => ({ key: p.key, label: p.label, color: p.color, values: sens[p.key].map((d) => d.availability * 100) }))
  const spares = sens ? sens.predictive.map((d) => d.spares) : []
  const cross = sens && sens.predictive.find((d, i) => sens.predictive.slice(i).every((x, j) => x.availability > sens.time_based[i + j].availability))

  return (
    <div className="page"><div className="wrap">
      <div className="eyebrow">Headline results</div>
      <h1 className="h1" style={{ maxWidth: 820, marginTop: 6 }}>Predicting engine failures keeps about {extra} more jets ready to fly, every day.</h1>
      <p className="sub" style={{ maxWidth: 720 }}>Results from simulated fleets of 40 aircraft over one year, driven by real NASA engine-wear data. Only the maintenance approach differs between runs.</p>

      <div className="score">
        <div><div className="eyebrow">Ready to fly</div><div className="v tnum">{(v.predictive.availability[0] * 100).toFixed(1)}<small>%</small></div><p>of the fleet on an average day, vs {(v.corrective.availability[0] * 100).toFixed(1)}% running to failure</p></div>
        <div><div className="eyebrow">Unplanned failures</div><div className="v tnum">{Math.round(v.predictive.failures[0])}<small>per year</small></div><p>vs {Math.round(v.corrective.failures[0])} running to failure</p></div>
        <div><div className="eyebrow">Maintenance cost</div><div className="v tnum">−{costCut}<small>%</small></div><p>vs running to failure; {Math.round(100 * (1 - v.predictive.cost[0] / v.time_based.cost[0]))}% below the best fixed interval</p></div>
        <div><div className="eyebrow">Prediction error</div><div className="v tnum">±{Math.round(best.rmse[0])}<small>flights</small></div><p>typical error of the best model on the NASA benchmark</p></div>
        <div><div className="eyebrow">Anomaly detection</div><div className="v tnum">{meanAuc.toFixed(2)}<small>of 1.0</small></div><p>average detection score, with {(models.anomaly.false_alarm_rate_nominal_test * 100).toFixed(1)}% false alarms</p></div>
      </div>

      <section className="blk">
        <h2 className="h2">1 · Fleet impact</h2>
        <p className="lead">Same engines, same wear, same workshops and spares. The difference is how maintenance is decided.</p>
        <div className="cmp3">
          <div><h4>Ready to fly (% of fleet)</h4><Legend items={[]} /><Bars rows={ORDER.map((k) => mk(k, v[k].availability[0] * 100))} max={100} fmt={(x) => `${x.toFixed(1)}%`} /></div>
          <div><h4>Unplanned failures per year</h4><Bars rows={ORDER.map((k) => mk(k, v[k].failures[0]))} max={Math.max(...ORDER.map((k) => v[k].failures[0]))} fmt={(x) => Math.round(x)} /></div>
          <div><h4>Total maintenance cost</h4><Bars rows={ORDER.map((k) => mk(k, v[k].cost[0] / 1000))} max={Math.max(...ORDER.map((k) => v[k].cost[0] / 1000))} fmt={(x) => `${x.toFixed(1)}k`} /></div>
        </div>
        <div className="two" style={{ marginTop: 44 }}>
          <div>
            <h4 style={{ fontWeight: 800, marginBottom: 4 }}>Availability through the year</h4>
            <p className="fine" style={{ marginBottom: 10 }}>Share of the fleet ready to fly, 14-day average, one simulated fleet.</p>
            <Legend items={series} />
            <LineChart series={series} yMin={75} yMax={100} height={240} yTicks={5} fmtY={(x) => `${x.toFixed(0)}%`} fmtX={(i) => fmtDate(i)} />
          </div>
          {sens && (
            <div>
              <h4 style={{ fontWeight: 800, marginBottom: 4 }}>How many spare engines are needed?</h4>
              <p className="fine" style={{ marginBottom: 10 }}>{cross ? `AeroTwin pulls ahead from ${cross.spares} spares; with fewer, every approach struggles and a fixed interval does slightly better.` : 'Availability against the size of the spare pool.'}</p>
              <Legend items={sensSeries} />
              <LineChart series={sensSeries} yMin={50} yMax={100} height={240} yTicks={5} fmtY={(x) => `${x.toFixed(0)}%`} fmtX={(i) => `${spares[i]}`} xTicks={spares.length - 1} />
              <p className="fine" style={{ marginTop: 4 }}>Horizontal axis: spare engines in the pool.</p>
            </div>
          )}
        </div>
      </section>

      <section className="blk">
        <h2 className="h2">2 · Model performance and accuracy</h2>
        <p className="lead">How well the underlying models work, measured on data they did not train on.</p>

        <h4 style={{ fontWeight: 800, marginBottom: 4 }}>Remaining-life prediction</h4>
        <p className="takeaway">Typical error is about ±{Math.round(best.rmse[0])} flights: in line with early published deep-learning results, not yet state of the art.</p>
        <p className="fine" style={{ marginBottom: 10 }}>Average error in flights on the standard NASA benchmark (FD001). Lower is better. Blue: our models; grey: published results.</p>
        <Bars rows={acc} max={20} fmt={(x) => x.toFixed(1)} />
        <details className="disc">
          <summary>Show all four NASA test sets ▾</summary>
          <table>
            <thead><tr><th>Model (average error, flights)</th>{FDS.map((f) => <th key={f} className="r">{f}</th>)}</tr></thead>
            <tbody>{Object.entries(MODEL).map(([m, name]) => (
              <tr key={m}><td>{name}</td>{FDS.map((fd) => {
                const r = models.rul.find((x) => x.fd === fd && x.model === m), b = r && Math.abs(r.rmse[0] - bestRmse[fd]) < 1e-6
                return <td key={fd} className="r" style={{ fontWeight: b ? 800 : 600, color: b ? 'var(--ink)' : 'var(--ink-2)' }}>{r ? r.rmse[0].toFixed(1) : '–'}</td>
              })}</tr>))}</tbody>
          </table>
          <p className="fine" style={{ marginTop: 8 }}>FD001 and FD003 have one operating condition; FD002 and FD004 have six and are harder. One standard setup, no per-set tuning. “Average error” is the root-mean-square error (RMSE).</p>
        </details>

        <div className="two" style={{ marginTop: 48 }}>
          <div>
            <h4 style={{ fontWeight: 800, marginBottom: 4 }}>Can the uncertainty range be trusted?</h4>
            <p className="takeaway" style={{ fontSize: 15.5 }}>Raw ranges were overconfident, so we widened them {models.uncertainty.factor}× before planning with them.</p>
            <div className="stat2 tnum">{Math.round(models.uncertainty.raw * 100)}% → {Math.round(models.uncertainty.calibrated * 100)}%<span>coverage</span></div>
            <p className="fine">A 95% range should contain the true remaining life about 95% of the time. Measured on engines the model had not seen, during the wear-out phase. The factor was set on this same data, so treat it as optimistic.</p>
          </div>
          <div>
            <h4 style={{ fontWeight: 800, marginBottom: 4 }}>Spotting unusual flights</h4>
            <p className="takeaway" style={{ fontSize: 15.5 }}>Catches spikes, drift and noise well; struggles with stuck sensors. {(models.anomaly.false_alarm_rate_nominal_test * 100).toFixed(1)}% false alarms on normal flights.</p>
            {faults.map(([k, f]) => (
              <div className="hbar" key={k}><span>{FAULT[k]}</span><div className="t"><i style={{ width: `${(f.auroc - 0.5) * 200}%`, '--c': 'var(--accent)' }} /></div><b className="tnum">{f.auroc.toFixed(2)}</b></div>
            ))}
            <p className="fine" style={{ marginTop: 6 }}>Detection score (AUROC): 0.5 is guessing, 1.0 is perfect. Faults were inserted into held-out normal NASA flights.</p>
          </div>
        </div>

        <div style={{ marginTop: 48 }}>
          <h4 style={{ fontWeight: 800, marginBottom: 4 }}>Repair-note analysis</h4>
          <p className="takeaway" style={{ fontSize: 15.5 }}>{logs.toLocaleString()} real aviation maintenance notes grouped into {models.nlp.clusters.length} kinds of issue.</p>
          <table>
            <thead><tr><th>Most common issue groups (typical words)</th><th>Part of aircraft</th><th className="r">Notes</th></tr></thead>
            <tbody>{clusters.map((c) => <tr key={c.id}><td>{c.top_terms.slice(0, 3).join(' · ')}</td><td>{c.main_component}</td><td className="r">{c.size}</td></tr>)}</tbody>
          </table>
          <p className="fine" style={{ marginTop: 8 }}>Cleaned so that words like “not” and part numbers survive, then clustered by topic. Mostly piston-engine logs, so groups skew towards engine parts.</p>
        </div>
      </section>

      <section className="blk" style={{ marginTop: 48 }}>
        <details className="acc">
          <summary>Maintenance plan for {fmtDate(day, true)}</summary>
          <div className="in">
            {sched?.upcoming?.length ? (
              <table>
                <thead><tr><th>Aircraft</th><th>Engine</th><th>Swap on</th><th>Workshop</th><th className="r">Flights left</th><th className="r">Risk before swap</th></tr></thead>
                <tbody>{sched.upcoming.map((u) => (
                  <tr key={`${u.aircraft}-${u.engine}`} style={{ cursor: 'pointer' }} onClick={() => open(u.aircraft)}>
                    <td>{u.tail}</td><td>{u.engine}</td><td>{fmtDate(u.start_day)} <span className="muted">· in {u.in_days} d</span></td><td>{u.depot.replace('Depot ', '')}</td>
                    <td className="r">{Math.round(u.rul_mean)}</td><td className="r">{(u.risk_before_start * 100).toFixed(0)}%</td>
                  </tr>))}</tbody>
              </table>
            ) : <p className="fine">Nothing planned: the selected approach does not schedule ahead. Choose AeroTwin on the Fleet tab.</p>}
            <p className="fine" style={{ marginTop: 10 }}>Re-planned every simulated day with a constraint solver, limited to three swaps a day and to the spare engines that will be available.</p>
          </div>
        </details>
        <details className="acc">
          <summary>What is real and what is simulated</summary>
          <div className="in"><p className="fine" style={{ fontSize: 14.5, lineHeight: 1.7, maxWidth: 780 }}>Engine wear is real NASA run-to-failure data (one family of turbofan engines). The fleet of 40 aircraft, three workshops, the spare-engine pool, costs and the repair notes attached to events are simulated, because no public military data exists. Every prediction shown comes from a model that never trained on that engine. The link between unusual flight readings and engine wear is simulated, and the wear-by-section view uses an illustrative sensor grouping. The fixed-interval baseline was tuned on the same simulated fleets it is scored on. AeroTwin is decision support for maintenance crews, not an automatic authority.</p></div>
        </details>
      </section>
    </div></div>
  )
}
