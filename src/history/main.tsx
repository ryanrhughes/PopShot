import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HistoryPage } from './HistoryPage'
import './history.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HistoryPage />
  </StrictMode>
)
