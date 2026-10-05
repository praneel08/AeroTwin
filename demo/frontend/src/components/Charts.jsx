import { useEffect, useRef, useState } from 'react'

export function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.floor(e.contentRect.width))))
    ro.observe(el)
    setW(Math.max(120, el.clientWidth))
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const f = (n) => n.toFixed(1)
const poly = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`).join('')
const PAD = { l: 38, r: 10, t: 10, b: 22 }

function Tip({ x, top, title, rows }) {
  return (
    <div className="tip" style={{ left: x, top }}>
      <b>{title}</b>
      {rows.map((r) => (
        <div key={r.label}><span>{r.color && <i style={{ background: r.color }} />}{r.label}</span><span className="tnum">{r.value}</span></div>
      ))}
    </div>
  )
}

/** Multi-series line chart. One y-axis, hairline grid, 2px lines, crosshair + tooltip. */
export function LineChart({ series, yMin, yMax, height = 220, fmtY = (v) => v, fmtX = (v) => v, markX = null, step = false, wash = false, xTicks = 6, yTicks = 4 }) {
  const [ref, w] = useWidth()
  const [hv, setHv] = useState(null)
  const n = series[0].values.length
  const iw = w - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const X = (i) => PAD.l + (i / (n - 1)) * iw
  const Y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * ih
  const path = (vals) => {
    if (!step) return poly(vals.map((v, i) => [X(i), Y(v)]))
    return vals.map((v, i) => (i ? `H${f(X(i))}V${f(Y(v))}` : `M${f(X(i))},${f(Y(v))}`)).join('')
  }
  const yt = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks)
  const xt = Array.from({ length: xTicks + 1 }, (_, i) => Math.round(((n - 1) * i) / xTicks))
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={height}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHv(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left - PAD.l) / iw) * (n - 1)))))
        }}
        onMouseLeave={() => setHv(null)}>
        <g className="axis">
          {yt.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" />
              <text x={PAD.l - 8} y={Y(t) + 3.5} textAnchor="end">{fmtY(t)}</text>
            </g>
          ))}
          {xt.map((t) => <text key={t} x={X(t)} y={height - 5} textAnchor={t === 0 ? 'start' : t === n - 1 ? 'end' : 'middle'}>{fmtX(t)}</text>)}
        </g>
        {wash && series.length === 1 && (
          <path d={`${path(series[0].values)}L${f(X(n - 1))},${f(Y(yMin))}L${f(X(0))},${f(Y(yMin))}Z`} style={{ fill: series[0].color, opacity: 0.1 }} />
        )}
        {series.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: s.color }} />
        ))}
        {markX != null && (
          <g>
            <line x1={X(markX)} x2={X(markX)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--ink-3)" strokeDasharray="2 3" />
            {series.map((s) => <circle key={s.key} cx={X(markX)} cy={Y(s.values[markX])} r="4" style={{ fill: s.color, stroke: 'var(--surface)' }} strokeWidth="2" />)}
          </g>
        )}
        {hv != null && (
          <g>
            <line x1={X(hv)} x2={X(hv)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--line-2)" />
            {series.map((s) => <circle key={s.key} cx={X(hv)} cy={Y(s.values[hv])} r="4" style={{ fill: s.color, stroke: 'var(--surface)' }} strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hv != null && (
        <Tip x={Math.min(Math.max(X(hv), 70), w - 70)} top={PAD.t + 4} title={fmtX(hv)}
          rows={series.map((s) => ({ label: s.label, color: s.color, value: fmtY(s.values[hv]) }))} />
      )}
    </div>
  )
}

/** RUL history with a +-2 sigma band and the alarm threshold. history = [[day, mean, sigma], ...] */
export function RulChart({ history, alarm = 40, height = 170, fmtX = (v) => v }) {
  const [ref, w] = useWidth()
  const [hv, setHv] = useState(null)
  if (!history || history.length < 2) return <div className="empty" ref={ref}>Not enough history yet</div>
  const n = history.length
  const iw = w - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const yMax = 130
  const X = (i) => PAD.l + (i / (n - 1)) * iw
  const Y = (v) => PAD.t + (1 - Math.min(Math.max(v, 0), yMax) / yMax) * ih
  const up = history.map((h, i) => [X(i), Y(h[1] + 2 * h[2])])
  const lo = history.map((h, i) => [X(i), Y(h[1] - 2 * h[2])]).reverse()
  const hvp = hv != null ? history[hv] : null
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={height}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHv(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left - PAD.l) / iw) * (n - 1)))))
        }}
        onMouseLeave={() => setHv(null)}>
        <g className="axis">
          {[0, 40, 80, 120].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" />
              <text x={PAD.l - 8} y={Y(t) + 3.5} textAnchor="end">{t}</text>
            </g>
          ))}
          <text x={PAD.l} y={height - 5} textAnchor="start">{fmtX(history[0][0])}</text>
          <text x={w - PAD.r} y={height - 5} textAnchor="end">{fmtX(history[n - 1][0])}</text>
        </g>
        <line x1={PAD.l} x2={w - PAD.r} y1={Y(alarm)} y2={Y(alarm)} stroke="var(--serious)" strokeOpacity=".55" strokeDasharray="3 4" />
        <path d={`${poly(up)}L${poly(lo).slice(1)}Z`} style={{ fill: 'var(--s1)', opacity: 0.12 }} />
        <path d={poly(history.map((h, i) => [X(i), Y(h[1])]))} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--s1)' }} />
        <circle cx={X(n - 1)} cy={Y(history[n - 1][1])} r="4" style={{ fill: 'var(--s1)', stroke: 'var(--surface)' }} strokeWidth="2" />
        {hv != null && <line x1={X(hv)} x2={X(hv)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--line-2)" />}
      </svg>
      {hvp && (
        <Tip x={Math.min(Math.max(X(hv), 80), w - 80)} top={PAD.t + 4} title={fmtX(hvp[0])}
          rows={[{ label: 'Predicted RUL', color: 'var(--s1)', value: `${hvp[1]} cycles` }, { label: '95% interval', value: `${Math.max(0, hvp[1] - 2 * hvp[2]).toFixed(0)}–${(hvp[1] + 2 * hvp[2]).toFixed(0)}` }]} />
      )}
    </div>
  )
}

export function Spark({ values, height = 26, color = 'var(--ink-2)' }) {
  const [ref, w] = useWidth()
  if (!values?.length) return <div ref={ref} style={{ height }} />
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const X = (i) => 2 + (i / Math.max(values.length - 1, 1)) * (w - 6)
  const Y = (v) => 3 + (1 - (v - lo) / span) * (height - 6)
  const last = values.length - 1
  return (
    <div ref={ref}>
      <svg width={w} height={height}>
        <path d={poly(values.map((v, i) => [X(i), Y(v)]))} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
        <circle cx={X(last)} cy={Y(values[last])} r="2.5" style={{ fill: 'var(--s1)' }} />
      </svg>
    </div>
  )
}

/** Per-flight anomaly ratio (score / threshold). Bars above 1 are flagged. */
export function AnomalyBars({ ratio, days, height = 76, fmtX = (v) => v }) {
  const [ref, w] = useWidth()
  const [hv, setHv] = useState(null)
  const n = ratio.length
  const yMax = Math.max(2, ...ratio) * 1.05
  const slot = (w - 4) / n
  const bw = Math.min(10, slot * 0.62)
  const Y = (v) => 4 + (1 - v / yMax) * (height - 10)
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={height} onMouseLeave={() => setHv(null)}>
        <line x1="0" x2={w} y1={Y(1)} y2={Y(1)} stroke="var(--serious)" strokeOpacity=".55" strokeDasharray="3 4" />
        {ratio.map((v, i) => {
          const x = 2 + i * slot + (slot - bw) / 2
          const h = Math.max(2, height - 6 - Y(v))
          return (
            <g key={i} onMouseEnter={() => setHv(i)}>
              <rect x={2 + i * slot} y="0" width={slot} height={height} fill="transparent" />
              <rect x={x} y={height - 6 - h + 0} width={bw} height={h} rx="2" style={{ fill: v > 1 ? 'var(--warn)' : 'var(--hover)' }} opacity={hv === i ? 1 : 0.95} />
            </g>
          )
        })}
      </svg>
      {hv != null && <Tip x={Math.min(Math.max(2 + hv * slot + slot / 2, 70), w - 70)} top={4} title={fmtX(days[hv])} rows={[{ label: 'Anomaly score', value: `${ratio[hv].toFixed(2)}× threshold` }]} />}
    </div>
  )
}

export function Meter({ value, max = 1, color = 'var(--accent)' }) {
  return <div className="meter"><i style={{ width: `${Math.min(100, (value / max) * 100)}%`, '--c': color }} /></div>
}
