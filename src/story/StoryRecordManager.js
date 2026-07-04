import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { getMessages, t } from '../i18n/i18n.js'
import { mainStoryContent, STORY_RECORD_PAGE_TYPES } from './mainStoryContent.js'

export const STORY_RECORD_SHOW_EVENT = 'story-record:show'
export const STORY_RECORD_CLOSED_EVENT = 'story-record:closed'
export const STORY_OBJECTIVE_UPDATE_EVENT = 'story-objective:update'
export const STORY_OBJECTIVE_BLOCKED_EVENT = 'story-objective:blocked'
export const CHATTER_PAUSE_EVENT = 'chatter:pause'
export const CHATTER_RESUME_EVENT = 'chatter:resume'
export const CONTROLS_LOCK_EVENT = 'controls:lock'
export const CONTROLS_UNLOCK_EVENT = 'controls:unlock'

const BIOME_CENTER_ENTERED_EVENT = 'biome-center:entered'
const BIOME_CENTER_EXITED_EVENT = 'biome-center:exited'
const BIOME_CENTER_ACTIVATE_EVENT = 'biome-center:activate'

function createFallbackFinalReveal() {
  const fallback = getMessages('fallbackFinalReveal') ?? {}
  const pages = Array.isArray(fallback.pages) ? fallback.pages : []

  return {
    id: 'finalReveal',
    title: fallback.title ?? 'REVIVAL PROTOCOL',
    kind: 'finalReveal',
    pages: pages.map((page) => ({
      type: 'protocol',
      speaker: page.speaker,
      text: page.text
    }))
  }
}

export default class StoryRecordManager {
  constructor({ eventBus = defaultEventBus, content = mainStoryContent, logger = console } = {}) {
    this.eventBus = eventBus
    this.content = content
    this.logger = logger
    this.state = {
      introPlayed: false,
      completedRecords: new Set(),
      activeRecordId: null,
      finalRevealPlayed: false,
      currentObjectiveId: null,
      nearbyTower: null,
      finalDecision: null
    }

    this._onTowerEntered = (payload) => this.handleTowerEntered(payload)
    this._onTowerExited = (payload) => this.handleTowerExited(payload)
    this._onTowerActivate = (payload) => this.handleTowerActivate(payload)
    this._onRecordClosed = (payload) => this.handleRecordClosed(payload)

    this.eventBus.on(BIOME_CENTER_ENTERED_EVENT, this._onTowerEntered)
    this.eventBus.on(BIOME_CENTER_EXITED_EVENT, this._onTowerExited)
    this.eventBus.on(BIOME_CENTER_ACTIVATE_EVENT, this._onTowerActivate)
    this.eventBus.on(STORY_RECORD_CLOSED_EVENT, this._onRecordClosed)
  }

  start() {
    if (this.state.introPlayed || this.state.activeRecordId) {
      return
    }

    const opening = this.normalizeRecord(this.content.openingStory)
    if (!opening) {
      this.logger.warn?.('[StoryRecordManager] openingStory is missing or has no playable pages.')
      this.state.introPlayed = true
      this.setCurrentObjective(this.content.towerOrder?.[0] ?? null)
      return
    }

    this.showRecord(opening)
  }

  normalizeRecord(record) {
    if (!record || !Array.isArray(record.pages)) {
      return null
    }

    const pages = record.pages.filter((page) => STORY_RECORD_PAGE_TYPES.has(page.type))
    if (pages.length === 0) {
      return null
    }

    return { ...record, pages }
  }

  showRecord(record) {
    if (!record || this.state.activeRecordId) {
      return
    }

    this.state.activeRecordId = record.id
    this.eventBus.emit(CHATTER_PAUSE_EVENT, { source: 'story-record' })
    this.eventBus.emit(STORY_RECORD_SHOW_EVENT, { record })
  }

  handleTowerEntered(payload = {}) {
    this.state.nearbyTower = payload
    this.emitObjective({ canActivate: this.isCurrentTower(payload) })
  }

  handleTowerExited(payload = {}) {
    if (this.state.nearbyTower?.towerId === payload.towerId) {
      this.state.nearbyTower = null
    }

    this.emitObjective({ canActivate: false })
  }

