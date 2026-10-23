import type { ReactNode } from 'react'
import { type PlaybackSpeed, playbackSpeeds } from '../playback'

const play = (x: number) => <path key={x} d={`M${x} 5 L${x + 7} 10 L${x} 15 Z`} />

/** One play arrow per step of speed, and a lightning bolt for real time. */
const icons: Record<PlaybackSpeed, ReactNode> = {
  slow: [play(6)],
  medium: [play(3), play(10)],
  fast: [play(0), play(7), play(14)],
  realtime: <path d="M12 1 L4 11 H10 L8 19 L16 8 H10 Z" />,
}

interface Props {
  speed: PlaybackSpeed
  onChange(speed: PlaybackSpeed): void
}

/** How fast the rule graph replays what follows an action, slowest on the left. */
export function PlaybackControl({ speed, onChange }: Props) {
  return (
    <section className="playback-control">
      <h2>Playback speed</h2>
      <div className="segmented">
        {playbackSpeeds.map(([value, label]) => (
          <button
            type="button"
            key={value}
            title={label}
            aria-label={label}
            aria-pressed={speed === value}
            className={speed === value ? 'active' : ''}
            onClick={() => onChange(value)}
          >
            <svg viewBox="0 0 21 20" width="21" height="20" fill="currentColor" aria-hidden="true">
              {icons[value]}
            </svg>
          </button>
        ))}
      </div>
    </section>
  )
}
