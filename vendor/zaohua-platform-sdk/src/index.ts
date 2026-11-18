/* Generated from packages/vag-platform-sdk. Do not edit; run pnpm run build. */
import {
  CAPABILITIES,
  CONTRACT_VERSION,
  OFFLINE_PROTOCOL,
  REQUIRED_CAPABILITIES,
  type Capability,
} from './contracts.js'
import { devStub } from './dev-stub.js'
import type { PlatformSdk } from './types.js'

export {
  CAPABILITIES,
  CONTRACT_VERSION,
  OFFLINE_PROTOCOL,
  REQUIRED_CAPABILITIES,
}
export type { Capability }
export type {
  FpsApi,
  FpsOptions,
  InitializeOptions,
  LifecycleAdapter,
  LifecycleState,
  PlatformSdk,
  RoomConnection,
  RoomCreateResult,
  RoomDirectory,
  RoomInfo,
  RoomJoinResult,
  RoomListResult,
  RoomRpcError,
  StudioLogLevel,
  User,
} from './types.js'

function sdk(): PlatformSdk {
  const live = typeof window === 'undefined' ? undefined : window.PlatformClient
  return live?.__runtime ? live : devStub
}

export const initialize: PlatformSdk['initialize'] = (options) => sdk().initialize(options)

export const game: PlatformSdk['game'] = {
  loading: (detail) => sdk().game.loading(detail),
  loaded: () => sdk().game.loaded(),
}

export const lifecycle: PlatformSdk['lifecycle'] = {
  register: (adapter) => sdk().lifecycle.register(adapter),
}

export const user: PlatformSdk['user'] = {
  getCurrent: () => sdk().user.getCurrent(),
}

export const storage: PlatformSdk['storage'] = {
  get: (key) => sdk().storage.get(key),
  set: (key, value) => sdk().storage.set(key, value),
}

export const rooms: PlatformSdk['rooms'] = {
  isAvailable: () => sdk().rooms.isAvailable(),
  list: (options) => sdk().rooms.list(options),
  get: (roomId) => sdk().rooms.get(roomId),
  create: (options) => sdk().rooms.create(options),
  join: (roomId, options) => sdk().rooms.join(roomId, options),
  leave: (roomId) => sdk().rooms.leave(roomId),
  destroy: (roomId) => sdk().rooms.destroy(roomId),
  connect: (roomId, options) => sdk().rooms.connect(roomId, options),
  handleErrors: (codes) => sdk().rooms.handleErrors(codes),
  hostShowsPlatformErrors: () => sdk().rooms.hostShowsPlatformErrors(),
}

export const studio: PlatformSdk['studio'] = {
  log: (level, message, detail) => sdk().studio.log(level, message, detail),
}

export const fps: PlatformSdk['fps'] = {
  start: (options) => sdk().fps.start(options),
  stop: () => sdk().fps.stop(),
  getStats: () => sdk().fps.getStats(),
}

export const whenGameApiReady: PlatformSdk['whenGameApiReady'] = () => sdk().whenGameApiReady()
