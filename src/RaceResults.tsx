import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderPodiumCars } from './podiumCars'
import { formatGap, gapLabel, type RaceResult } from './raceResults'

type Props = { results: RaceResult[]; grandPrix: string; location: string; year: string; nextRaceLocation: string | null; onNextRace: () => void; onClose: () => void }

const PODIUM_SIZE = 3
const MEDALS = ['gold', 'silver', 'bronze']
const CONFETTI_PIECES = 36
const MEDAL_GOLD = '#f4c04e'

function Medal({ position }: { position: number }) {
  return <svg className={`podium-medal ${MEDALS[position - 1]}`} viewBox="0 0 48 72" aria-hidden="true">
    <path d="M8 0h12l10 30H18z" className="medal-ribbon" />
    <path d="M40 0H28L18 30h12z" className="medal-ribbon" />
    <circle cx="24" cy="48" r="19" className="medal-rim" />
    <circle cx="24" cy="48" r="14" className="medal-face" />
    <ellipse cx="18" cy="41" rx="6" ry="3.5" fill="#fff" opacity=".35" />
    <text x="24" y="54" className="medal-numeral">{position}</text>
  </svg>
}

// A burst of paper in the podium teams' colours, falling once when the results open.
function Confetti({ colors }: { colors: string[] }) {
  return <div className="results-confetti" aria-hidden="true">
    {Array.from({ length: CONFETTI_PIECES }, (_, index) => <i key={index} style={{
      '--confetti-left': `${(index * 37) % 100}%`,
      '--confetti-delay': `${(index % 9) * 0.11}s`,
      '--confetti-drift': `${((index * 53) % 120) - 60}px`,
      '--confetti-spin': `${360 + (index * 97) % 540}deg`,
      background: colors[index % colors.length],
    } as React.CSSProperties} />)}
  </div>
}

function GridChange({ result }: { result: RaceResult }) {
  if (result.grid === null) return <span className="grid-change">–</span>
  const gained = result.grid - result.position
  const label = `Started P${result.grid}`
  if (!gained) return <span className="grid-change" title={label}>–</span>
  return <span className={`grid-change ${gained > 0 ? 'gained' : 'lost'}`} title={label} aria-label={`${label}, ${gained > 0 ? 'gained' : 'lost'} ${Math.abs(gained)}`}>
    {gained > 0 ? '▲' : '▼'}{Math.abs(gained)}
  </span>
}

export function RaceResults({ results, grandPrix, location, year, nextRaceLocation, onNextRace, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const podium = results.slice(0, PODIUM_SIZE)
  const [carImages, setCarImages] = useState<string[]>([])
  const slowestGap = Math.max(...results.map((result) => result.gap ?? 0))

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // No close() on cleanup: unmounting removes the dialog from the top layer anyway, and closing
    // here made StrictMode's effect replay close and reopen it, restarting the entrance.
    if (!dialog.open) dialog.showModal()
    // showModal focuses the first control (the close button), so the main action is focused after it.
    primaryRef.current?.focus()
  }, [])

  useEffect(() => {
    try {
      setCarImages(renderPodiumCars(results.slice(0, PODIUM_SIZE).map((result) => result.driver)))
    } catch (cause) {
      console.error('The podium cars could not be rendered:', cause)
    }
  }, [results])

  return <dialog className="race-results" ref={dialogRef} aria-labelledby="race-results-title" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="results-stage" style={{ '--winner-color': podium[0]?.driver.color ?? MEDAL_GOLD } as React.CSSProperties}>
      <div className="results-flag" aria-hidden="true" />
      <div className="results-card">
        <div className="results-top">
          <header className="results-header">
            <div>
              <p>{grandPrix} {year}</p>
              <h2 id="race-results-title">{location}</h2>
            </div>
            <button type="button" className="results-close" aria-label="Close results" onClick={onClose}>×</button>
          </header>
          <ol className="podium" aria-label="Podium">
            {podium.map((result) => <li className={`podium-step p${result.position}`} key={result.driver.number} style={{ '--team-color': result.driver.color } as React.CSSProperties}>
              <Medal position={result.position} />
              <span className="podium-driver"><strong>{result.driver.name}</strong><small>{result.driver.team}</small></span>
              <span className="podium-car">
                {carImages[result.position - 1] && <img src={carImages[result.position - 1]} alt={`${result.driver.team} car number ${result.driver.number}`} />}
              </span>
              <div className="podium-block">
                <span className="podium-numeral" aria-hidden="true">{result.position}</span>
                <span className="podium-gap">{gapLabel(result)}</span>
              </div>
            </li>)}
          </ol>
        </div>
        <div className="results-table-wrap">
          <table className="results-table">
            <thead>
              <tr><th scope="col">Pos</th><th scope="col">Driver</th><th scope="col">Grid</th><th scope="col" className="results-time">Gap</th><th scope="col" className="results-time">Interval</th><th scope="col" className="gap-bar-cell"><span className="sr-only">Gap to the winner</span></th></tr>
            </thead>
            <tbody>
              {results.map((result) => <tr key={result.driver.number} className={result.status}>
                <td className="results-position">{result.position}</td>
                <th scope="row">
                  <span className="results-driver">
                    <span className="team-marker" style={{ backgroundColor: result.driver.color }} />
                    <span className="driver-code">{result.driver.code}</span>
                    <span className="results-name">{result.driver.name}<small>{result.driver.team}</small></span>
                  </span>
                </th>
                <td><GridChange result={result} /></td>
                <td className="results-time">{gapLabel(result)}</td>
                <td className="results-time">{result.interval === null ? '–' : formatGap(result.interval)}</td>
                <td className="gap-bar-cell" aria-hidden="true">
                  {result.status !== 'retired' && <span className="gap-bar"><i style={{
                    width: result.status === 'lapped' || !slowestGap ? '100%' : `${Math.max(2, (result.gap ?? 0) / slowestGap * 100)}%`,
                    backgroundColor: result.driver.color,
                  }} /></span>}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="results-actions">
          <p className="results-note">Gaps are measured as the winner takes the chequered flag.</p>
          <button type="button" ref={nextRaceLocation ? undefined : primaryRef} onClick={onClose}>Back to the circuit</button>
          {nextRaceLocation && <button type="button" className="results-primary" ref={primaryRef} onClick={onNextRace}>Next race <small>{nextRaceLocation}</small></button>}
        </footer>
      </div>
      <Confetti colors={[...podium.map((result) => result.driver.color), MEDAL_GOLD]} />
    </div>
  </dialog>
}
