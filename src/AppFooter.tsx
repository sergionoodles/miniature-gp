import { version } from '../package.json'

export function AppFooter({ showTelemetry = false }: { showTelemetry?: boolean }) {
  return (
    <footer className="app-footer">
      <div className="footer-attribution">
        <span className="footer-brand">Miniature GP <span className="app-version">v{version}</span><span aria-hidden="true"> · </span></span>
        <span>© 2026 Coding Noodles SRLS</span>
      </div>
      <div className="footer-sources">
        <nav className="footer-legal-links" aria-label="Legal">
          <a href="/terms" aria-label="Terms and Conditions">Terms</a>
          <a href="/privacy" aria-label="Privacy Policy">Privacy</a>
        </nav>
        {showTelemetry && (
          <span className="telemetry-credits">
            <span aria-hidden="true"> · </span>
            Race telemetry by <a href="https://openf1.org/" target="_blank" rel="noreferrer">OpenF1</a>
          </span>
        )}
      </div>
    </footer>
  )
}
