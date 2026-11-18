import { bootstrap } from './app/bootstrap.js'
import { currentModeFromHash } from './utils/mode.js'

const canvas = document.querySelector('canvas.webgl')
if (canvas) {
  bootstrap(canvas)
}

// The explorer and sandbox experiences boot as separate hosts; flipping the
// mode hash reloads so the new host takes over cleanly.
const initialMode = currentModeFromHash()
window.addEventListener('hashchange', () => {
  if (currentModeFromHash() !== initialMode) {
    window.location.reload()
  }
})

// Register the service worker for PWA / offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('[PWA] Service worker registration failed:', err)
        })
    })
}
