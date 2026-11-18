export default {
  meta: {
    label: 'EN'
  },
  controlGuide: {
    accelerate: 'Accelerate',
    brake: 'Brake',
    turnRight: 'Turn Right',
    turnLeft: 'Turn Left',
    activateTower: 'Activate Tower'
  },
  storyObjective: {
    eyebrow: 'OBJECTIVE',
    syncLocked: 'SYNC LOCKED',
    blocked: 'Complete the current ecological validation first.',
    archiveMissing: 'Archive data missing.'
  },
  storyRecord: {
    close: 'Close',
    continue: 'Continue',
    recover: 'Attempt Recovery',
    initiateRevival: 'Initiate Revival',
    terminateCycle: 'Terminate Cycle'
  },
  build: {
    palette: {
      title: 'Bricks'
    },
    colorPicker: {
      title: 'Color'
    },
    tools: {
      place: 'Place',
      select: 'Select',
      delete: 'Delete',
      paint: 'Paint',
      move: 'Move'
    },
    history: {
      undo: 'Undo',
      redo: 'Redo',
      save: 'Save / Load'
    },
    saveLoad: {
      title: 'Save / Load Build',
      exportJson: 'Export JSON',
      shareUrl: 'Share URL',
      importJson: 'Import JSON',
      download: 'Download',
      copy: 'Copy',
      copied: 'Copied!',
      limitWarning: 'Build too large for URL share; download JSON instead.',
      importError: 'Failed to import: '
    },
    tutorial: {
      title: 'Welcome to Build Mode',
      intro: 'Pick a brick on the left, click the baseplate to drop it. Use the tool strip at the bottom to switch tools.',
      shortcuts: 'Shortcuts: B place · V select · X delete · P paint · M move · R rotate 90° · Cmd+Z undo · Cmd+S save.',
      dismiss: 'Got it'
    },
    achievements: {
      title: 'Build Milestone',
      firstBrick: 'First brick placed',
      tenBricks: '10 bricks laid',
      fiftyBricks: 'Half century',
      hundredBricks: 'Centurion',
      firstPaint: 'First color applied',
      firstDelete: 'Cleared the canvas',
      close: 'Continue Building'
    },
    minimap: {
      title: 'Build Map'
    }
  },
  sandbox: {
    categories: {
      all: 'All',
      brick: 'Bricks',
      plate: 'Plates',
      slope: 'Slopes',
      tile: 'Tiles',
      round: 'Rounds',
      wedge: 'Wedges',
      technic: 'Technic',
      baseplate: 'Baseplates',
      decor: 'Decor'
    },
    history: {
      title: 'History',
      empty: 'No actions yet'
    },
    selection: {
      bricksOne: 'brick',
      bricksMany: 'bricks'
    }
  },
  fallbackFinalReveal: {
    title: 'REVIVAL PROTOCOL',
    pages: [
      { speaker: 'REVIVAL PROTOCOL', text: 'Authorization required' },
      { speaker: 'REVIVAL PROTOCOL', text: 'Decision pending protocol record.' }
    ]
  }
}
