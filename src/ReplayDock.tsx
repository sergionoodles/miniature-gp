import { clockLabel } from './replay'
import { SKIP_SECONDS } from './replayShortcuts'

type Props = {
  time: number
  // Null until a replay has loaded, which disables every control.
  duration: number | null
  isPlaying: boolean
  isCountingDown: boolean
  speed: number
  speeds: number[]
  onTogglePlayback: () => void
  onSkip: (seconds: number) => void
  onSeek: (time: number) => void
  onSpeedChange: (speed: number) => void
}

function SkipIcon({ direction }: { direction: 'back' | 'forward' }) {
  return (
    <svg className={`skip-icon ${direction}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 9a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707l6.94 6.94a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z" />
      <path d="M20 9v6" />
    </svg>
  )
}

export function ReplayDock({ time, duration, isPlaying, isCountingDown, speed, speeds, onTogglePlayback, onSkip, onSeek, onSpeedChange }: Props) {
  const isDisabled = duration === null
  const progress = duration ? time / duration * 100 : 0
  const isRunning = isPlaying || isCountingDown
  const playLabel = isCountingDown ? 'Cancel race start' : isPlaying ? 'Pause replay' : 'Play replay'

  return (
    <footer className="replay-dock">
      <div className="dock-transport">
        <button className="dock-skip" type="button" disabled={isDisabled} onClick={() => onSkip(-SKIP_SECONDS)} aria-label="Back 1 minute" title="Back 1 minute (←)"><SkipIcon direction="back" /></button>
        <button className="dock-play" type="button" disabled={isDisabled} onClick={onTogglePlayback} aria-label={playLabel}>
          <span className={isRunning ? 'pause-icon' : 'play-icon'} />
        </button>
        <button className="dock-skip" type="button" disabled={isDisabled} onClick={() => onSkip(SKIP_SECONDS)} aria-label="Forward 1 minute" title="Forward 1 minute (→)"><SkipIcon direction="forward" /></button>
      </div>
      <span className="dock-time">{clockLabel(time)}</span>
      <input
        className="timeline"
        type="range"
        aria-label="Replay position"
        aria-valuetext={clockLabel(time)}
        min="0"
        max={duration ?? 1}
        step="0.1"
        value={time}
        disabled={isDisabled}
        onChange={(event) => onSeek(Number(event.target.value))}
        style={{ '--progress': `${progress}%` } as React.CSSProperties}
      />
      <span className="dock-time is-total">{clockLabel(duration ?? 0)}</span>
      <select className="dock-speed" aria-label="Replay speed" title="Replay speed" value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))}>
        {speeds.map((value) => <option value={value} key={value}>{value}×</option>)}
      </select>
    </footer>
  )
}
