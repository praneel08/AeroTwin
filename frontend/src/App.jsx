import { useEffect, useState } from 'react'
import { useApi } from './lib'
import { useTheme } from './theme'
import TopBar from './components/TopBar'
import Dock from './components/Dock'
import FleetView from './components/FleetView'
import TwinView from './components/TwinView'
import ResultsView from './components/ResultsView'

export default function App() {
  const [view, setView] = useState('fleet')
  const [day, setDay] = useState(96)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6)
  const [policy, setPolicy] = useState('predictive')
  const [sel, setSel] = useState(null)
  const [theme, toggleTheme] = useTheme()
  const meta = useApi('/api/meta')
  const days = meta?.days ?? 365

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setDay((d) => { if (d >= days - 1) { setPlaying(false); return d } return d + 1 }), 1000 / speed)
    return () => clearInterval(t)
  }, [playing, speed, days])

  const fleet = useApi(`/api/fleet?day=${day}&policy=${policy}`)
  const open = (a) => { setSel(a); setView('twin') }
  const common = { day, policy, setPolicy, fleet, sel, setSel, open, theme }

  return (
    <div className="app">
      <TopBar view={view} setView={setView} theme={theme} toggleTheme={toggleTheme} />
      <div className="body">
        {view === 'fleet' && <FleetView {...common} setView={setView} />}
        {view === 'twin' && <TwinView {...common} />}
        {view === 'results' && <ResultsView day={day} policy={policy} open={open} />}
        {view !== 'results' && <Dock day={day} days={days} setDay={setDay} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />}
      </div>
    </div>
  )
}
