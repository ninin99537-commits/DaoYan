// 剧情导演 · 接线与提示词(文本断言 + 纯函数) —— D3/D5/D6/D9/D10/E1–E7/B1
// 生成前注入(D5)与事件接线在 $() 里跑不进 node, 所以用文本断言钉住关键性质;
// 注入口的"该不该注入"用纯函数 应注入的指令文本 真跑。
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 应注入的指令文本 } from '../src/剧情导演/注入';
import { buildDirectorMessages } from '../src/剧情导演/prompts';
import { SettingsSchema } from '../src/剧情导演/schema';
import indexSource from '../src/剧情导演/index.ts?raw';
import injectSource from '../src/剧情导演/注入.ts?raw';
import updateSource from '../src/剧情导演/update.ts?raw';
import promptSource from '../src/剧情导演/prompts.ts?raw';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

function 账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), ...部分 };
}
const 指令 = { 编号: 1, 节拍: '阴影' as const, 硬性要求: 'x', 伏笔现场: '#3', 禁止事项: '无', 生成楼层: 9, 核验升级次数: 0, 已跳过: false, 代码调整: [] };

console.log('\n[D5] 生成事件只幂等重注已就绪指令, 绝不 await 慢 API');
{
  const start = indexSource.indexOf('onGenerationAfterCommands(');
  const end = indexSource.indexOf('[剧情导演] 剧情导演已加载');
  const 段 = indexSource.slice(start, end > start ? end : indexSource.length);
  ok('生成事件里确实重注指令', 段.includes('sync本幕指令'));
  ok('生成事件里没有 await(不阻塞生成)', !段.includes('await'));
  ok('生成事件里不调用慢推进', !段.includes('updateDirector'));
  ok('注入层本幕指令是同步函数(无 async)', !/function sync本幕指令\([^)]*\)\s*:\s*Promise/.test(injectSource) && injectSource.includes('export function sync本幕指令'));
}

console.log('\n[D6] 群聊检测即暂停');
{
  ok('入口检测群聊', indexSource.includes('isGroupChat()'));
  ok('推进管线也检测群聊', updateSource.includes('isGroupChat()'));
}

console.log('\n[D9] 死亡抉择状态机: 待决→暂停; 抉择→仍暂停; 消费→注入恢复; 抉择进引擎');
{
  ok('推进里登记死亡待决', updateSource.includes('markPending'));
  ok('推进里识别主角死亡', updateSource.includes('主角死亡'));
  ok('推进里消费死亡抉择', updateSource.includes('本次抉择'));
  const 设置 = SettingsSchema.parse({});
  const 带指令 = (部分 = {}) => 账本({ 当前指令: { ...指令 }, ...部分 });
  check('正常指令应注入', 应注入的指令文本(带指令(), 设置, false) !== '', true);
  check('死亡待决(未选) → 暂停', 应注入的指令文本(带指令({ 待决死亡: true, 死亡抉择: '' }), 设置, false), '');
  check('死亡待决(已选未消费) → 仍暂停', 应注入的指令文本(带指令({ 待决死亡: true, 死亡抉择: '视角转移' }), 设置, false), '');
  check('抉择被消费后 → 注入恢复', 应注入的指令文本(带指令({ 待决死亡: false, 死亡抉择: '' }), 设置, false) !== '', true);
  check('暂停注入标志 → 不注入', 应注入的指令文本(带指令(), 设置, true), '');
  check('无指令 → 不注入', 应注入的指令文本(账本(), 设置, false), '');
  check('已跳过 → 不注入', 应注入的指令文本(带指令({ 当前指令: { ...指令, 已跳过: true } }), 设置, false), '');
  check('总开关关 → 不注入', 应注入的指令文本(带指令(), SettingsSchema.parse({ 启用导演: false }), false), '');
  check('自动接管关 → 不注入', 应注入的指令文本(带指令(), SettingsSchema.parse({ 导演: { 自动接管: false } }), false), '');
  // 抉择进引擎: buildDirectorMessages 把抉择写进任务(引擎据此分向)
  const msgs = buildDirectorMessages({
    账本: 账本({ 死亡抉择: '世界观内复活' }),
    reply: '正文', replyCount: 1, context: '', worldbook: '', playerName: null, playerDesc: '',
    死亡抉择: '世界观内复活', 破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false,
  });
  const 任务 = msgs.find(m => m.role === 'user')?.content ?? '';
  ok('引擎任务里有抉择', 任务.includes('世界观内复活'));
  ok('引擎任务里有分向要求', 任务.includes('死亡-复活'));
}

