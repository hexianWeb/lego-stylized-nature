import { eventBus as defaultEventBus } from '../utils/event-bus.js'
import { t } from '../i18n/i18n.js'
import { createLocaleSwitch } from './LocaleSwitch.js'
import {
  CONTROLS_LOCK_EVENT,
  CONTROLS_UNLOCK_EVENT,
  STORY_RECORD_CLOSED_EVENT,
  STORY_RECORD_SHOW_EVENT
} from '../story/StoryRecordManager.js'

export default class StoryRecordModalHUD {
  constructor({ config, eventBus = defaultEventBus, parent = null } = {}) {
    this.config = config
    this.modalConfig = config?.ui?.storyRecord ?? {}
    this.enabled = this.modalConfig.enabled !== false
    this.eventBus = eventBus
    this.parent = parent ?? (typeof document !== 'undefined' ? document.body : null)
    this.record = null
    this.pageIndex = 0
    this.decisionChoice = null
    this.element = null
    this.localeSwitch = null

    this._onShow = (payload) => {
      if (payload?.refresh) {
        this.refresh(payload.record)
        return
      }

      this.open(payload?.record)
    }
    this._onKeyDown = (event) => this.handleKeyDown(event)

    if (!this.enabled || typeof document === 'undefined' || !this.parent) {
      return
    }

    this.eventBus.on(STORY_RECORD_SHOW_EVENT, this._onShow)
  }

  refresh(record) {
    if (!record || !this.element || !this.record) {
      return
    }

    this.record = record
    const activePages = this.getActivePages()
    this.pageIndex = Math.min(this.pageIndex, activePages.length - 1)
    this.render()
  }

  open(record) {
    if (!record || !Array.isArray(record.pages) || record.pages.length === 0) {
      console.warn('[StoryRecordModalHUD] Invalid record payload.')
      return
    }

    this.close({ emitClosed: false })
    this.record = record
    this.pageIndex = 0
    this.decisionChoice = null
    this.element = document.createElement('div')
    this.element.className = 'story-record-modal'
    this.element.innerHTML = `
      <div class="story-record-modal__panel">
        <div class="story-record-modal__header">
          <div class="story-record-modal__source"></div>
        </div>
        <h2 class="story-record-modal__title"></h2>
        <div class="story-record-modal__body"></div>
        <div class="story-record-modal__footer">
          <span class="story-record-modal__progress"></span>
          <div class="story-record-modal__actions">
            <button class="story-record-modal__button" type="button"></button>
          </div>
        </div>
      </div>
    `
    this.localeSwitch = createLocaleSwitch({
      eventBus: this.eventBus,
      className: 'story-record-modal__locale-switch'
    })
    this.element.querySelector('.story-record-modal__header').appendChild(this.localeSwitch.element)
    this.element.querySelector('.story-record-modal__button').addEventListener('click', () => this.advance())
    this.parent.appendChild(this.element)
    document.addEventListener('keydown', this._onKeyDown)
    this.eventBus.emit(CONTROLS_LOCK_EVENT, { source: 'story-record' })
    this.render()
  }

  getActivePages() {
    const pages = this.record?.pages ?? []
    const decisionIndex = pages.findIndex((page) => page.type === 'decision')

    if (decisionIndex === -1) {
      return pages
    }

    const prelude = pages.slice(0, decisionIndex + 1)
    if (!this.decisionChoice) {
      return prelude
    }

    const outcomes = pages.filter((page) => page.type === `outcome_${this.decisionChoice}`)
    return [...prelude, ...outcomes]
  }

  getCurrentPage() {
    return this.getActivePages()[this.pageIndex] ?? null
  }

  isDecisionPage() {
    const page = this.getCurrentPage()
    return page?.type === 'decision' && !this.decisionChoice
  }

