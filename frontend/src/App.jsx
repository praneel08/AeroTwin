import { useEffect, useState } from 'react'
import { useApi } from './lib'
import { Dock, TopBar } from './components/Shell'
import Overview from './components/Overview'
import Twin from './components/Twin'
import Schedule from './components/Schedule'
import Impact from './components/Impact'

export default function App() {
  const [view, setView] = useState('overview')
  const [day, setDay] = useState(96)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6)
  const [policy, setPolicy] = useState('predictive')
  const [sel, setSel] = useState(null)
  const meta = useApi('/api/meta')
  const days = meta?.days ?? 365

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setDay((d) => {
      if (d >= days - 1) { setPlaying(false); return d }
      return d + 1
    }), 1000 / speed)
    return () => clearInterval(t)
  }, [playing, speed, days])

  const fleet = useApi(`/api/fleet?day=${day}&policy=${policy}`)
  const kpis = useApi('/api/kpis')
  const open = (a) => { setSel(a); setView('twin') }
  const common = { day, policy, fleet, kpis, sel, setSel, open, setView }

  return (
    <div className="app">
      <TopBar view={view} setView={setView} policy={policy} setPolicy={setPolicy} />
      <main className="main">
        {view === 'overview' && <Overview {...common} />}
        {view === 'twin' && <Twin {...common} />}
        {view === 'schedule' && <Schedule {...common} />}
        {view === 'impact' && <Impact {...common} />}
      </main>
      <Dock day={day} days={days} setDay={setDay} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
    </div>
  )
}
