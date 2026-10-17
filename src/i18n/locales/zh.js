export default {
  meta: {
    label: '中'
  },
  controlGuide: {
    accelerate: '加速',
    brake: '减速',
    turnRight: '右转',
    turnLeft: '左转',
    activateTower: '激活塔'
  },
  storyObjective: {
    eyebrow: '目标',
    syncLocked: '同步锁定',
    blocked: '请先完成当前生态验证。',
    archiveMissing: '档案数据缺失。'
  },
  storyRecord: {
    close: '关闭',
    continue: '继续',
    recover: '尝试恢复',
    initiateRevival: '启动复苏',
    terminateCycle: '终止循环'
  },
  build: {
    palette: {
      title: '砖块'
    },
    colorPicker: {
      title: '颜色'
    },
    tools: {
      place: '放置',
      select: '选择',
      delete: '删除',
      paint: '改色',
      move: '移动'
    },
    history: {
      undo: '撤销',
      redo: '重做',
      save: '保存 / 载入'
    },
    saveLoad: {
      title: '保存 / 载入搭建',
      exportJson: '导出 JSON',
      shareUrl: '分享链接',
      importJson: '导入 JSON',
      download: '下载',
      copy: '复制',
      copied: '已复制',
      limitWarning: '作品过大无法用链接分享，请下载 JSON',
      importError: '导入失败：'
    },
    tutorial: {
      title: '欢迎进入搭建模式',
      intro: '左侧选砖，点击底板即可放置。使用底部工具栏切换工具。',
      shortcuts: '快捷键：B 放置 · V 选择 · X 删除 · P 改色 · M 移动 · R 旋转 90° · Cmd+Z 撤销 · Cmd+S 保存。',
      dismiss: '明白了'
    },
    achievements: {
      title: '搭建成就',
      firstBrick: '首砖落成',
      tenBricks: '十砖开局',
      fiftyBricks: '半百里程碑',
      hundredBricks: '百砖匠人',
      firstPaint: '首次上色',
      firstDelete: '清除操作',
      close: '继续搭建'
    },
    minimap: {
      title: '搭建小地图'
    }
  },
  sandbox: {
    categories: {
      all: '全部',
      brick: '砖块',
      plate: '板',
      slope: '斜面',
      tile: '瓷砖',
      round: '圆柱',
      wedge: '楔形',
      technic: '科技',
      baseplate: '底板',
      decor: '装饰'
    },
    history: {
      title: '历史',
      empty: '还没有操作'
    },
    selection: {
      bricksOne: '块',
      bricksMany: '块'
    }
  },
  fallbackFinalReveal: {
    title: '复苏协议',
    pages: [
      { speaker: '复苏协议', text: '需要授权' },
      { speaker: '复苏协议', text: '协议记录待决。' }
    ]
  }
}
