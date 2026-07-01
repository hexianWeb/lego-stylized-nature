export const STORY_RECORD_PAGE_TYPES = new Set([
  'signal',
  'towerSignal',
  'shipScanner',
  'comic',
  'archiveLog',
  'towerResponse',
  'protocol'
])

export const mainStoryContent = {
  openingStory: {
    id: 'opening',
    title: 'Incoming Tower Signal',
    kind: 'openingStory',
    pages: [
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'Alien visitor, thank you for answering our signal.'
      },
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'We were once the civilization of this planet. When we understood that nature should not belong to us forever, we uploaded our consciousness and left the surface.'
      },
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'Now the ecology has recovered. Some of us wish to feel wind, water, sunlight, and soil again.'
      },
      {
        type: 'signal',
        speaker: 'TOWER SIGNAL',
        text: 'Please help us activate the four ecological consciousness towers.'
      }
    ]
  },
  towerOrder: ['forest', 'badlands', 'desert', 'volcano'],
  towerRecords: {
    forest: {
      id: 'forest',
      title: 'Forest Evidence',
      kind: 'towerRecord',
      towerId: 'forest',
      objectiveLabel: 'Proceed to the Forest Consciousness Tower',
      activationLabel: 'Press E to activate the Forest Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Forest ecological center restored. Please begin ecological validation.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Hidden archive layer detected. Data state: partially deleted. Rebuilding visual record.' },
        { type: 'comic', image: '/story/forest-evidence.png', alt: 'Four-stage record of forest biomass extraction.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 01', text: 'Biomass output efficiency increased to 312%. Forest self-repair continued to decline. Management conclusion: continue extraction.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'This record is incomplete. Please do not judge us from damaged fragments.' }
      ]
    },
    badlands: {
      id: 'badlands',
      title: 'Badlands Evidence',
      kind: 'towerRecord',
      towerId: 'autumnForest',
      objectiveLabel: 'Proceed to the Badlands Consciousness Tower',
      activationLabel: 'Press E to activate the Badlands Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Mineral belt ecology is stable. These strata record the planet through deep natural time.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Sealed industrial sediment record detected. Pollution data matches current terrain layers.' },
        { type: 'comic', image: '/story/badlands-evidence.png', alt: 'Four-stage record of mining waste and polluted sediment.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 02', text: 'Waste redirected into low ecological value regions. Pollution sediment irreversible. Management conclusion: regional sacrifice acceptable.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'Those were the standards of an older age. We no longer understand nature in the same way.' }
      ]
    },
    desert: {
      id: 'desert',
      title: 'Desert Evidence',
      kind: 'towerRecord',
      towerId: 'desert',
      objectiveLabel: 'Proceed to the Desert Consciousness Tower',
      activationLabel: 'Press E to activate the Desert Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Desert water circulation is stabilizing. The oasis systems are returning.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Old water table record detected. Current desertification overlaps historical extraction networks.' },
        { type: 'comic', image: '/story/desert-evidence.png', alt: 'Four-stage record of groundwater extraction and water-cycle collapse.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 03', text: 'Groundwater level continued to fall. Extraction quota unchanged. Water-cycle model failed. Management conclusion: protect core cities first.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'We believed technology could compensate for every loss. That belief was wrong. Please continue. One tower remains.' }
      ]
    },
    volcano: {
      id: 'volcano',
      title: 'Volcano Evidence',
      kind: 'towerRecord',
      towerId: 'volcano',
      objectiveLabel: 'Proceed to the Volcano Consciousness Tower',
      activationLabel: 'Press E to activate the Volcano Consciousness Tower',
      pages: [
        { type: 'towerSignal', speaker: 'TOWER SIGNAL', text: 'Geothermal fluctuation persists. The life re-gestation system requires core heat validation.' },
        { type: 'shipScanner', speaker: 'SHIP SCANNER', text: 'Core energy extraction record detected. Safety thresholds were overridden multiple times.' },
        { type: 'comic', image: '/story/volcano-evidence.png', alt: 'Four-stage record of geothermal over-extraction.' },
        { type: 'archiveLog', source: 'HIDDEN ARCHIVE 04', text: 'Geothermal output exceeded safe threshold. Core pressure abnormal. Stopping extraction would collapse civilization energy systems. Management conclusion: continue extraction.' },
        { type: 'towerResponse', speaker: 'TOWER SIGNAL', text: 'Yes. We knew the risk. By then, we could no longer stop.' }
      ]
    }
  },
  finalReveal: {
    id: 'finalReveal',
    title: 'Revival Protocol',
    kind: 'finalReveal',
    pages: [
      { type: 'protocol', speaker: 'GLOBAL TOWER LINK ESTABLISHED', text: 'Forest tower: biomass reconstruction module connected.\nBadlands tower: mineral skeleton module connected.\nDesert tower: fluid-cycle module connected.\nVolcano tower: gestation energy module connected.' },
      { type: 'protocol', speaker: 'REVIVAL PROTOCOL', text: 'Ecological validation complete.\nLife re-gestation system awaiting authorization.' },
      { type: 'towerResponse', speaker: 'CONSCIOUSNESS TOWER', text: 'You now know enough. We harmed this planet. That is why we left the surface and let it regrow. Some of us wish to receive bodies again.' },
      { type: 'protocol', speaker: 'REVIVAL PROTOCOL', text: 'Authorization required.\nDecision pending.' }
    ]
  }
}
