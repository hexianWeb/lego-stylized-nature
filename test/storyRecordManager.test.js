import test from 'node:test'
import assert from 'node:assert/strict'
import mitt from 'mitt'
import StoryRecordManager, {
  CHATTER_PAUSE_EVENT,
  CHATTER_RESUME_EVENT,
  STORY_OBJECTIVE_BLOCKED_EVENT,
  STORY_OBJECTIVE_UPDATE_EVENT,
  STORY_RECORD_CLOSED_EVENT,
  STORY_RECORD_SHOW_EVENT
} from '../src/story/StoryRecordManager.js'

const content = {
  openingStory: {
    id: 'opening',
    title: 'Opening',
    kind: 'openingStory',
    pages: [{ type: 'signal', text: 'open' }]
  },
  towerOrder: ['forest', 'badlands'],
  towerRecords: {
    forest: {
      id: 'forest',
      title: 'Forest',
      kind: 'towerRecord',
      towerId: 'forest',
      objectiveLabel: 'Go forest',
      activationLabel: 'Press E forest',
      pages: [{ type: 'towerSignal', text: 'forest' }]
    },
    badlands: {
      id: 'badlands',
      title: 'Badlands',
      kind: 'towerRecord',
      towerId: 'autumnForest',
      objectiveLabel: 'Go badlands',
      activationLabel: 'Press E badlands',
      pages: [{ type: 'towerSignal', text: 'badlands' }]
    }
  },
  finalReveal: {
    id: 'finalReveal',
    title: 'Final',
    kind: 'finalReveal',
    pages: [{ type: 'protocol', text: 'final' }]
  }
}

function createHarness(customContent = content) {
  const bus = mitt()
  const shown = []
  const objectives = []
  const blocked = []
  const pauses = []
  const resumes = []
  const warnings = []
  const logger = { warn: (message) => warnings.push(message) }
  const manager = new StoryRecordManager({ eventBus: bus, content: customContent, logger })

  bus.on(STORY_RECORD_SHOW_EVENT, (payload) => shown.push(payload))
  bus.on(STORY_OBJECTIVE_UPDATE_EVENT, (payload) => objectives.push(payload))
  bus.on(STORY_OBJECTIVE_BLOCKED_EVENT, (payload) => blocked.push(payload))
  bus.on(CHATTER_PAUSE_EVENT, (payload) => pauses.push(payload))
  bus.on(CHATTER_RESUME_EVENT, (payload) => resumes.push(payload))

  return { bus, manager, shown, objectives, blocked, pauses, resumes, warnings }
}

function closeRecord(bus, record) {
  bus.emit(STORY_RECORD_CLOSED_EVENT, { recordId: record.id, kind: record.kind })
}

test('manager.start() emits story-record:show for opening', () => {
  const { manager, shown, pauses } = createHarness()

  manager.start()

  assert.equal(shown.length, 1)
  assert.equal(shown[0].record.id, 'opening')
  assert.equal(pauses.length, 1)
  assert.equal(pauses[0].source, 'story-record')
})

test('closing opening emits story-objective:update for forest', () => {
  const { bus, manager, objectives, resumes } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)

  assert.equal(objectives.at(-1).objectiveId, 'forest')
  assert.equal(objectives.at(-1).towerId, 'forest')
  assert.equal(objectives.at(-1).label, 'Go forest')
  assert.equal(objectives.at(-1).canActivate, false)
  assert.equal(resumes.length, 1)
})

test('entering current tower updates objective with activation prompt', () => {
  const { bus, manager, objectives } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:entered', { towerId: 'forest', storyId: 'forest' })

  assert.equal(objectives.at(-1).objectiveId, 'forest')
  assert.equal(objectives.at(-1).canActivate, true)
  assert.equal(objectives.at(-1).activationLabel, 'Press E forest')
})

test('exiting current tower clears activation prompt', () => {
  const { bus, manager, objectives } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:entered', { towerId: 'forest', storyId: 'forest' })
  bus.emit('biome-center:exited', { towerId: 'forest', storyId: 'forest' })

  assert.equal(objectives.at(-1).objectiveId, 'forest')
  assert.equal(objectives.at(-1).canActivate, false)
})

test('activating non-current tower emits story-objective:blocked and does not show a tower record', () => {
  const { bus, manager, blocked, shown } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:activate', { towerId: 'desert', storyId: 'desert' })

  assert.equal(blocked.length, 1)
  assert.equal(blocked[0].requiredObjectiveId, 'forest')
  assert.equal(shown.length, 1)
})

test('activating current tower shows that tower record', () => {
  const { bus, manager, shown } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })

  assert.equal(shown.at(-1).record.id, 'forest')
})

test('closing tower record advances to next objective', () => {
  const { bus, manager, objectives } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })
  closeRecord(bus, content.towerRecords.forest)

  assert.equal(objectives.at(-1).objectiveId, 'badlands')
  assert.equal(objectives.at(-1).towerId, 'autumnForest')
  assert.equal(objectives.at(-1).label, 'Go badlands')
})

test('after all tower records close, finalReveal is shown', () => {
  const { bus, manager, shown } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })
  closeRecord(bus, content.towerRecords.forest)
  bus.emit('biome-center:activate', { towerId: 'autumnForest', storyId: 'badlands' })
  closeRecord(bus, content.towerRecords.badlands)

  assert.equal(shown.at(-1).record.id, 'finalReveal')
})

test('closing finalReveal sets manager.state.decisionPending true', () => {
  const { bus, manager } = createHarness()

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })
  closeRecord(bus, content.towerRecords.forest)
  bus.emit('biome-center:activate', { towerId: 'autumnForest', storyId: 'badlands' })
  closeRecord(bus, content.towerRecords.badlands)
  closeRecord(bus, content.finalReveal)

  assert.equal(manager.state.decisionPending, true)
})

test('missing finalReveal uses a decision pending fallback record', () => {
  const { bus, manager, shown } = createHarness({ ...content, finalReveal: null })

  manager.start()
  closeRecord(bus, content.openingStory)
  bus.emit('biome-center:activate', { towerId: 'forest', storyId: 'forest' })
  closeRecord(bus, content.towerRecords.forest)
  bus.emit('biome-center:activate', { towerId: 'autumnForest', storyId: 'badlands' })
  closeRecord(bus, content.towerRecords.badlands)

  assert.equal(shown.at(-1).record.id, 'finalReveal')
  assert.equal(shown.at(-1).record.title, 'REVIVAL PROTOCOL')
  assert.equal(shown.at(-1).record.pages.at(-1).text, 'Decision pending protocol record.')
})
