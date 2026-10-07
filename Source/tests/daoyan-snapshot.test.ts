// 剧情导演 · 存储层 / 删楼三场景 —— C8 + C10
// 快照.ts 通过可替换宿主访问平台, 不装酒馆也能跑: 写读快照 / 删尾楼回退 / 删超窗口归零 /
// 保留份数默认 30 与可调 / 修笔落盘 / 清空层。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { clearAllData, emptyData, loadData, saveData, SNAPSHOT_LIMIT, STORAGE_KEY, writeStateSnapshot } from '../src/剧情导演/快照';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

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

function makeFakePlatform(全局设置: Record<string, any> = {}) {
  const floors: Record<string, { role: string; message: string; is_hidden: boolean }> = {};
  const floorVars: Record<string, any> = {};
  const deleted: string[] = [];
  let chatVars: Record<string, any> = {};
  const host: any = {
    vars: {
      get(option: any) {
        if (option.type === 'chat') return chatVars;
        if (option.type === 'global') return { 剧情导演_settings: 全局设置 };
        const id = String(option.message_id);
        if (!(id in floors)) throw new Error(`楼层 #${id} 不存在`);
        return floorVars[id] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          chatVars = updater(chatVars) ?? chatVars;
          return chatVars;
        }
        const id = String(option.message_id);
        if (!(id in floors)) throw new Error(`楼层 #${id} 不存在`);
        floorVars[id] = updater(floorVars[id] ?? {}) ?? floorVars[id];
        return floorVars[id];
      },
      del(path: string, option: any) {
        if (option.type === 'chat') {
          delete chatVars[path];
          return { variables: chatVars, delete_occurred: true };
        }
        const id = String(option.message_id);
        deleted.push(id);
        if (floorVars[id]) delete floorVars[id][path];
        return { variables: floorVars[id] ?? {}, delete_occurred: true };
      },
    },
    chat: {
      messages(range: any, options: any = {}) {
        const parts = typeof range === 'number' ? [range] : String(range).split('-').map(Number);
        const [from, to] = parts.length === 2 ? parts : [parts[0], parts[0]];
        const out = [];
        for (let i = from; i <= to; i++) {
          const m = floors[String(i)];
          if (!m) continue;
          if (options.role && options.role !== 'all' && m.role !== options.role) continue;
          out.push({ message_id: i, name: 'AI', role: m.role, is_hidden: !!m.is_hidden, message: m.message, data: {}, extra: {} });
        }
        return out;
      },
      lastMessageId() {
        const ids = Object.keys(floors).map(Number);
        return ids.length > 0 ? Math.max(...ids) : -1;
      },
    },
  };
  return {
    host,
    floors,
    floorVars,
    deleted,
    chatVars: () => chatVars,
    addFloor(id: number, message = `第${id}楼正文`) {
      floors[String(id)] = { role: 'assistant', message, is_hidden: false };
    },
  };
}

function 准备(全局设置: Record<string, any> = {}) {
  const p = makeFakePlatform(全局设置);
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  resetSettingsReadCacheForTest();
  return p;
}

console.log('\n[C8] 空聊天 → 空账本, 不往聊天变量写垃圾');
{
  const p = 准备();
  const d = loadData();
  check('锚点楼层 = -1', d.锚点楼层, -1);
  check('四本账为空', [d.章回, d.伏笔, d.冲突, d.弧线, d.当前指令], [null, [], [], [], null]);
  check('聊天变量未写', p.chatVars(), {});
}

console.log('\n[C6] 写快照 → 读回一致, 且含「当前指令」本体');
{
  const p = 准备();
  p.addFloor(5);
  const data = 账本({
    章回: { 章号: 2, 主题: '夺嫡', 计划高潮: '朝堂对峙', 进度: '推进' },
    伏笔: [{ 编号: 3, 内容: '缺角的玉佩', 埋设层: 2, 埋设章: 2, 状态: '发酵', 回收窗口: '第3章收束前', 关联冲突: '夺嫡' }],
    冲突: [{ 名: '夺嫡', 对立面: '二皇子', 赌注: '继承权', 强度: 6, 阶段: '升级', 下一步: '逼宫', 顶回次数: 0 }],
    弧线: [{ 角色: '主角', 缺口: '优柔寡断', 阶段: '启程', 下一步契机: '师门变故' }],
    当前指令: { 编号: 4, 节拍: '受挫', 硬性要求: '计划失败', 伏笔现场: '#3 兑现', 禁止事项: '不许解决', 生成楼层: 5, 核验升级次数: 1, 已跳过: false, 代码调整: ['张力曲线：安排喘息幕'], 档位: 3, 红线: ['主角不死'] },
    张力: { 当前: 6, 距上次高潮楼层: 1, 连续低张力: 0, 最近节拍: ['受挫', '反转'] },
    下一伏笔编号: 4,
    下一指令编号: 5,
    已分析轮数: 7,
    统计: { 引擎调用次数: 7, 最后调用: 111 },
    处理到楼层: 5,
    清空层: 3,
  });
  check('写入成功', writeStateSnapshot(data, 5, 5, true), true);
  const back = loadData();
  check('章回读回一致', back.章回, data.章回);
  check('伏笔读回一致', back.伏笔, data.伏笔);
  check('冲突读回一致', back.冲突, data.冲突);
  check('当前指令读回一致(核验依据)', back.当前指令, data.当前指令);
  check('张力读回一致', back.张力, data.张力);
  check('进度/发号器读回', [back.下一伏笔编号, back.下一指令编号, back.已分析轮数], [4, 5, 7]);
  check('清空层被本次写入消费', back.清空层, 0);
  check('快照按键写入楼层变量', p.floorVars['5'][STORAGE_KEY].楼层, 5);
}

