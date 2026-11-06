/* Generated from packages/vag-platform-sdk. Do not edit; run pnpm run build. */
import type { FpsStats } from './contracts.js'
import type { PlatformSdk, PlatformStateSync } from './types.js'

const HOST_REQUIRED = 'PlatformClient.rooms is unavailable: multiplayer needs a host runtime (published bundle or builder preview)'
const STATE_SYNC_HOST_REQUIRED = '联机需要通过 Game Builder 预览或平台宿主运行'

function createHostlessStateSync(): PlatformStateSync {
  class OnlineRoomSession {
    constructor(_options: object = {}) {}
    async createRoom(): Promise<{ roomId: string }> { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    async joinRoom(): Promise<void> { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    async connect(): Promise<void> { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    async restoreCurrentRoom(): Promise<null> { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    async listRooms(): Promise<never[]> { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    async peekCurrentRoom(): Promise<null> { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    startGame(): void { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    sendAction(): void { throw new Error(STATE_SYNC_HOST_REQUIRED) }
    subscribeEvents(): () => void { return () => {} }
    setEvents(): () => void { return () => {} }
    getSeatDisplayName(_index: number, fallback = '等待加入...'): string { return fallback }
    isRoomOwner(): boolean { return false }
    disconnect(): void {}
    getPlayerId(): string { return '' }
    roomId = ''
    isHost = false
  }
  class PlatformStateSyncClient extends OnlineRoomSession {}
  class OccupiedSeatError extends Error {
    roomId: string
    code: string
    gameStatus?: string
    constructor(message: string, seat: { roomId: string; code?: string; gameStatus?: string }) {
      super(message)
      this.name = 'OccupiedSeatError'
      this.roomId = seat.roomId
      this.code = seat.code ?? 'ROOM_ALREADY_EXISTS'
      this.gameStatus = seat.gameStatus
    }
  }
  return {
    OnlineRoomSession: OnlineRoomSession as PlatformStateSync['OnlineRoomSession'],
    PlatformStateSyncClient: PlatformStateSyncClient as PlatformStateSync['PlatformStateSyncClient'],
    OccupiedSeatError: OccupiedSeatError as PlatformStateSync['OccupiedSeatError'],
    createOnlineClient: () => new OnlineRoomSession(),
    createGameClient: () => new OnlineRoomSession(),
    occupiedSeatFromError: () => { throw new Error(STATE_SYNC_HOST_REQUIRED) },
    isOccupancyError: () => false,
  }
}
const memoryStore = new Map<string, string>()

function readStore(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const item = localStorage.getItem(key)
      if (item !== null) return item
    }
  } catch { /* ignore quota / missing storage */ }
  return memoryStore.get(key) ?? null
}

function writeStore(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
      return
    }
  } catch { /* ignore quota / missing storage */ }
  memoryStore.set(key, value)
}

export const devStub: PlatformSdk = {
  __runtime: true,
  async initialize() {},
  game: {
    loading() {},
    loaded() {},
  },
  lifecycle: {
    register() { return () => {} },
  },
  user: {
    async getCurrent() {
      return { id: 'anonymous', name: 'Anonymous Player' }
    },
  },
  storage: {
    async get(key) {
      try {
        const item = readStore(`__vag_cloud_data_${key}`)
        if (item !== null) return JSON.parse(item)
      } catch { /* ignore */ }
      return null
    },
    async set(key, value) {
      writeStore(`__vag_cloud_data_${key}`, JSON.stringify(value))
    },
  },
  rooms: {
    isAvailable: () => false,
    list: async () => { throw new Error(HOST_REQUIRED) },
    get: async () => { throw new Error(HOST_REQUIRED) },
    create: async () => { throw new Error(HOST_REQUIRED) },
    join: async () => { throw new Error(HOST_REQUIRED) },
    leave: async () => { throw new Error(HOST_REQUIRED) },
    destroy: async () => { throw new Error(HOST_REQUIRED) },
    connect: async () => { throw new Error(HOST_REQUIRED) },
    handleErrors() {},
    hostShowsPlatformErrors: () => false,
  },
  stateSync: createHostlessStateSync(),
  studio: {
    log(level, message, detail) {
      console[level](message, detail)
    },
  },
  fps: {
    start() {},
    stop() {},
    getStats(): FpsStats | null { return null },
  },
  async whenGameApiReady() {},
}
