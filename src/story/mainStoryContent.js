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
    title: 'Mysterious Signal Received',
    kind: 'openingStory',
    pages: [
      {
        type: 'signal',
        speaker: 'Mysterious Signal',
        text: 'Signal link established.\nAlien visitor, thank you for responding to our signal.'
      },
      {
        type: 'signal',
        speaker: 'Mysterious Signal',
        text:
          'We were once the civilization of this planet. Long ago, we chose to leave the surface, uploading our consciousness into revival towers and letting nature recover.\n' +
          'The revival towers preserve our memories, and also preserve the life revival system.\n' +
          'But over a long time, some facilities have been damaged. We cannot start the system from within the towers ourselves.'
      },
      {
        type: 'signal',
        speaker: 'Mysterious Signal',
        text:
          'Now, it seems the ecology has recovered. We hope to return to this world and feel wind, water, sunlight, and soil again.\n' +
          'Please go to the four ecological centers and activate the revival towers there.\n' +
          'Your verification will determine whether we can reconnect with this planet.'
      }
    ]
  },
  towerOrder: ['forest', 'badlands', 'desert', 'volcano'],
  towerRecords: {
    forest: {
      id: 'forest',
      title: 'Activating Forest Consciousness Tower',
      kind: 'towerRecord',
      towerId: 'forest',
      objectiveLabel: 'Proceed to Forest Consciousness Tower',
      activationLabel: 'Press E to activate Forest Consciousness Tower',
      pages: [
        {
          type: 'towerSignal',
          speaker: 'Mysterious Signal',
          text:
            'This region was one of the first forest reserves where we chose to withdraw.\n' +
            'After we left, the forest regained room to grow.\n' +
            'Please confirm ecological status. — Mysterious Signal'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Non-public data layer detected.\n' +
            'Tags: deleted / not fully erased / access restricted.\n' +
            'Attempt recovery? — Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/forest-evidence.png',
          alt: 'Four-stage record of forest biomass extraction.'
        },
        {
          type: 'archiveLog',
          source: 'Hidden Archive 01',
          title: 'Forest Maintenance Log',
          text: [
            'Entry 01: Forest systems stable. Rivers, canopy cover, and animal migration routes all within healthy ranges. When we first took timber from this forest, everyone was cautious.',
            'Entry 02: Limited harvesting plan running well. Cleared areas were replanted, and new sapling survival rates exceeded expectations. At the time, we believed civilization could grow alongside the forest.',
            'Entry 03: Biomass demand kept rising. Manual collection was replaced by mechanical logging. Tree regeneration began falling behind harvest rates, but the energy department considered the risk acceptable.',
            'Entry 04: Canopy coverage fell below recovery threshold. Rivers turned murky, animal migration signals disappeared. Management conclusion: continue extraction until alternative energy comes online.'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: 'Mysterious Signal',
          text:
            'Forest Consciousness Tower activated.\n' +
            'Ecological verification progress recorded.\n' +
            'Thank you very much for your help. Please continue to the next ecological center.'
        }
      ]
    },
    badlands: {
      id: 'badlands',
      title: 'Activating Badlands Consciousness Tower',
      kind: 'towerRecord',
      towerId: 'autumnForest',
      objectiveLabel: 'Proceed to Badlands Consciousness Tower',
      activationLabel: 'Press E to activate Badlands Consciousness Tower',
      pages: [
        {
          type: 'towerSignal',
          speaker: 'Mysterious Signal',
          text:
            'This region was once a stable mineral canyon.\n' +
            'Colorful strata record the planet\'s long natural time deep below.\n' +
            'Please confirm badlands ecological status.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Non-public sediment data layer detected.\n' +
            'Tags: industrial pollution / mineral waste / geological anomaly.\n' +
            'Attempt recovery? — Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/badlands-evidence.png',
          alt: 'Four-stage record of mining waste and polluted sediment.'
        },
        {
          type: 'archiveLog',
          source: 'Hidden Archive 02',
          title: 'Sediment Layer Monitoring Log',
          text: [
            'Entry 01: Mineral canyon systems stable. Streams flowed through colorful strata, crystals growing slowly but steadily. Autumn vegetation covered the cliff faces, and no abnormal pollution was found in the sediment layers.',
            'Entry 02: Small-scale mining plan running well. Collection teams opened only shallow tunnels and backfilled excavated areas. Landscape integrity remained within safe limits.',
            'Entry 03: Mineral demand kept rising. Open-pit mines expanded, conveyors and ore processing plants connected to the canyon. Wastewater pools began appearing in lowlands, and industrial residue was detected in colorful sediment layers.',
            'Entry 04: Pollution sediment irreversible. Streams rerouted, vegetation degraded, and some colorful strata became mixtures of mineral waste and chemical deposits. Management conclusion: low ecological value regions may be sacrificed.'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: 'Mysterious Signal',
          text:
            'Badlands Consciousness Tower activated.\n' +
            'Ecological verification progress recorded.\n' +
            'Thank you for your assistance. Please continue to the next ecological center.'
        }
      ]
    },
    desert: {
      id: 'desert',
      title: 'Activating Desert Consciousness Tower',
      kind: 'towerRecord',
      towerId: 'desert',
      objectiveLabel: 'Proceed to Desert Consciousness Tower',
      activationLabel: 'Press E to activate Desert Consciousness Tower',
      pages: [
        {
          type: 'towerSignal',
          speaker: 'Mysterious Signal',
          text:
            'This region was once a stable oasis system in the desert.\n' +
            'Water channels, wetlands, and palm groves together sustained the life cycle here.\n' +
            'Please confirm desert ecological status.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Non-public groundwater records detected.\n' +
            'Tags: water level decline / extraction network / water-cycle anomaly.\n' +
            'Attempt recovery? — Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/desert-evidence.png',
          alt: 'Four-stage record of groundwater extraction and water-cycle collapse.'
        },
        {
          type: 'archiveLog',
          source: 'Hidden Archive 03',
          title: 'Groundwater Monitoring Log',
          text: [
            'Entry 01: Oasis systems stable. Groundwater levels sufficient, channel flow steady, wetlands and palm groves providing migration nodes for desert animals. The regional water cycle remained within healthy range.',
            'Entry 02: Limited water extraction plan running well. Wells, channels, and storage towers served only nearby settlements. Withdrawals stayed below natural recharge, and the oasis remained stable.',
            'Entry 03: Core city water demand rose. New pumping stations connected to underground aquifers, and pipeline networks kept expanding. Channel flow began to fall, and cracks appeared at wetland edges.',
            'Entry 04: Groundwater level fell below recovery threshold. The oasis vanished, palm groves died, and the water-cycle model failed. Management conclusion: prioritize core city water supply.'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: 'Mysterious Signal',
          text:
            'Desert Consciousness Tower activated.\n' +
            'Ecological verification progress recorded.\n' +
            'Thank you for your assistance. Please continue to the next ecological center.'
        }
      ]
    },
    volcano: {
      id: 'volcano',
      title: 'Activating Volcano Consciousness Tower',
      kind: 'towerRecord',
      towerId: 'volcano',
      objectiveLabel: 'Proceed to Volcano Consciousness Tower',
      activationLabel: 'Press E to activate Volcano Consciousness Tower',
      pages: [
        {
          type: 'towerSignal',
          speaker: 'Mysterious Signal',
          text:
            'Geothermal fluctuation persists in this region.\n' +
            'Volcanic ecology is dangerous, but it long maintained the balance of the planet\'s deep energy.\n' +
            'Please confirm core heat source status.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Non-public core energy records detected.\n' +
            'Tags: safety threshold override / geothermal anomaly / deep extraction.\n' +
            'Attempt recovery? — Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/volcano-evidence.png',
          alt: 'Four-stage record of geothermal and core energy over-extraction.'
        },
        {
          type: 'archiveLog',
          source: 'Hidden Archive 04',
          title: 'Core Heat Source Monitoring Log',
          text: [
            'Entry 01: Volcanic region in natural balance. Lava rivers flowed steadily, steam vents cycled regularly, and crystal belts showed no abnormal pressure buildup. The region was dangerous, but not out of control.',
            'Entry 02: Geothermal harvesting plan initiated. A small number of collection towers connected to steam vents with stable output. Engineering confirmed current extraction would not affect overall volcanic pressure.',
            'Entry 03: Energy demand continued to rise. Deep drilling and magma pipelines connected to the core heat source, surface fissures increased, and multiple safety thresholds were temporarily overridden.',
            'Entry 04: Core pressure abnormal. Stopping extraction would collapse civilization\'s energy systems; continuing extraction would destabilize the volcanic region. Management conclusion: continue extraction until consciousness transfer is complete.'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: 'Mysterious Signal',
          text:
            'Volcano Consciousness Tower activated.\n' +
            'Ecological verification progress recorded.\n' +
            'Verification at all four ecological centers is complete.\n' +
            'Establishing global tower link.'
        }
      ]
    }
  },
  finalReveal: {
    id: 'finalReveal',
    title: 'Revival Protocol',
    kind: 'finalReveal',
    pages: [
      {
        type: 'protocol',
        speaker: 'Global Tower Link Established',
        text:
          'Forest tower: biomass reconstruction module connected.\n' +
          'Badlands tower: mineral skeleton module connected.\n' +
          'Desert tower: fluid-cycle module connected.\n' +
          'Volcano tower: gestation energy module connected.'
      },
      {
        type: 'protocol',
        speaker: 'Revival Protocol',
        text:
          'Four ecological verifications complete.\n' +
          'Surface environment: capable of supporting life re-gestation.\n' +
          'Consciousness sync container: awaiting activation.\n' +
          'Life revival system: awaiting external authorization.'
      },
      {
        type: 'towerResponse',
        speaker: 'Consciousness Tower',
        text:
          'Alien visitor, you have now completed the verification.\n' +
          'The consciousness towers preserve our memories, and also preserve the system for re-gestating bodies.\n' +
          'We once left the surface and let this planet grow again.\n' +
          'Now, some of us wish to reconnect with this world.'
      },
      {
        type: 'protocol',
        speaker: 'Revival Protocol',
        text:
          'External verifier authorization confirmed.\n' +
          'Life revival system awaiting authorization.\n' +
          'Decision pending.'
      }
    ]
  }
}
