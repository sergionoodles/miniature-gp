import type { ReactNode } from 'react'
import type { Driver } from './replay'

export type OrderedDriver = Driver & { position: number; lap: number }

export const UNKNOWN_POSITION = 99

type Props = {
  title: string
  drivers: OrderedDriver[]
  selectedDriver: number | null
  stoppedDrivers: Set<number>
  isOpen: boolean
  onHover: (driver: number | null) => void
  onSelect: (driver: number | null) => void
  onClose: () => void
  // Loading and error messages shown in place of the list.
  children?: ReactNode
}

const positionLabel = (position: number) => position === UNKNOWN_POSITION ? '–' : String(position)

function driverDescription(driver: OrderedDriver, isStopped: boolean) {
  const position = driver.position === UNKNOWN_POSITION ? 'position unavailable' : `position ${driver.position}`
  const stopped = isStopped ? ', stopped car inferred from telemetry' : ''
  return `Highlight ${driver.name}, ${position}, ${driver.team}, number ${driver.number}${stopped}`
}

export function RunningOrder({ title, drivers, selectedDriver, stoppedDrivers, isOpen, onHover, onSelect, onClose, children }: Props) {
  return <>
    <section id="running-order" className={`running-order${isOpen ? ' is-open' : ''}`}>
      <div className="order-heading">
        <h2 className="order-title">{title}</h2>
        <button className="order-close" type="button" aria-label="Close running order" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="order-list" role="region" tabIndex={0} aria-label={title}>
        {drivers.map((driver) => {
          const isSelected = selectedDriver === driver.number
          const isStopped = stoppedDrivers.has(driver.number)
          return (
            <button
              type="button"
              className={`order-row${isSelected ? ' is-selected' : ''}`}
              key={driver.number}
              style={{ '--team-color': driver.color } as React.CSSProperties}
              aria-pressed={isSelected}
              aria-label={driverDescription(driver, isStopped)}
              onPointerEnter={(event) => { if (event.pointerType === 'mouse') onHover(driver.number) }}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(driver.number)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(isSelected ? null : driver.number)}
            >
              <span className="order-position">{positionLabel(driver.position)}</span>
              <span className="order-team" />
              <span className="order-code">{driver.code}</span>
              <span className="order-name">{driver.name}</span>
              {isStopped
                ? <span className="stopped-icon" role="img" aria-label="Stopped car inferred from telemetry" title="Stopped car inferred from telemetry" />
                : <span className="order-number">{driver.number}</span>}
            </button>
          )
        })}
        {children}
      </div>
      <p className="order-footer">
        <span>Select a driver to follow</span>
        <a href="https://openf1.org/" target="_blank" rel="noreferrer" aria-label="Recorded telemetry by OpenF1"><span className="openf1-open">Open</span><span className="openf1-f1">F1</span></a>
      </p>
    </section>
    {isOpen && <button className="order-backdrop" type="button" aria-label="Close running order" onClick={onClose} />}
  </>
}
