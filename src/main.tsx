import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './components/parameterSlider.css'
import './components/toggle.css'
import './components/panelMorph.css'
import './components/panelTheme.css'

const DevAgentation = import.meta.env.DEV
  ? React.lazy(() => import('agentation').then(({ Agentation }) => ({ default: Agentation })))
  : null

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {DevAgentation && <React.Suspense fallback={null}><DevAgentation /></React.Suspense>}
  </React.StrictMode>,
)
