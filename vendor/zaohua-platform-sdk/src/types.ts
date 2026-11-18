/* Generated from packages/vag-platform-sdk. Do not edit; run pnpm run build. */
import type { Capability, FpsStats } from './contracts.js'

export type User = { id: string; name: string; avatar?: string }
export type LifecycleState = { paused: boolean }
export type LifecycleAdapter = {
  pause(): void | Promise<void>
  resume(): void | Promise<void>
  getState(): LifecycleState
}
export type StudioLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type InitializeOptions = { capabilities: readonly Capability[] }

export type FpsOptions = {
  intervalMs?: number
  onStats?: (stats: FpsStats) => void
}

export type FpsApi = {
  start(options?: FpsOptions): void
  stop(): void
  getStats(): FpsStats | null
}

export type RoomRpcError = Error & {
  error_code?: string
  code?: string | number
  status?: number
  reason_code?: string
  room_id?: string
  room_code?: string
}

export type RoomInfo = {
  id: string
  name: string
  gameStatus?: string
  ownerId?: string
  maxPlayers?: number
  playerIds?: string[]
  players?: unknown[]
  createdAt: number
  room_code?: string
  room_id?: string
  metadata?: Record<string, unknown>
  memberCount?: number
  playerCount?: number
}

export type RoomConnection = {
  connect(options?: { join?: boolean | string; playerName?: string; roomId?: string; isHost?: boolean; roomJwt?: string }): Promise<void>
  join(playerName?: string): void
  startGame(): void
  sendAction(input: unknown): void
  sendBinary(value: ArrayBuffer | ArrayBufferView): void
  onBinaryMessage(listener: (payload: Uint8Array) => void): () => void
  getPlayerId(): string
  disconnect(): void
  on(type: string, listener: (payload: any) => void): () => void
  getPlayers?(): any[]
  getSeatPlayer?(index: number): any
  getSeatDisplayName?(index: number, fallback?: string): string
  isRoomOwner?(): boolean
  subscribeEvents?(handlers: unknown): () => void
  setEvents?(handlers: unknown): () => void
}

export type RoomCreateResult = {
  room: RoomInfo
  created: boolean
  connection?: RoomConnection
  token?: string
}

export type RoomJoinResult = {
  room: RoomInfo
  connection: RoomConnection
}

export type RoomListResult = {
  rooms: RoomInfo[]
  total: number
  page: number
  pageSize: number
  currentRoom?: unknown
}

export type RoomDirectory = {
  isAvailable(): boolean
  list(options?: Record<string, unknown>): Promise<RoomInfo[] | RoomListResult>
  get(roomId: string): Promise<RoomInfo>
  create(options?: Record<string, unknown>): Promise<RoomCreateResult | RoomInfo>
  join(roomId: string, options?: Record<string, unknown>): Promise<RoomJoinResult>
  leave(roomId: string): Promise<unknown>
  destroy(roomId: string): Promise<unknown>
  connect(roomId: string, options?: { playerName?: string }): Promise<RoomConnection>
  handleErrors(codes: string[] | '*'): void
  hostShowsPlatformErrors(): boolean
}

export type PlatformStateSync = {
  OnlineRoomSession: new (options?: { minPlayersToStart?: number; roomClient?: RoomConnection }) => {
    createRoom(options?: Record<string, unknown>): Promise<{ roomId: string }>
    joinRoom(roomId: string, options?: Record<string, unknown>): Promise<void>
    restoreCurrentRoom(options?: { playerName?: string }): Promise<unknown>
    peekCurrentRoom(): Promise<unknown>
    listRooms(): Promise<unknown[]>
    connect(options?: Record<string, unknown>): Promise<void>
    startGame(): void
    sendAction(input: unknown): void
    subscribeEvents(handlers: unknown): () => void
    setEvents(handlers: unknown): () => void
    getSeatDisplayName(index: number, fallback?: string): string
    isRoomOwner(): boolean
    disconnect(): void
    getPlayerId(): string
    roomId: string
    isHost: boolean
  }
  PlatformStateSyncClient: new (options?: { applyPatch?: (state: unknown, patch: unknown) => unknown; minPlayersToStart?: number }) => unknown
  OccupiedSeatError: new (message: string, seat: { roomId: string; code?: string; gameStatus?: string }) => Error & { roomId: string; code: string; gameStatus?: string }
  createOnlineClient: (options?: { minPlayersToStart?: number }) => unknown
  createGameClient: () => unknown
  occupiedSeatFromError: (error: unknown) => { roomId: string; gameStatus?: string } | null
  isOccupancyError: (error: unknown) => boolean
}

export type PlatformSdk = {
  initialize(options: InitializeOptions): Promise<void>
  game: {
    loading(detail?: unknown): void
    loaded(): void
  }
  lifecycle: {
    register(adapter: LifecycleAdapter): () => void
  }
  user: {
    getCurrent(): Promise<User>
  }
  storage: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
  rooms: RoomDirectory
  stateSync: PlatformStateSync
  studio: {
    log(level: StudioLogLevel, message: string, detail?: unknown): void
  }
  fps: FpsApi
  whenGameApiReady(): Promise<unknown>
  __runtime: true
}

declare global {
  interface Window {
    PlatformClient?: PlatformSdk
    KubeeGameBridge?: { postMessage?: (message: string) => void }
    __vagReceiveFromHost?: (data: unknown) => void
    __ZAOHUA_OFFLINE_SESSION__?: string
    __zaohuaInitializeCalled?: boolean
    __zaohuaPlatformInitStarted?: boolean
  }
  var PlatformClient: PlatformSdk | undefined
  var PlatformServer: { stateSync?: { createRuntime: (options: unknown) => unknown } } | undefined
}
