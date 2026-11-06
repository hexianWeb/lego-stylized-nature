/* Generated from packages/vag-platform-sdk. Do not edit; run pnpm run build. */
export const CAPABILITIES = [
  'game.loading',
  'game.lifecycle',
  'user.current',
  'storage',
  'studio.logging',
  'game.multiplayer',
] as const

export type Capability = typeof CAPABILITIES[number]
export const REQUIRED_CAPABILITIES = [] as const satisfies readonly Capability[]

/**
 * Capabilities a game gets for free by declaring another one.
 *
 * Multiplayer bundles logging: desync, seat and room-lifecycle bugs only
 * reproduce with several clients in the same room, so a log trail is the only
 * way to reconstruct what each side saw.
 */
export const BUNDLED_CAPABILITIES: Readonly<Partial<Record<Capability, readonly Capability[]>>> = {
  'game.multiplayer': ['studio.logging'],
}


export const OFFLINE_PROTOCOL = 'zaohua-offline-v2' as const
export const CONTRACT_VERSION = 3 as const

export type ValidationState = 'pending' | 'passed' | 'failed'
export type ValidationTier = 'required' | 'optional'
export type UserVerdict = 'pending' | 'passed' | 'failed'
export type AutomationState = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
export type SupportedPlatform = 'pc' | 'mobile' | 'both'

export type PlatformSupport = {
  supportPC: boolean
  supportMobile: boolean
}

export type ReplayDescriptor =
  | { type: 'viewport'; presetId: string; width: number; height: number }
  | { type: 'lifecycle'; action: 'pause' | 'resume' }
  | { type: 'reload' }

export type AutomationStatus = {
  state: AutomationState
  completed: number
  total: number
  activeCheck?: string
  startedAt?: string
  completedAt?: string
  failure?: {
    code: string
    message: string
    infrastructure?: boolean
    replay?: ReplayDescriptor
    detail?: unknown
  }
}

export type PreviewAIMessageState = 'unread' | 'read' | 'ack' | 'mending' | 'fixed'

export type PreviewAIStatus = {
  state: 'idle' | PreviewAIMessageState
  batchId?: string
  message?: string
  updatedAt?: string
}

export type ValidationCheck = {
  id: string
  label: string
  tier: ValidationTier
  capability?: Capability
  manual: boolean
  dependencies: readonly string[]
  timeoutMs: number
  state: ValidationState
  message?: string
}

export type ExternalOptionalCapability = {
  id: string
  group: 'platform_extensions' | 'landing' | 'publishing'
  label: string
  purpose: string
  state: 'passed' | 'missing' | 'failed' | 'pending'
}

export type ValidationIssue = {
  code: string
  message: string
  tier?: ValidationTier
  detail?: unknown
  replay?: ReplayDescriptor
}

export type ValidationPlanMetadata = {
  id: string
  version: number
  platform: SupportedPlatform
  stepOrder: string[]
  digest: string
}

export type ValidationReport = {
  loadingConfirmation?: {
    requestedAt: string
    checkIds: string[]
    evidence?: Record<string, unknown>
    userObservation?: 'loading' | 'loaded' | 'stuck'
  }
  protocol: typeof OFFLINE_PROTOCOL
  contractVersion: typeof CONTRACT_VERSION
  sessionId: string
  capabilities: Capability[]
  state: ValidationState
  automation: AutomationStatus
  plan?: ValidationPlanMetadata
  /**
   * @deprecated Validation is fully automatic. This mirrors the aggregate
   * automatic result and no longer represents a user action.
   */
  userVerdict: UserVerdict
  checks: ValidationCheck[]
  issues: ValidationIssue[]
  layers?: {
    platform_handshake: 'passed' | 'failed' | 'pending' | 'unverified' | 'inapplicable'
    page_runtime: 'passed' | 'failed' | 'pending' | 'unverified' | 'inapplicable'
    playable: 'passed' | 'failed' | 'pending' | 'unverified' | 'inapplicable'
    multiplayer_evidence: 'passed' | 'failed' | 'pending' | 'unverified' | 'inapplicable'
  }
  adaptation: {
    required_passed: boolean
    optionals: Array<{
      id: string
      group: 'platform_extensions' | 'landing' | 'publishing'
      label: string
      purpose: string
      state: 'passed' | 'missing' | 'failed' | 'pending' | 'locked' | 'inapplicable'
    }>
  }
  multiplayer?: {
    backend: 'pending' | 'passed' | 'failed'
    seatSmoke?: 'passed' | 'policy_denied' | 'failed'
    matchSmoke?: 'passed' | 'no_response' | 'skipped'
    maxPlayers?: number
    note?: string
    observed: { roomsCalls: number; maxSeated: number; matchStarted: boolean }
  }
  updatedAt: string
}

