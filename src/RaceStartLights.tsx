export const START_LIGHT_COUNT = 5
export const START_LIGHT_INTERVAL = 1000

export function RaceStartLights({ countdown }: { countdown: number }) {
  const illuminatedLights = START_LIGHT_COUNT + 1 - countdown

  return <div className="race-start-countdown" role="status" aria-live="polite" aria-label={`${illuminatedLights} of ${START_LIGHT_COUNT} red lights on`}>
    <span>REPLAY START</span>
    <div className="start-lights" aria-hidden="true">
      {Array.from({ length: START_LIGHT_COUNT }, (_, index) => <i
        key={index}
        className={index < illuminatedLights ? 'illuminated' : undefined}
      />)}
    </div>
  </div>
}
