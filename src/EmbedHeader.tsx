import type { RaceStatusDisplay } from './raceHud'

type Props = {
  location: string
  grandPrix: string
  year: number
  lap: number
  totalLaps: number
  status: RaceStatusDisplay | null
  replayPath: string
}

export function EmbedHeader({ location, grandPrix, year, lap, totalLaps, status, replayPath }: Props) {
  return <header className="embed-header">
    <div className="embed-header-identity">
      <a className="embed-brand" href={replayPath} target="_blank" rel="noopener noreferrer" aria-label="Open full replay on Miniature GP" title="Open full replay on Miniature GP">
        <img src="/logo.svg" alt="Miniature GP" />
      </a>
      <div className="embed-race-title">
        <h1>{location} <span>{year}</span></h1>
        <p title={grandPrix}>{grandPrix}</p>
      </div>
    </div>
    {status && <span className={`embed-status tone-${status.tone}`} title={status.label}><i aria-hidden="true" />{status.label}</span>}
    <div className="embed-header-progress">
      <span className="embed-lap" aria-label={`Lap ${lap} of ${totalLaps}`}><small>Lap</small> <b>{lap}</b><span>/{totalLaps}</span></span>
      <a className="embed-open" href={replayPath} target="_blank" rel="noopener noreferrer" aria-label="Open full replay" title="Open full replay">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></svg>
      </a>
    </div>
  </header>
}
