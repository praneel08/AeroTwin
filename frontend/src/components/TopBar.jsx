const TABS = [['fleet', 'Fleet'], ['twin', 'Aircraft twin'], ['results', 'Results']]

const Sun = () => <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="3.6" /><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M15.3 4.7L14 6M6 14l-1.3 1.3" /></svg>
const Moon = () => <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M16.5 11.6A6.8 6.8 0 0 1 8.4 3.5a6.8 6.8 0 1 0 8.1 8.1z" /></svg>

export default function TopBar({ view, setView, theme, toggleTheme }) {
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor"><path d="M16 3l3.4 10 9.1 4.4v2.6l-9-1.7L18.6 25l3.4 2.4V30L16 28.4 10 30v-2.600l3.400-2.400-.9-6.700-9 1.700v-2.600L12.600 13z" /></svg>
        AeroTwin
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} className="tab" role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}</button>)}
      </nav>
      <div className="right">
        <span className="note-chip" title="Engine wear is real NASA C-MAPSS data. The fleet, workshops, spare engines and repair notes are simulated.">
          <span className="dot" style={{ '--c': 'var(--accent)' }} />Simulated fleet · real engine data
        </span>
        <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title="Toggle theme">
          {theme === 'light' ? <Moon /> : <Sun />}
        </button>
      </div>
    </header>
  )
}
