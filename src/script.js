import { bootstrap } from './app/bootstrap.js'

const canvas = document.querySelector('canvas.webgl')
if (canvas) {
    bootstrap(canvas)
}