export type OfflineEnvelope = {
  protocol: typeof OFFLINE_PROTOCOL
  contractVersion: typeof CONTRACT_VERSION
  sessionId: string
  type: string
  requestId?: string
  payload?: unknown
}

export type FpsStats = {
  fps: number
  avg: number
  min: number
  max: number
  frameTimeMs: number
  timestamp: number
}

export type TelemetryEventHandler = (event: OfflineEnvelope) => void



export const VAG_MESSAGE = {
  CLIENT_INIT: 'VAG_CLIENT_INIT',
  CLIENT_INIT_ACK: 'VAG_CLIENT_INIT_ACK',
  NATIVE_STATE: 'VAG_NATIVE_STATE',
  NATIVE_STATE_ACK: 'VAG_NATIVE_STATE_ACK',
  LIFECYCLE: 'VAG_LIFECYCLE',
  START_FPS: 'VAG_START_FPS',
  STOP_FPS: 'VAG_STOP_FPS',
  FPS_STATS: 'VAG_FPS_STATS',
  ROOM_RPC_REQUEST: 'VAG_ROOM_RPC_REQUEST',
  ROOM_RPC_RESPONSE: 'VAG_ROOM_RPC_RESPONSE',
  ROOM_MESSAGE: 'VAG_ROOM_MESSAGE',
  PLATFORM_ERROR: 'VAG_PLATFORM_ERROR',
} as const

export type VagMessageType = typeof VAG_MESSAGE[keyof typeof VAG_MESSAGE]

export type ClientInitPayload = {
  timestamp: number
  version: string
  retryCount: number
  engine: string | null
}

export type ClientInitAckUser = {
  userId: string
  nickname?: string
  name?: string
  avatar?: string
}

export type ClientInitAckPayload = {
  sandboxToken?: string
  user?: ClientInitAckUser
  playerId?: string
  playerName?: string
  extraPlayerWindow?: boolean
  platformErrorUi?: boolean
  accessToken?: string
  refreshToken?: string
}

export type LifecyclePayload = {
  event: 'initialized' | string
  capabilities?: Capability[]
  multiplayer?: boolean
}

export type StartFpsPayload = {
  intervalMs?: number
}

export type RoomRpcRequestPayload = {
  requestId: string
  method: string
  params?: Record<string, unknown>
}

export type RoomRpcResponsePayload = {
  requestId: string
  ok: boolean
  data?: unknown
  error_code?: string
}

export type PlatformErrorPayload = {
  v: 1
  code: string
  stage?: string
  api?: string
  status?: number
  body?: Record<string, unknown>
  closeCode?: number
  closeReason?: string
  autoRecovering?: boolean
}

