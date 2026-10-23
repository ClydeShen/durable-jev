import type { PlaybackStep } from '../playback'
import type { FeedItem } from '../use-event-feed'

const icons: Record<PlaybackStep['tone'], string> = {
  task: '✋',
  rule: '↻',
  invalidated: '⚠',
  info: '➜',
}

interface Props {
  items: readonly FeedItem[]
  /** Moves the feed left when a drawer covers the right side. */
  besideDrawer: boolean
  onShowRule(ruleId: string): void
}

/** The stacked notifications of the event feed; one about a single rule opens that rule. */
export function EventFeed({ items, besideDrawer, onShowRule }: Props) {
  return (
    <ol
      className={besideDrawer ? 'event-feed beside-drawer' : 'event-feed'}
      aria-live="polite"
      aria-label="事件通知"
    >
      {items.map(({ key, step }) => {
        const ruleId = step.ruleIds.length === 1 ? step.ruleIds[0] : undefined
        const content = (
          <>
            <span className="feed-icon" aria-hidden="true">
              {icons[step.tone]}
            </span>
            <span>{step.text}</span>
          </>
        )
        return (
          <li key={key} className={`feed-item ${step.tone}`}>
            {ruleId ? (
              <button type="button" className="feed-link" onClick={() => onShowRule(ruleId)}>
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ol>
  )
}
