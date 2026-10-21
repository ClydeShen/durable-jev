import {
  Activity,
  ArrowRight,
  Ban,
  Bot,
  Check,
  Circle,
  CircleCheck,
  CircleDot,
  CircleHelp,
  CirclePause,
  CircleX,
  Clock,
  Code,
  LayoutDashboard,
  Link2,
  ListChecks,
  Loader,
  Lock,
  type LucideIcon,
  Minus,
  PackageCheck,
  Play,
  Power,
  Radio,
  RefreshCw,
  Replace,
  RotateCcw,
  Search,
  Send,
  Server,
  ServerCrash,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  Truck,
  UserRound,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react'

// One place that decides which glyph means what. Screens name an icon; they never type a
// symbol character, so the look stays consistent and every icon can be swapped here.
const icons = {
  approve: Check,
  reject: X,
  failed: CircleX,
  waiting: UserRound,
  route: ArrowRight,
  reevaluate: RefreshCw,
  reset: RotateCcw,
  kill: Power,
  start: Play,
  slow: Timer,
  resend: Send,
  find: Search,
  expired: Clock,
  cancelled: Ban,
  superseded: Replace,
  pass: CircleCheck,
  unknown: CircleHelp,
  blocked: Lock,
  notApplicable: Minus,
  invalidated: RefreshCw,
  error: TriangleAlert,
  open: CircleDot,
  submitted: Send,
  evaluating: Loader,
  onHold: CirclePause,
  ready: PackageCheck,
  dispatched: Truck,
  technicalFailure: ServerCrash,
  // Console: what kind of thing an event is.
  console: Activity,
  workbench: LayoutDashboard,
  link: Link2,
  code: Code,
  jev: Sparkles,
  tool: Wrench,
  service: Server,
  agent: Bot,
  live: Radio,
  offline: WifiOff,
  guide: ListChecks,
  proof: ShieldCheck,
  todo: Circle,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof icons

export function Icon(props: { name: IconName; size?: number; label?: string }) {
  const Glyph = icons[props.name]
  return (
    <Glyph
      className="icon"
      size={props.size ?? 14}
      strokeWidth={2}
      {...(props.label ? { role: 'img', 'aria-label': props.label } : { 'aria-hidden': true })}
    />
  )
}

// Separator between facts in a line of text; drawn with CSS, not typed.
export function Dot() {
  return <span className="dot" aria-hidden="true" />
}

export function Route(props: { from: string; to: string }) {
  return (
    <span className="route">
      {props.from}
      <Icon name="route" size={12} label="to" />
      {props.to}
    </span>
  )
}

// Same idea for statuses: the icon is the second cue next to colour and text.
const statusIcons: Record<string, IconName> = {
  PASS: 'pass',
  FAIL: 'failed',
  UNKNOWN: 'unknown',
  NOT_APPLICABLE: 'notApplicable',
  ERROR: 'error',
  BLOCKED_DEPENDENCY: 'blocked',
  WAITING_HUMAN: 'waiting',
  INVALIDATED: 'invalidated',
  SUBMITTED: 'submitted',
  EVALUATING: 'evaluating',
  ON_HOLD: 'onHold',
  AWAITING_HUMAN: 'waiting',
  READY_TO_DISPATCH: 'ready',
  DISPATCHED: 'dispatched',
  REJECTED: 'failed',
  TECHNICAL_FAILURE: 'technicalFailure',
  OPEN: 'open',
  APPROVED: 'pass',
  COMPLETED: 'pass',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUPERSEDED: 'superseded',
}

export const iconForStatus = (status: string): IconName | undefined => statusIcons[status]
