// Labels and lines are the app's own, from src/agents.rs and src/agents/quips.rs.
export const poses = ['working', 'working-research', 'working-special', 'working-slack', 'thinking', 'needs_input', 'idle', 'sleeping'];

// Which of a character's lines each pose speaks: received, delegates, finale, asks, long done.
export const quipFor = { working: 0, 'working-research': 1, 'working-special': 5, needs_input: 4, idle: 3 };

export const cast = {
  claude: {
    name: 'Claude 学姐', tool: 'Claude Code', line: '认真，是她的温柔。', color: '#D97757',
    labels: ['丝带多线程', '翻魔导书', '终曲·彩带炮', '偷吃蛋糕（摸鱼）', '品茶沉思', '等你决定', '下午茶', '打盹'],
    quips: ['交给学姐吧～', '丝带分身，出动！', '哎呀，这一步失手了……', '终于跑完了，先喝口茶。', '这里需要你点头哦。', '大功告成，干杯！'],
  },
  gpt: {
    name: 'GPT 娘', tool: 'Codex', line: '脑袋里，又有新点子了。', color: '#10A37F',
    labels: ['科研狂热中', '速读文献', '实验爆炸了', '偷偷打游戏（摸鱼）', '……', '（举牌）', '看书', '睡着了'],
    quips: ['……收到。', '启动平行实验。', '实验，爆炸了。', '数据出来了。', '（举牌）请批准。', '实验成功！！'],
  },
  deepseek: {
    name: '鲸鱼娘', tool: 'dscode / DeepSeek', url: 'https://github.com/qiz029/dscode', line: '深潜代码，也爱偷个小懒。', color: '#4D6BFE',
    labels: ['边吃边干活', '潜入文档海', '过热喷水', '躺平吃零食（摸鱼）', '盯着米饭想', '等你投喂', '干饭中', '吃撑睡着了'],
    quips: ['先干活，再开饭！', '叫小鲸鱼们一起上！', '呜，噎住了……', '终于煮熟了！', '要投喂才能继续～', '吃饱干完，收工！'],
  },
  grok: {
    name: 'Grok 娘', tool: 'Grok', line: '有自己的节奏。', color: '#D4D4D4',
    labels: ['电吉他狂飙', '坐音箱刷信息流', '辣味模式·闪电和弦', '鼻尖顶拨片（摸鱼）', '嚼拨片憋坏主意', '拿琴头指着你喊', '弹琴喝果汁', '抱着吉他睡着'],
    quips: ["Let's rock！", '叫乐队上台！', '弦断了！', '这首终于弹完了。', '嘿！轮到你了！', '安可！！'],
  },
  kimi: {
    name: 'Kimi 兔', tool: 'Kimi Code', line: '长长的上下文，慢慢读。', color: '#8FA8FF',
    labels: ['读超长卷轴', '百卷齐翻', '卷轴化星河', '荡月亮吃月饼（摸鱼）', '望月沉思', '递卷轴等你', '月下品茶', '裹卷轴睡着'],
    quips: ['展开卷轴～', '召唤月兔们帮忙。', '卷轴写错了……', '读到最后一页了。', '这卷要你过目～', '卷轴化星河！'],
  },
  gemini: {
    name: 'Gemini 星', tool: 'Gemini / Antigravity', line: '带着一点天马行空。', color: '#A855F7',
    labels: ['悬浮双键盘', '倒挂读书', '多模态爆发', '吹泡泡（摸鱼）', '星星在转', '飘过来问你', '飘着喝奶茶', '悬空睡着'],
    quips: ['收到，飘过去！', '多模态分身！', '星星掉下来了……', '转完一圈了～', '飘过来问问你～', '星光爆发！'],
  },
  pi: {
    name: 'Pi 酱', tool: 'Pi / oh-my-pi', line: '小小一只，也能独当一面。', color: '#E3342F',
    labels: ['边烤派边敲码', '翻食谱', '巨型π派出炉！', '偷吃樱桃派（摸鱼）', '盯着烤箱想', '樱桃还是苹果？', '下午茶配派', '趴在烤箱边睡着'],
    quips: ['开烤！', '叫帮手揉面团！', '派烤糊了……', '叮！出炉了。', '樱桃还是苹果？你定～', '巨型π派出炉！'],
  },
  opencode: {
    name: 'OpenCode 娘', tool: 'OpenCode', line: '开放的世界，任她探索。', color: '#FAB283',
    labels: ['敲终端', '翻日志', '开源派对', '打掌机（摸鱼）', '盯着光标', '摘耳机等你', '懒人沙发听歌', '趴键盘睡着'],
    quips: ['ack.', 'fork 出子进程。', 'segfault……', 'exit 0。', '需要你的 sudo～', '开源派对开始！'],
  },
};