  render() {
    const activePages = this.getActivePages()
    const page = activePages[this.pageIndex]
    const isOpeningStory = this.record.kind === 'openingStory'
    this.localeSwitch?.element?.classList.toggle('story-record-modal__locale-switch--visible', isOpeningStory)
    this.element.querySelector('.story-record-modal__title').textContent = this.record.title
    this.element.querySelector('.story-record-modal__source').textContent = page.speaker ?? page.source ?? this.record.kind
    this.element.querySelector('.story-record-modal__progress').textContent = `${this.pageIndex + 1} / ${activePages.length}`

    const actions = this.element.querySelector('.story-record-modal__actions')
    actions.replaceChildren(this.createFooterActions(page, activePages))

    const body = this.element.querySelector('.story-record-modal__body')
    body.className = `story-record-modal__body story-record-modal__body--${page.type}`
    body.replaceChildren(this.createPageElement(page))
  }

  createFooterActions(page, activePages) {
    if (this.isDecisionPage()) {
      const group = document.createElement('div')
      group.className = 'story-record-modal__decision'

      const yesButton = document.createElement('button')
      yesButton.className = 'story-record-modal__button story-record-modal__button--yes'
      yesButton.type = 'button'
      yesButton.textContent = t('storyRecord.initiateRevival')
      yesButton.addEventListener('click', () => this.chooseDecision('yes'))

      const noButton = document.createElement('button')
      noButton.className = 'story-record-modal__button story-record-modal__button--no'
      noButton.type = 'button'
      noButton.textContent = t('storyRecord.terminateCycle')
      noButton.addEventListener('click', () => this.chooseDecision('no'))

      group.appendChild(yesButton)
      group.appendChild(noButton)
      return group
    }

    const isLastPage = this.pageIndex === activePages.length - 1
    const buttonKey = isLastPage
      ? 'storyRecord.close'
      : page.type === 'shipScanner'
        ? 'storyRecord.recover'
        : 'storyRecord.continue'

    const button = document.createElement('button')
    button.className = 'story-record-modal__button'
    button.type = 'button'
    button.textContent = t(buttonKey)
    button.addEventListener('click', () => this.advance())
    return button
  }

  createPageElement(page) {
    if (page.type === 'comic') {
      const grid = document.createElement('div')
      grid.className = 'story-record-modal__comic-grid'
      grid.style.setProperty('--comic-image', `url("${page.image}")`)
      if (page.alt) {
        grid.setAttribute('role', 'img')
        grid.setAttribute('aria-label', page.alt)
      }

      for (const quadrant of ['tl', 'tr', 'bl', 'br']) {
        const cell = document.createElement('div')
        cell.className = `story-record-modal__comic-cell story-record-modal__comic-cell--${quadrant}`
        cell.setAttribute('aria-hidden', 'true')
        grid.appendChild(cell)
      }

      return grid
    }

    const text = document.createElement('p')
    text.className = 'story-record-modal__text'
    text.style.whiteSpace = 'pre-line'
    text.textContent = page.text ?? ''
    return text
  }

  chooseDecision(choice) {
    if (!this.record || this.decisionChoice) {
      return
    }

    this.decisionChoice = choice
    this.pageIndex += 1
    this.render()
  }

  handleKeyDown(event) {
    if (this.isDecisionPage()) {
      return
    }

    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      this.advance()
    }

    if (event.code === 'Escape') {
      this.close()
    }
  }

  advance() {
    if (!this.record || this.isDecisionPage()) {
      return
    }

    const activePages = this.getActivePages()
    if (this.pageIndex < activePages.length - 1) {
      this.pageIndex += 1
      this.render()
      return
    }

    this.close()
  }

  close({ emitClosed = true } = {}) {
    if (!this.record && !this.element) {
      return
    }

    const record = this.record
    const decision = this.decisionChoice
    this.localeSwitch?.dispose()
    this.localeSwitch = null
    this.element?.remove()
    document.removeEventListener('keydown', this._onKeyDown)
    this.record = null
    this.element = null
    this.pageIndex = 0
    this.decisionChoice = null

    if (emitClosed && record) {
      this.eventBus.emit(STORY_RECORD_CLOSED_EVENT, {
        recordId: record.id,
        kind: record.kind,
        decision
      })
      this.eventBus.emit(CONTROLS_UNLOCK_EVENT, { source: 'story-record' })
    }
  }

  dispose() {
    this.eventBus.off(STORY_RECORD_SHOW_EVENT, this._onShow)
    this.close()
  }
}
