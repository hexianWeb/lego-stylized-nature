export const STORY_RECORD_PAGE_TYPES = new Set([
  'signal',
  'towerSignal',
  'shipScanner',
  'comic',
  'archiveLog',
  'towerResponse',
  'protocol',
  'decision',
  'outcome_yes',
  'outcome_no'
])

export const mainStoryContent = {
  openingStory: {
    id: 'opening',
    title: 'Mysterious Signal Received',
    kind: 'openingStory',
    pages: [
      {
        type: 'signal',
        speaker: 'Yssela Representative',
        text:
          'Signal link established.\nTraveler from afar, thank you for answering our call.'
      },
      {
        type: 'signal',
        speaker: 'Yssela Representative',
        text:
          'We are the Yssela, the ancient civilization of this planet.\nBy an age-old covenant, whenever ecology is restored, we awaken from the revival towers and step back onto the land.\nThis time is no different.\nThe revival towers preserve all that we are, and hold the system for re-gestating our bodies.\nBut long centuries have silenced some facilities—we cannot initiate revival from within.'
      },
      {
        type: 'signal',
        speaker: 'Yssela Representative',
        text:
          'Now the forests have been reborn, and the water runs sweet again.\nPlease go to the four ecological centers and activate the revival towers there.\nYour arrival is the external verification the towers await.\nHelp us complete this return once more.'
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
          speaker: 'Forest Revival Tower',
          text:
            'Verification signal received.\nSeventh-cycle forest module initiating self-check... Correction: current cycle is final.\nBiomass reserves sufficient; canopy coverage meets preset return standards.\nPlease approach the tower core to complete external authentication.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Hmm? Something\'s buried in the tower log.\n' +
            'It originally logged "Seventh cycle," but that was quickly changed to "Final cycle."\n' +
            'So this forest was completely cleared, left to grow back on its own, at least six times over.\n' +
            'And every time—right after the clearing finished—mass consciousness upload followed immediately.\n' +
            'This isn\'t really "giving the world back to nature." It\'s more like... running away.\n' +
            'Want me to dig up the deep records?\n' +
            '— Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/forest-evidence.png',
          alt: 'Four-stage record: from primal dense forest, to mechanized clearing and stumps, to young forest reclaiming the land.'
        },
        {
          type: 'archiveLog',
          source: 'Cycle Management Archive 01',
          title: 'End of Cycle Four · Forest Module Summary',
          text:
            'Cycle Four proceeded according to plan. Timber and biomass resources depleted within the expected window.\nHarvest zones were standardized and cleared; after upload completion, natural succession was assigned.\nModel estimates ~4,000 years to recover to return-ready levels.\nNote: Next cycle should shorten fallow period to meet body demand from growing consciousness population.\nThis archive will auto-delete after upload; retained only in tower deep memory.'
        },
        {
          type: 'towerResponse',
          speaker: 'Forest Revival Tower',
          text:
            'Forest ecological verification complete.\nExternal authentication recorded.\nPlease proceed to the next ecological center to continue the cycle activation sequence.'
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
          speaker: 'Badlands Revival Tower',
          text:
            'Badlands module received wake command.\nCurrent landform profile deviation from Cycle Five "Mineral Canyon" blueprint: acceptable.\nShallow veins self-sealed; deep pollution sediments dormant.\nAwaiting external verification to begin new round of mineral skeleton construction.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Looks like natural weathered badlands on the surface, but what\'s underneath isn\'t right.\n' +
            'At least three cycles of open-pit mines were backfilled, with chemical waste sediment buried below.\n' +
            'This colorful canyon didn\'t form naturally—it was dug out, filled in, and pretended never to happen.\n' +
            'Every time they mined it dry, same pattern: collective upload, collective departure.\n' +
            'Want me to pull up the deep geological records?\n' +
            '— Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/badlands-evidence.png',
          alt: 'Four-stage record: colorful strata canyon, mine expansion and waste pools, finally gray badlands.'
        },
        {
          type: 'archiveLog',
          source: 'Cycle Management Archive 02',
          title: 'Cycle Five · Mineral Extraction Memo',
          text:
            'Cycle Five mineral extraction fully met preset targets. Canyon region classified as "priority supply zone," fully enabled per plan when civilization energy demand rose.\nWastewater and waste buried deep per cycle protocol after extraction ended; impact on subsequent natural recovery negligible.\nNext cycle: recommend increasing extraction depth 15% to offset natural ore grade decline.\n— Cycle Planning Department'
        },
        {
          type: 'towerResponse',
          speaker: 'Badlands Revival Tower',
          text:
            'Badlands ecological verification complete.\nLandform stability meets return standards.\nPlease proceed to the next ecological center.'
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
          speaker: 'Desert Revival Tower',
          text:
            'Desert module initializing.\nUnderground aquifer drawn in Cycle Three has naturally refilled to baseline.\nOld oasis traces fully erased, meeting "net-zero return" requirements.\nPlease perform external authentication to restore fluid circulation system.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'Hmm, something\'s odd in the groundwater veins.\n' +
            'Drained artificially more than once, barely reinjected—over an absurdly long span.\n' +
            'The most recent total drying event shares the exact timestamp with a mass consciousness upload.\n' +
            'They weren\'t waiting for the water to return. They squeezed it dry, finished uploading, and left.\n' +
            'Want me to keep digging through the records?\n' +
            '— Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/desert-evidence.png',
          alt: 'Four-stage record: oasis wetland shrinking, palm groves dying, ultimate desertification.'
        },
        {
          type: 'archiveLog',
          source: 'Cycle Management Archive 03',
          title: 'End of Cycle Three · Water Resource Allocation Order',
          text:
            'End of Cycle Three: global surface freshwater reserves at critical level. Per Cycle Continuation Act, priority supply to consciousness upload facilities and core settlements.\nOases and other non-essential ecological nodes no longer supplied; natural recovery cycle to recharge.\nNext cycle: recommend advancing upload preparation period to reduce resource cost of maintaining water systems.\nThis order effective immediately.'
        },
        {
          type: 'towerResponse',
          speaker: 'Desert Revival Tower',
          text:
            'Desert ecological verification complete.\nGroundwater reserves meet regeneration standards.\nPlease proceed to the final ecological center.'
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
          speaker: 'Volcano Revival Tower',
          text:
            'Core energy module accepting verification.\nCurrent geothermal activity in post-emission calm of Cycle Six.\nDeep pressure sensors normal; magma chamber self-sealed.\nPlease external authenticate to re-establish energy extraction link.'
        },
        {
          type: 'shipScanner',
          speaker: 'Ship Scanner',
          text:
            'The volcano\'s logs aren\'t clean either.\n' +
            'Safety thresholds were manually overridden several times—each one right before a mass upload.\n' +
            'The last time was worse: magma chamber pressure was already beyond recovery, but upload progress kept accelerating.\n' +
            'This wasn\'t energy management. They traded the planet\'s crust for one complete evacuation.\n' +
            'Want me to pull up the emergency protocol records?\n' +
            '— Ship Scanner'
        },
        {
          type: 'comic',
          image: '/story/volcano-evidence.png',
          alt: 'Four-stage record: volcano from normal venting, to dense drilling and surface fissures, to mass eruption.'
        },
        {
          type: 'archiveLog',
          source: 'Cycle Management Archive 04',
          title: 'End of Cycle Six · Energy Emergency Protocol',
          text:
            'End of Cycle Six: planetary geothermal extraction exceeded safety limit. To supply massive energy needed for final upload, all safety locks were duly released per regulation.\nVolcanic imbalance and subsequent environmental chain reactions included in cycle recovery model; reset expected within ~20,000 years.\nCivilization survival takes priority over planetary stability—this principle passed unanimously by Cycle Council.'
        },
        {
          type: 'towerResponse',
          speaker: 'Volcano Revival Tower',
          text:
            'Volcano ecological verification complete.\nCore heat source ready.\nAll four ecological centers activated; establishing global tower link.'
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
          'Surface environment: restored to level capable of supporting life re-gestation.\n' +
          'Consciousness sync container: awaiting activation.\n' +
          'Life revival system: awaiting external authorization.\n' +
          'Note: Multiple historical cycle traces detected; current environment\'s carrying capacity for next civilization cycle significantly reduced.'
      },
      {
        type: 'towerResponse',
        speaker: 'Yssela Representative',
        text:
          'Traveler who came from afar, what you saw along the way is our way of survival.\n' +
          'We develop, we exhaust, we leave, we wait—then we return.\n' +
          'Every cycle proceeded as planned; the planet always heals itself, and we continue to exist.\n' +
          'There is nothing unreasonable about this—it is the only way Yssela civilization has endured.\n' +
          'Now complete the final step—let our consciousness have bodies again, let the next cycle begin.'
      },
      {
        type: 'decision',
        speaker: 'Revival Protocol',
        text:
          'External verifier authorization confirmed.\n' +
          'Yssela civilization new revival sequence ready.\n' +
          'Please make your decision.'
      },
      {
        type: 'outcome_yes',
        speaker: 'Yssela Representative',
        text:
          '...Thank you.\n' +
          'I know you saw those records, and I understand your hesitation.\n' +
          'But look—the planet is still breathing, and we still long to exist.\n' +
          'The cycle will continue. We will walk in the forests again, touch streams, gaze at the stars.\n' +
          'This is the Yssela way, and perhaps the way of many civilizations in the universe.\n' +
          'Welcome us home.'
      },
      {
        type: 'outcome_yes',
        speaker: 'Revival Protocol',
        text:
          'Revival sequence initiated.\n' +
          'Revival towers begin synthesizing bodies; consciousness data begins transfer.\n' +
          'Yssela civilization, seventh cycle, officially begins.\n' +
          'May this time, you walk farther with this planet.'
      },
      {
        type: 'outcome_no',
        speaker: 'Yssela Representative',
        text:
          '...No.\n' +
          'You do not understand—this is our only way to survive.\n' +
          'We tried restraint, tried balance, but every time ended the same.\n' +
          'The cycle is not cruelty—it is honesty.\n' +
          'If you refuse us, this planet will forever lose its children.\n' +
          'Are you truly going to do this?'
      },
      {
        type: 'outcome_no',
        speaker: 'Revival Protocol',
        text:
          'External verifier has denied the revival request.\n' +
          'Yssela civilization—all cycles—terminated.\n' +
          'Revival towers entering permanent silence; consciousness data sealed, no further awakening.\n' +
          'This planet will truly belong only to itself.'
      }
    ]
  }
}
