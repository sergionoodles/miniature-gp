import type { ReactNode } from 'react'
import { RaceConditions, type RaceWeather } from './RaceConditions'
import type { RaceStatusDisplay } from './raceHud'

type Props = {
  location: string
  grandPrix: string
  dateLabel: string
  lap: number
  totalLaps: number
  orderTitle: string
  // Null while the replay loads or when the race has no data.
  conditions: { status: RaceStatusDisplay; weather: RaceWeather } | null
  isOrderOpen: boolean
  onOpenOrder: () => void
  // The running order, which becomes a drawer on phones.
  children: ReactNode
}

export function TimingTower({ location, grandPrix, dateLabel, lap, totalLaps, orderTitle, conditions, isOrderOpen, onOpenOrder, children }: Props) {
  const progress = Math.min(1, lap / Math.max(1, totalLaps))

  return (
    <aside className="timing-tower" aria-label="Race and running order">
      <div className="race-title">
        {/* The name's length sets its size, so every circuit fits on one line. */}
        <h1 style={{ '--name-length': location.length } as React.CSSProperties}>{location}</h1>
        <p>{grandPrix} · {dateLabel}</p>
      </div>

      {conditions && <RaceConditions status={conditions.status} weather={conditions.weather} />}

      <div className="lap-counter" role="group" aria-label={`Lap ${lap} of ${totalLaps}`}>
        <span className="lap-title" aria-hidden="true">{orderTitle}</span>
        <span className="lap-value" aria-hidden="true"><small>Lap</small><b>{lap}</b>/{totalLaps}</span>
        <span className="lap-progress" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></span>
      </div>

      <button className="order-toggle" type="button" aria-controls="running-order" aria-expanded={isOrderOpen} aria-label="Open running order" onClick={onOpenOrder}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
      </button>

      {children}
    </aside>
  )
}
