import { fmtDate } from '../lib'

const SPEEDS = [[2, '1×'], [6, '3×'], [16, '8×']]
const Play = () => <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.600v10.800a.6.6 0 0 0 .9.5l8.600-5.400a.6.6 0 0 0 0-1L3.900 1.100a.6.6 0 0 0-.9.500z" fill="currentColor" /></svg>
const Pause = () => <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.500" y="1.500" width="3" height="11" rx="1" fill="currentColor" /><rect x="8.500" y="1.500" width="3" height="11" rx="1" fill="currentColor" /></svg>

/** Replay bar: the fleet is simulated over one year; play it or drag to any day. */
export default function Dock({ day, days, setDay, playing, setPlaying, speed, setSpeed }) {
  return (
    <div className="dock">
      <button className="play" onClick={() => (day >= days - 1 ? (setDay(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause /> : <Play />}</button>
      <div className="scrub"><input type="range" min="0" max={days - 1} value={day} style={{ '--p': `${(day / (days - 1)) * 100}%` }} onChange={(e) => setDay(+e.target.value)} aria-label="Simulated day" /></div>
      <div className="when tnum"><b>{fmtDate(day, true)}</b><span>Day {day + 1} of {days}</span></div>
      <div className="seg" role="group" aria-label="Replay speed">{SPEEDS.map(([v, l]) => <button key={v} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{l}</button>)}</div>
    </div>
  )
}
