/** Paths of the few common icons the console uses, drawn on a 16-pixel grid in the text colour. */
const paths = {
  close: 'M4 4l8 8M12 4l-8 8',
  reset: 'M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5',
  add: 'M8 3v10M3 8h10',
  skip: 'M3 3.5l6 4.5-6 4.5zM12.5 3.5v9',
  forward: 'M3 8h10M8 3l5 5-5 5',
} as const

export type IconName = keyof typeof paths

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