console.log('\n[C10 场景1] 删尾楼 = 账本精确回退到更早快照');
{
  const p = 准备();
  p.addFloor(3);
  p.addFloor(7);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: '起', 计划高潮: '', 进度: '铺垫' }, 伏笔: [{ 编号: 1, 内容: '老线头', 埋设层: 1, 状态: '埋下', 回收窗口: '', 关联冲突: '' }], 下一伏笔编号: 2 }), 3, 3, false);
  writeStateSnapshot(账本({ 章回: { 章号: 2, 主题: '夺嫡', 计划高潮: '', 进度: '推进' }, 伏笔: [{ 编号: 1, 内容: '老线头', 埋设层: 1, 状态: '已引爆', 回收窗口: '', 关联冲突: '' }], 下一伏笔编号: 2 }), 7, 7, false);
  check('当前读到最新快照', loadData().章回?.章号, 2);
  delete p.floors['7'];
  const back = loadData();
  check('删尾楼 → 章回回退', back.章回?.章号, 1);
  check('伏笔状态也跟着回退', back.伏笔[0].状态, '埋下');
  check('锚点回退', back.锚点楼层, 3);
  check('失效索引被清', p.chatVars()[STORAGE_KEY].快照楼层, [3]);
}

console.log('\n[C10 场景2] 删超窗口(锚点被裁光) → 账本归零, 重新冷启动');
{
  const p = 准备({ 导演: { 快照保留份数: 2 } });
  p.addFloor(1);
  p.addFloor(2);
  p.addFloor(3);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: 'a', 计划高潮: '', 进度: '铺垫' } }), 1, 1, false);
  writeStateSnapshot(账本({ 章回: { 章号: 2, 主题: 'b', 计划高潮: '', 进度: '铺垫' } }), 2, 2, false);
  writeStateSnapshot(账本({ 章回: { 章号: 3, 主题: 'c', 计划高潮: '', 进度: '铺垫' } }), 3, 3, false);
  check('保留份数=2: 只留最新两层', p.chatVars()[STORAGE_KEY].快照楼层, [2, 3]);
  // 把全部锚点楼层删光
  delete p.floors['2'];
  delete p.floors['3'];
  const back = loadData();
  check('锚点归零 = -1', back.锚点楼层, -1);
  check('章回归零(重新冷启动)', back.章回, null);
  check('索引被清空', p.chatVars()[STORAGE_KEY].快照楼层, []);
}

console.log(`\n[C10] 快照保留份数: 默认 ${SNAPSHOT_LIMIT}(=30), 可调 1~100`);
{
  const p = 准备();
  for (let i = 1; i <= SNAPSHOT_LIMIT + 2; i++) p.addFloor(i);
  for (let i = 1; i <= SNAPSHOT_LIMIT + 2; i++) writeStateSnapshot(账本({ 章回: { 章号: i, 主题: `t${i}`, 计划高潮: '', 进度: '铺垫' } }), i, i, false);
  check('默认保留 30 份', p.chatVars()[STORAGE_KEY].快照楼层.length, SNAPSHOT_LIMIT);
  check('最早两层被物理删除', p.deleted, ['1', '2']);

  const p2 = 准备({ 导演: { 快照保留份数: 3 } });
  for (let i = 1; i <= 5; i++) p2.addFloor(i);
  for (let i = 1; i <= 5; i++) writeStateSnapshot(账本({ 章回: { 章号: i, 主题: `t${i}`, 计划高潮: '', 进度: '铺垫' } }), i, i, false);
  check('可调为 3 份', p2.chatVars()[STORAGE_KEY].快照楼层, [3, 4, 5]);
}

console.log('\n[C10] 面板修笔: saveData 以最新楼层为锚点写回, 不改进度');
{
  const p = 准备();
  p.addFloor(1);
  p.addFloor(6);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: '旧', 计划高潮: '', 进度: '铺垫' } }), 1, 1, false);
  const 修 = loadData();
  修.章回 = { 章号: 9, 主题: '手改', 计划高潮: '', 进度: '收束' };
  check('saveData 成功', saveData(修), true);
  const back = loadData();
  check('修笔内容已保存', back.章回?.主题, '手改');
  check('锚点 = 最新楼层', back.锚点楼层, 6);
}

console.log('\n[C8] 清空: 物理删快照 + 重置元数据 + 记录清空层');
{
  const p = 准备();
  p.addFloor(2);
  p.addFloor(9);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: 'a', 计划高潮: '', 进度: '铺垫' } }), 2, 2, false);
  writeStateSnapshot(账本({ 章回: { 章号: 2, 主题: 'b', 计划高潮: '', 进度: '铺垫' } }), 9, 9, false);
  const layer = clearAllData();
  check('清空层 = 最后楼层', layer, 9);
  check('快照被物理删除', p.deleted, ['2', '9']);
  check('清空后读到空账本', loadData().章回, null);
  check('清空层仍生效', loadData().清空层, 9);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