  handleTowerActivate(payload = {}) {
    if (this.state.activeRecordId) {
      return
    }

    if (!this.isCurrentTower(payload)) {
      this.eventBus.emit(STORY_OBJECTIVE_BLOCKED_EVENT, {
        towerId: payload.towerId,
        storyId: payload.storyId,
        requiredObjectiveId: this.state.currentObjectiveId,
        message: t('storyObjective.blocked')
      })
      return
    }

    const record = this.normalizeRecord(this.content.towerRecords?.[this.state.currentObjectiveId])
    if (!record) {
      this.logger.warn?.(`[StoryRecordManager] tower record "${this.state.currentObjectiveId}" is missing or has no playable pages.`)
      this.emitObjective({
        canActivate: true,
        message: t('storyObjective.archiveMissing')
      })
      return
    }

    this.showRecord(record)
  }

  handleRecordClosed({ recordId, kind, decision } = {}) {
    this.state.activeRecordId = null
    this.eventBus.emit(CHATTER_RESUME_EVENT, { source: 'story-record' })

    if (kind === 'openingStory' || recordId === this.content.openingStory?.id) {
      this.state.introPlayed = true
      this.setCurrentObjective(this.content.towerOrder?.[0] ?? null)
      return
    }

    if (kind === 'towerRecord') {
      this.state.completedRecords.add(recordId)
      this.advanceAfterTower(recordId)
      return
    }

    if (kind === 'finalReveal' || recordId === 'finalReveal') {
      this.state.finalRevealPlayed = true
      this.state.finalDecision = decision ?? null
      this.state.currentObjectiveId = null
      this.emitObjective({ canActivate: false })
    }
  }

  advanceAfterTower(recordId) {
    const currentIndex = this.content.towerOrder?.indexOf(recordId) ?? -1
    if (currentIndex === -1) {
      return
    }

    const nextObjectiveId = this.content.towerOrder[currentIndex + 1] ?? null
    if (nextObjectiveId) {
      this.setCurrentObjective(nextObjectiveId)
      return
    }

    this.state.currentObjectiveId = null
    this.emitObjective({ canActivate: false })
    this.showFinalReveal()
  }

  showFinalReveal() {
    if (this.state.finalRevealPlayed) {
      return
    }

    const record = this.normalizeRecord(this.content.finalReveal) ?? createFallbackFinalReveal()
    this.showRecord(record)
  }

  setCurrentObjective(objectiveId) {
    this.state.currentObjectiveId = objectiveId
    this.emitObjective({
      canActivate: this.isCurrentTower(this.state.nearbyTower)
    })
  }

  emitObjective(extra = {}) {
    const objectiveId = this.state.currentObjectiveId
    const record = objectiveId ? this.content.towerRecords?.[objectiveId] : null
    const canActivate = Boolean(extra.canActivate && record)

    this.eventBus.emit(STORY_OBJECTIVE_UPDATE_EVENT, {
      objectiveId,
      towerId: record?.towerId ?? objectiveId,
      label: record?.objectiveLabel ?? '',
      activationLabel: record?.activationLabel ?? '',
      canActivate,
      ...extra,
      canActivate
    })
  }

  isCurrentTower(payload = {}) {
    if (!payload || !this.state.currentObjectiveId) {
      return false
    }

    const currentObjectiveId = this.state.currentObjectiveId
    const currentRecord = this.content.towerRecords?.[currentObjectiveId]

    return payload.storyId === currentObjectiveId ||
      payload.towerId === currentObjectiveId ||
      payload.towerId === currentRecord?.towerId
  }

  setContent(content) {
    this.content = content

    if (this.state.activeRecordId) {
      const record = this.resolveRecordById(this.state.activeRecordId)
      if (record) {
        this.eventBus.emit(STORY_RECORD_SHOW_EVENT, { record, refresh: true })
      }
    }

    this.emitObjective({
      canActivate: this.isCurrentTower(this.state.nearbyTower)
    })
  }

  resolveRecordById(recordId) {
    if (this.content.openingStory?.id === recordId) {
      return this.normalizeRecord(this.content.openingStory)
    }

    if (this.content.finalReveal?.id === recordId) {
      return this.normalizeRecord(this.content.finalReveal)
    }

    for (const record of Object.values(this.content.towerRecords ?? {})) {
      if (record.id === recordId) {
        return this.normalizeRecord(record)
      }
    }

    return null
  }

  dispose() {
    this.eventBus.off(BIOME_CENTER_ENTERED_EVENT, this._onTowerEntered)
    this.eventBus.off(BIOME_CENTER_EXITED_EVENT, this._onTowerExited)
    this.eventBus.off(BIOME_CENTER_ACTIVATE_EVENT, this._onTowerActivate)
    this.eventBus.off(STORY_RECORD_CLOSED_EVENT, this._onRecordClosed)
  }
}
