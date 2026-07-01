export const zhStoryContent = {
  openingStory: {
    id: 'opening',
    title: '收到神秘信号',
    kind: 'openingStory',
    pages: [
      {
        type: 'signal',
        speaker: '神秘信号',
        text: '信号连接成功。\n外星来客，感谢你回应我们的信号。'
      },
      {
        type: 'signal',
        speaker: '神秘信号',
        text: '我们曾经是这颗星球上的文明。很久以前，我们选择离开地表，将意识上传到归生塔中，让自然重新恢复。\n归生塔保存着我们的记忆，也保存着生命复苏系统。\n但经过漫长时间，部分设施已经损坏。我们无法从塔内自行启动系统。'
      },
      {
        type: 'signal',
        speaker: '神秘信号',
        text: '现在，生态似乎已经恢复。我们希望重新回到这个世界，感受风、水、阳光和土地。\n请前往四座生态中心，激活那里的归生塔。\n你的验证，将决定我们是否可以重新接触这颗星球。'
      }
    ]
  },
  towerOrder: ['forest', 'badlands', 'desert', 'volcano'],
  towerRecords: {
    forest: { id: 'forest', title: '正在激活森林意识塔', kind: 'towerRecord', towerId: 'forest', objectiveLabel: '前往森林意识塔', activationLabel: '按 E 激活森林意识塔', pages: [ { type: 'towerSignal', speaker: '神秘信号', text: '该区域曾是我们最早选择退让的森林保护区。\n我们离开后，森林重新获得了生长空间。\n请确认生态状态。 —— 神秘信号' }, { type: 'shipScanner', speaker: '飞船扫描仪', text: '检测到非公开数据层。\n标记：已删除 / 未完全擦除 / 访问受限。\n是否尝试恢复？ —— 飞船扫描仪' }, { type: 'comic', image: '/story/forest-evidence.png', alt: '森林生物质开采的四阶段记录。' }, { type: 'archiveLog', source: '隐藏档案 01', title: '森林维护员日志', text: [ '记录 01：森林系统稳定。河流、树冠、动物迁徙路径均处于健康范围。我们第一次从这片森林取走木材时，所有人都很谨慎。', '记录 02：有限采集计划运行良好。砍伐区已完成补种，新树苗成活率超过预期。那时我们相信，文明可以和森林一起生长。', '记录 03：生物质需求持续上升。手工采集已被机械伐木替代。树木再生速度开始低于采集速度，但能源部门认为风险仍可接受。', '记录 04：树冠覆盖率跌破恢复阈值。河水变浑，动物迁徙信号消失。管理层结论：继续开采，直到替代能源上线。' ].join('\n\n') }, { type: 'towerResponse', speaker: '神秘信号', text: '森林意识塔已激活。\n' + '生态验证进度已记录。\n' + '非常感谢您的帮助，请继续前往下一座生态中心。'} ] },
    badlands: {
      id: 'badlands',
      title: '正在激活荒原意识塔',
      kind: 'towerRecord',
      towerId: 'autumnForest',
      objectiveLabel: '前往荒原意识塔',
      activationLabel: '按 E 激活荒原意识塔',
      pages: [
        {
          type: 'towerSignal',
          speaker: '神秘信号',
          text:
            '该区域曾是稳定的矿物峡谷。\n' +
            '彩色岩层记录着星球深处漫长的自然时间。\n' +
            '请确认荒原生态状态。'
        },
        {
          type: 'shipScanner',
          speaker: '飞船扫描仪',
          text:
            '检测到非公开沉积数据层。\n' +
            '标记：工业污染 / 矿物废料 / 地层异常。\n' +
            '是否尝试恢复？ —— 飞船扫描仪'
        },
        {
          type: 'comic',
          image: '/story/badlands-evidence.png',
          alt: '采矿废料与污染沉积的四阶段记录。'
        },
        {
          type: 'archiveLog',
          source: '隐藏档案 02',
          title: '沉积层监测日志',
          text: [
            '记录 01：矿物峡谷系统稳定。溪流穿过彩色岩层，晶体生长缓慢但规律。秋色植被覆盖在岩壁之间，沉积层未见异常污染。',
            '记录 02：小规模采矿计划运行良好。采集队只开凿浅层矿道，并对采空区域进行回填。地貌完整度仍保持在安全范围内。',
            '记录 03：矿物需求持续上升。露天矿坑扩张，传送带和矿石处理厂接入峡谷。废水池开始出现在低地，彩色沉积层中检测到工业残留。',
            '记录 04：污染沉积已不可逆。溪流改道，植被退化，部分彩色岩层由矿物废料和化学沉积混合形成。管理层结论：低生态价值区域可以牺牲。'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: '神秘信号',
          text:
            '荒原意识塔已激活。\n' +
            '生态验证进度已记录。\n' +
            '感谢您的协助，请继续前往下一座生态中心。'
        }
      ]
    },
    
    desert: {
      id: 'desert',
      title: '正在激活沙漠意识塔',
      kind: 'towerRecord',
      towerId: 'desert',
      objectiveLabel: '前往沙漠意识塔',
      activationLabel: '按 E 激活沙漠意识塔',
      pages: [
        {
          type: 'towerSignal',
          speaker: '神秘信号',
          text:
            '该区域曾是沙漠中的稳定绿洲系统。\n' +
            '水道、湿地与棕榈林共同维持着这里的生命循环。\n' +
            '请确认沙漠生态状态。'
        },
        {
          type: 'shipScanner',
          speaker: '飞船扫描仪',
          text:
            '检测到非公开地下水记录。\n' +
            '标记：水位下降 / 抽取网络 / 水循环异常。\n' +
            '是否尝试恢复？——飞船扫描仪'
        },
        {
          type: 'comic',
          image: '/story/desert-evidence.png',
          alt: '地下水开采与水循环崩溃的四阶段记录。'
        },
        {
          type: 'archiveLog',
          source: '隐藏档案 03',
          title: '地下水监测日志',
          text: [
            '记录 01：绿洲系统稳定。地下水位充足，水道流量平稳，湿地与棕榈林为沙漠动物提供迁徙节点。该区域水循环处于健康范围。',
            '记录 02：有限取水计划运行良好。水井、水渠与储水塔只服务附近聚落。取水量低于自然补给量，绿洲仍保持稳定。',
            '记录 03：核心城市用水需求上升。新增泵站接入地下含水层，管道网络持续扩张。河道流量开始下降，湿地边缘出现干裂。',
            '记录 04：地下水位跌破恢复阈值。绿洲消失，棕榈林死亡，水循环模型失效。管理层结论：优先保障核心城市供水。'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: '神秘信号',
          text:
            '沙漠意识塔已激活。\n' +
            '生态验证进度已记录。\n' +
            '感谢您的协助，请继续前往下一座生态中心。'
        }
      ]
    },
    
    volcano: {
      id: 'volcano',
      title: '正在激活火山意识塔',
      kind: 'towerRecord',
      towerId: 'volcano',
      objectiveLabel: '前往火山意识塔',
      activationLabel: '按 E 激活火山意识塔',
      pages: [
        {
          type: 'towerSignal',
          speaker: '神秘信号',
          text:
            '该区域仍存在地热波动。\n' +
            '火山生态危险，但它曾长期维持着星球深层能量的平衡。\n' +
            '请确认核心热源状态。'
        },
        {
          type: 'shipScanner',
          speaker: '飞船扫描仪',
          text:
            '检测到非公开核心能源记录。\n' +
            '标记：安全阈值覆盖 / 地热异常 / 深层开采。\n' +
            '是否尝试恢复？——飞船扫描仪'
        },
        {
          type: 'comic',
          image: '/story/volcano-evidence.png',
          alt: '地热与地核能源过度开采的四阶段记录。'
        },
        {
          type: 'archiveLog',
          source: '隐藏档案 04',
          title: '核心热源监测日志',
          text: [
            '记录 01：火山区处于自然平衡。岩浆河稳定流动，蒸汽喷口周期规律，晶体带未见异常增压。该区域危险，但并未失控。',
            '记录 02：地热采集计划启动。少量采集塔接入蒸汽口，输出稳定。工程部门确认：当前开采不会影响火山整体压力。',
            '记录 03：能源需求继续上升。深层钻井和岩浆管线接入核心热源，地表裂缝数量增加。多项安全阈值被临时覆盖。',
            '记录 04：核心压力异常。停止开采将导致文明能源系统崩溃，继续开采将导致火山区失衡。管理层结论：继续抽取，直到意识转移完成。'
          ].join('\n\n')
        },
        {
          type: 'towerResponse',
          speaker: '神秘信号',
          text:
            '火山意识塔已激活。\n' +
            '生态验证进度已记录。\n' +
            '四座生态中心的验证已经完成。\n' +
            '正在建立全球塔台链路。'
        }
      ]
    }
  },
  finalReveal: {
    id: 'finalReveal',
    title: '复生协议',
    kind: 'finalReveal',
    pages: [
      {
        type: 'protocol',
        speaker: '全球塔台链路已建立',
        text:
          '森林塔：生物质重构模块已连接。\n' +
          '荒原塔：矿物骨架模块已连接。\n' +
          '沙漠塔：流体循环模块已连接。\n' +
          '火山塔：孕育能量模块已连接。'
      },
      {
        type: 'protocol',
        speaker: '复生协议',
        text:
          '四项生态验证完成。\n' +
          '地表环境：可支持生命再孕育。\n' +
          '意识同步容器：等待激活。\n' +
          '生命复苏系统：等待外部授权。'
      },
      {
        type: 'towerResponse',
        speaker: '意识塔',
        text:
          '外星来客，现在你已经完成了验证。\n' +
          '意识塔保存着我们的记忆，也保存着重新孕育身体的系统。\n' +
          '我们曾离开地表，让这颗星球重新生长。\n' +
          '如今，我们中的一部分希望再次接触这个世界。'
      },
      {
        type: 'protocol',
        speaker: '复生协议',
        text:
          '外部验证者权限已确认。\n' +
          '生命复苏系统等待授权。\n' +
          '决策等待中。'
      }
    ]
  }
}