export type VagMessagePayload = {
  [VAG_MESSAGE.CLIENT_INIT]: ClientInitPayload
  [VAG_MESSAGE.CLIENT_INIT_ACK]: ClientInitAckPayload
  [VAG_MESSAGE.NATIVE_STATE]: unknown
  [VAG_MESSAGE.NATIVE_STATE_ACK]: { documentId: string; revision: number }
  [VAG_MESSAGE.LIFECYCLE]: LifecyclePayload
  [VAG_MESSAGE.START_FPS]: StartFpsPayload
  [VAG_MESSAGE.STOP_FPS]: Record<string, never>
  [VAG_MESSAGE.FPS_STATS]: FpsStats
  [VAG_MESSAGE.ROOM_RPC_REQUEST]: RoomRpcRequestPayload
  [VAG_MESSAGE.ROOM_RPC_RESPONSE]: RoomRpcResponsePayload
  [VAG_MESSAGE.ROOM_MESSAGE]: unknown
  [VAG_MESSAGE.PLATFORM_ERROR]: PlatformErrorPayload
}

export type VagMessage<T extends VagMessageType = VagMessageType> = {
  type: T
  payload?: VagMessagePayload[T]
}

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type RoomPlayer = {
  id: string
  name: string
  isHost: boolean
  disconnectedAt?: number
}

export type RoomInfo = {
  id: string
  name: string
  status: RoomStatus
  players: RoomPlayer[]
  createdAt: number
}

export type CheckJoinContext = {
  userId: string
  isRejoin: boolean
  requestId?: string
}

export type CheckJoinResult = {
  allowed: boolean
  reasonCode?: string
}

export const ROOM_OCCUPANCY_CODES = [
  'ROOM_ALREADY_EXISTS',
  'ROOM_CREATING',
] as const

export type RoomOccupancyCode = typeof ROOM_OCCUPANCY_CODES[number]

export const ROOM_ERROR_CODES = [
  'ROOM_NOT_FOUND',
  'PLAYER_NOT_IN_ROOM',
  'ROOM_WRONG_PASSWORD',
  'ROOM_ALREADY_EXISTS',
  'ROOM_CREATING',
  'ROOM_JOIN_DENIED',
  'ROOM_JOIN_UNAVAILABLE',
  'ROOM_RPC_FAILED',
  'ROOM_REQUEST_FAILED',
  'ROOM_WS_UNAVAILABLE',
  'GAME_ACCESS_TOKEN_INVALID',
] as const

export type RoomErrorCode = typeof ROOM_ERROR_CODES[number]

export const ROOM_REASON_CODES = [
  'ROOM_FULL',
  'MATCH_IN_PROGRESS',
  'RECONNECT_NOT_ALLOWED',
  'MEMBERSHIP_EXPIRED',
  'ROOM_DRAINING',
  'DEPARTURE_PENDING',
  'PLAYER_NOT_ALLOWED',
  'GAME_RULE_REJECTED',
] as const

export type RoomReasonCode = typeof ROOM_REASON_CODES[number]

const OCCUPANCY_CODE_SET = new Set<string>(ROOM_OCCUPANCY_CODES)

export function normalizeMemberCount(record: Record<string, unknown> | null | undefined): number {
  if (!record) return 0
  if (typeof record.memberCount === 'number') return record.memberCount
  if (typeof record.member_count === 'number') return record.member_count
  if (typeof record.playerCount === 'number') return record.playerCount
  if (Array.isArray(record.player_ids)) return record.player_ids.length
  if (Array.isArray(record.playerIds)) return record.playerIds.length
  return 0
}

function occupancyCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const value = error as { error_code?: unknown; code?: unknown }
  const code = value.error_code ?? value.code
  return typeof code === 'string' && OCCUPANCY_CODE_SET.has(code) ? code : ''
}

export function isOccupancyError(error: unknown): boolean {
  return Boolean(occupancyCode(error))
}

export function occupiedRoomCode(error: unknown): string {
  if (!occupancyCode(error)) return ''
  const value = error as { room_code?: unknown; room_id?: unknown }
  if (typeof value.room_code === 'string' && value.room_code.trim()) return value.room_code
  if (typeof value.room_id === 'string' && value.room_id.trim()) return value.room_id
  return ''
}
/** Opaque gameplay bytes; room control continues to use JSON text. */
export type RoomBinaryData = ArrayBuffer | ArrayBufferView
export const MAX_ROOM_BINARY_BYTES = 1024 * 1024
