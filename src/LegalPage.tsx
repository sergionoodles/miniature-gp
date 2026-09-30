import { useEffect } from 'react'
import { AppFooter } from './AppFooter'
import { PrivacyContent, TermsContent } from './LegalContent'
import type { LegalPageName } from './legalRoutes'

const LEGAL_UPDATED_DATE = '2026-09-30'
const LEGAL_UPDATED_LABEL = '30 September 2026'

export function LegalPage({ page }: { page: LegalPageName }) {
  const title = page === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'

  useEffect(() => {
    document.title = `${title} | Miniature GP`
  }, [title])

  return (
    <div className="legal-shell">
      <header className="legal-header">
        <a href="/" className="legal-brand">Miniature GP</a>
        <a href="/">Back to replays</a>
      </header>
      <main className="legal-document">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated <time dateTime={LEGAL_UPDATED_DATE}>{LEGAL_UPDATED_LABEL}</time></p>
        {page === 'terms' ? <TermsContent /> : <PrivacyContent />}
      </main>
      <AppFooter />
    </div>
  )
}
