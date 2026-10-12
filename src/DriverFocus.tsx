import { UNKNOWN_POSITION, type OrderedDriver } from './RunningOrder'

export type DriverTracking = 'tracked' | 'stopped' | 'missing'

type Props = {
  driver: OrderedDriver
  tracking: DriverTracking
  onLocate: () => void
  onClose: () => void
}

const TRACKING_NOTES: Record<Exclude<DriverTracking, 'tracked'>, string> = {
  stopped: 'Stopped · inferred from telemetry',
  missing: 'No location at this point',
}

export function DriverFocus({ driver, tracking, onLocate, onClose }: Props) {
  const position = driver.position === UNKNOWN_POSITION ? '–' : driver.position

  return (
    <section className="driver-focus" aria-label="Driver in focus" style={{ '--team-color': driver.color } as React.CSSProperties}>
      <span className="focus-position" aria-label={`Position ${position}`}>P{position}</span>
      <div className="focus-identity">
        <strong>{driver.name}</strong>
        <span>{driver.team} · #{driver.number} · Lap {driver.lap}</span>
      </div>
      <button className="focus-close" type="button" aria-label="Clear driver selection" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      {tracking === 'tracked'
        ? <button className="focus-locate" type="button" onClick={onLocate}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></svg>
          Locate on track
        </button>
        : <p className="focus-note">{TRACKING_NOTES[tracking]}</p>}
    </section>
  )
}
