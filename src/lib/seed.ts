import type { Board } from '../types';

export const SEED_BOARD: Board = {
  id: 'board-seed',
  name: '产品路线图',
  background: 'dots',
  nodes: [
    { id: 'n1', kind: 'card', x: 120, y: 220, w: 205, h: 122, title: '文档内核', body: '20+ 格式 · 读写一体\nDOCX / PDF / XLSX / PPTX', tone: 'ink' },
    { id: 'n2', kind: 'card', x: 392, y: 118, w: 218, h: 122, title: '方片画布', body: '拖拽连接点 · 自动成图\n矩形图片 / 标注圆', tone: 'clay' },
    { id: 'n3', kind: 'card', x: 392, y: 330, w: 218, h: 122, title: 'AI 生成', body: '示意图出图 · 分镜动画\n短视频 · 文案', tone: 'moss' },
    { id: 'n4', kind: 'card', x: 682, y: 222, w: 205, h: 122, title: 'Agent 桥接', body: 'CLI / HTTP / WS\n可被脚本编排的桌面应用', tone: 'ink' },
    { id: 'n5', kind: 'annotation-circle', x: 792, y: 392, w: 126, h: 126, title: '一键出片', body: '', tone: 'clay' },
  ],
  edges: [
    { id: 'e1', from: { nodeId: 'n1', port: 'right' }, to: { nodeId: 'n2', port: 'left' }, label: '富文本' },
    { id: 'e2', from: { nodeId: 'n1', port: 'right' }, to: { nodeId: 'n3', port: 'left' }, label: '上下文' },
    { id: 'e3', from: { nodeId: 'n2', port: 'right' }, to: { nodeId: 'n4', port: 'left' }, label: '画布指令' },
    { id: 'e4', from: { nodeId: 'n3', port: 'right' }, to: { nodeId: 'n4', port: 'left' }, label: '生成结果' },
    { id: 'e5', from: { nodeId: 'n4', port: 'bottom' }, to: { nodeId: 'n5', port: 'top' }, label: '' },
  ],
};

export const SEED_FILES: Record<string, string> = {
  '欢迎使用墨枢.md': `# 欢迎使用墨枢

> 一份文档、一块画布、一个会动手的 Agent。

墨枢把「写作」与「思考」放在同一张桌面上：左边是文件，中间是纸面，右侧是 Agent。所有能力都可以被命令行驱动。

## 三件事，先试试

1. 按 \`Ctrl + K\` 打开命令面板，输入「画布」直接切换。
2. 在画布上按住 \`R\` 拖出一个矩形，松手即成为图片框；按住 \`O\` 随手画圈，会自动收敛成标注圆。
3. 从任意方片边缘的小圆点拖出连线，落到另一张方片上。

## 支持的手感

- **格式**：docx / pdf / xlsx / pptx / md / csv / html / rtf / odt / json / yaml / tex … 30 种识别，24 种可写。
- **画笔**：矩形图片框、手绘标注圆、方片连线、自由文本。
- **AI**：示意图一键出图、分镜动画、短视频导出、文案撰写。
- **Agent**：本地 CLI 直接驱动界面，不需要模拟鼠标。

\`\`\`bash
oa create "周报.md" --content "# 本周进展" --open
oa canvas add-card --title "需求" --body "多格式文档" --x 320 --y 220
oa canvas connect --from <id> --to <id>
oa ai image --style blueprint
\`\`\`

> 把鼠标悬停在底部工具栏上滚动滚轮，可以调整工具栏大小。
`,
  '产品路线图.board.json': JSON.stringify(SEED_BOARD, null, 2),
  '内容排期.csv': `日期,渠道,主题,状态,负责人
2026-10-20,公众号,墨枢 1.0 发布,进行中,阿墨
2026-10-22,小红书,桌面 Agent 的三个瞬间,待审,小枢
2026-10-25,视频号,方片连线 30 秒上手,待拍,阿墨
2026-10-28,官网,多格式文档能力白皮书,已完成,设计组
`,
  '品牌文案.txt': `墨枢 · 让文档自己动起来

不是又一个编辑器。
是一张会思考的桌面：文档、画布、Agent，在同一个地方呼吸。
20 余种格式，打开即写；一张示意图，一键成片。
命令行能抵达的，鼠标都能抵达；鼠标没想到的，Agent 已经开始。
`,
  '会议纪要 · 设计评审.md': `# 设计评审 · 2026-10-17

**参与**：产品、设计、工程
**结论**：界面保持「纸与墨」的克制，能力藏在手势与命令里。

## 决议

- 底部工具栏常驻，滚轮可缩放，不做二级面板。
- 画布默认使用点阵底，方片四边留连接点，悬停才显形。
- AI 生成结果直接落回画布，不弹独立窗口。

## 待办

- [ ] 补齐 PPTX 导出的版式
- [ ] 标注圆增加箭头指向
- [x] CLI 支持 \`--json\` 输出
`,
};
