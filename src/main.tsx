import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { appendAnalyticsScript } from './analytics'
import { LegalPage } from './LegalPage'
import { resolveLegalPage } from './legalRoutes'
import './styles.css'
import './hud.css'
import './embed.css'

const UMAMI_WEBSITE_ID = '6fbaf2d2-eb38-42b0-b041-298c4e0d1bd6'

appendAnalyticsScript({
  isProduction: import.meta.env.PROD,
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID ?? UMAMI_WEBSITE_ID,
})

const root = document.getElementById('root')
if (!root) throw new Error('Application root is missing')

const legalPage = resolveLegalPage(window.location.pathname)

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {legalPage ? <LegalPage page={legalPage} /> : <App />}
  </React.StrictMode>,
)
