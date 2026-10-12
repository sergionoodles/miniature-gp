import { temperatureLabel, type RaceStatusDisplay } from './raceHud'

export type RaceWeather = {
  symbol: string
  label: string
  airTemperature: number | null
  trackTemperature: number | null
}

type Props = {
  status: RaceStatusDisplay
  weather: RaceWeather
}

// Track status leads, with its reason underneath; the weather follows on its own row.
export function RaceConditions({ status, weather }: Props) {
  const { airTemperature, trackTemperature } = weather

  return (
    <div className="race-conditions">
      <div className={`condition-status tone-${status.tone}`} role="status" aria-live="polite">
        <i className="tone-swatch" aria-hidden="true" />
        <strong>{status.label}</strong>
        {status.detail && <span>{status.detail}</span>}
      </div>
      <div className="condition-weather">
        <span className="weather-symbol" aria-hidden="true">{weather.symbol}</span>
        <span className="weather-label">{weather.label}</span>
        {airTemperature !== null && <span className="weather-reading"><small>Air</small>{temperatureLabel(airTemperature)}</span>}
        {trackTemperature !== null && <span className="weather-reading"><small>Track</small>{temperatureLabel(trackTemperature)}</span>}
      </div>
    </div>
  )
}
