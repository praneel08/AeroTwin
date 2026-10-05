import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import './styles.css'
import { applyTheme, initialTheme } from './theme'
import App from './App'

applyTheme(initialTheme()) // set before first paint, so there is no flash of the wrong theme
createRoot(document.getElementById('root')).render(<App />)
