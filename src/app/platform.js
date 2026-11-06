import { game, initialize, lifecycle } from 'zaohua-platform-sdk'

/**
 * Connects the running experience to the platform host.
 * Loading is reported around the real startup, and pause freezes the flight.
 * @param {import('./Experience.js').default} experience
 */
export async function attachPlatform(experience) {
  await initialize({
    capabilities: ['game.lifecycle', 'game.loading'],
  })

  experience._unregisterPlatform = lifecycle.register({
    pause() {
      experience.setPlatformPaused(true)
    },
    resume() {
      experience.setPlatformPaused(false)
    },
    getState() {
      return { paused: experience.isSimulationPaused() }
    },
  })

  return {
    reportLoading() {
      game.loading()
    },
    reportLoaded() {
      game.loaded()
    },
  }
}
