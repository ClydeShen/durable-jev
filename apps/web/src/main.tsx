import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.page.js'
import './styles.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
