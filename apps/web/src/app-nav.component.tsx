import { Icon } from './icons.js'

export function AppNav(props: { current: 'workbench' | 'console' | 'proof' }) {
  return (
    <nav className="app-nav" aria-label="Main">
      <a href="#/" aria-current={props.current === 'workbench' ? 'page' : undefined}>
        <Icon name="workbench" /> Workbench
      </a>
      <a href="#/console" aria-current={props.current === 'console' ? 'page' : undefined}>
        <Icon name="console" /> Console
      </a>
      <a href="#/proof" aria-current={props.current === 'proof' ? 'page' : undefined}>
        <Icon name="proof" /> Proof
      </a>
    </nav>
  )
}
