import { bootstrap } from './app/bootstrap.js'

const canvas = document.querySelector('canvas.webgl')
if (canvas) {
    bootstrap(canvas)
}

// Register the service worker for PWA / offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('[PWA] Service worker registration failed:', err)
        })
    })
}