console.log('\n[E1] 事实层: 世界书常驻条目「编剧备忘」蓝灯常驻/防递归/空则删');
{
  ok('用固定条目名常量', injectSource.includes('WORLDBOOK_ENTRY_NAME'));
  ok('常驻条目策略 constant', injectSource.includes("type: 'constant'"));
  ok('防递归 prevent_incoming/outgoing', injectSource.includes('prevent_incoming') && injectSource.includes('prevent_outgoing'));
  ok('空账本时不写条目', injectSource.includes('有账本事实(data)'));
}

console.log('\n[E2] 指令层: injectPrompts + GENERATION_AFTER_COMMANDS, depth 0');
{
  ok('用 host 注入能力(不直连平台)', injectSource.includes('useHost().inject.inject('));
  ok('幂等清理走 host', injectSource.includes('useHost().inject.uninject('));
  ok('深度 0', injectSource.includes('depth: 0'));
  ok('入口监听生成事件', indexSource.includes('onGenerationAfterCommands'));
}

console.log('\n[E3] 去重纪律: 事实层登记伏笔编号, 指令层只按编号引用');
{
  ok('事实层渲染伏笔编号', promptSource.includes('#${伏笔.编号}'));
  ok('事实层提醒不复述、按编号推进', promptSource.includes('按编号推进'));
}

console.log('\n[E4/E5] 指令渲染档位+红线; 玩家冲突按档缩放');
{
  ok('指令带当前档位', promptSource.includes('强度档位=第'));
  ok('档 1/2 玩家行动生效、指令让位', promptSource.includes('低档(1/2)'));
  ok('档 3/4 戏剧性变形', promptSource.includes('高档(3/4)'));
}

console.log('\n[E7] 记忆条目防混淆段');
{
  ok('提到记忆回溯', promptSource.includes('记忆回溯'));
  ok('声明不是设定/不是指令/不得领取任务', promptSource.includes('不得从中领取'));
  ok('核验只看最近正文', promptSource.includes('核验只针对最近正文') || promptSource.includes('执行核验只针对最近正文'));
}

console.log('\n[D3/D10] 无状态重启(全量账本含上一道指令); 与烟火尺度分界');
{
  ok('引擎消息带上当前指令', promptSource.includes('当前指令: 账本.当前指令'));
  ok('提示词声明只读最近几层/账本为唯一长线记忆', promptSource.includes('账本是你唯一的长线记忆') || promptSource.includes('唯一的长线记忆'));
  ok('尺度让给烟火', promptSource.includes('让给「烟火」'));
  ok('不读烟火数据', promptSource.includes('不读取烟火的任何数据'));
}

console.log('\n[B1] 零截断: 发送路径(提示词/注入)不含 slice/substring');
{
  ok('prompts.ts 无 slice/substring', !promptSource.includes('.slice(') && !promptSource.includes('substring('));
  ok('注入.ts 无 slice/substring', !injectSource.includes('.slice(') && !injectSource.includes('substring('));
  const 指令文本段 = injectSource.slice(injectSource.indexOf('应注入的指令文本'), injectSource.indexOf('export function sync本幕指令'));
  ok('指令文本组装无截断', !指令文本段.includes('slice'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
