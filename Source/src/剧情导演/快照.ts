// 剧情导演 · 剧情账本怎么落盘、怎么读回、怎么迁移、怎么清空(同族户型, 与烟火 保存世界状态.ts 同款)。
//
// 存储结构 (v1):
// - 聊天变量 `剧情导演` 只存轻量元数据: 哪些楼层有快照(索引) + 清空层
// - 账本本体(章回/伏笔/冲突/弧线/当前指令/张力/统计)整体存在**楼层变量**里, 每次引擎推进写入
//   本次分析的最后一条楼层。快照随楼层存亡——删楼/重roll/切分支时账本自动回退。
// - 楼层 hash 校验沿用同族决定: 已移除(主AI楼层在快照写入后仍会变动, hash 失配会把正常游玩误判为"被编辑")。
// 这一层不碰 Vue / pinia, 平台访问全部走 useHost(), 可脱离界面单独测。
import { klona } from 'klona';
import { useHost } from './host';
import type { 导演账本, 本幕指令, 章回, 弧线, 冲突, 伏笔 } from './schema';
import { 节拍列表 } from './schema';
import { getSettings } from './settings';
import { toastError } from './toast';
import { 取层, 规范化条目 } from './字段表';
import { 空指标, 规范化指标, 计算判据 } from './指标';

export const STORAGE_KEY = '剧情导演';
export const DATA_VERSION = 1;
/** 楼层快照默认保留份数(设置「导演.快照保留份数」可调, 默认 30) */
export const SNAPSHOT_LIMIT = 30;

export function emptyData(): 导演账本 {
  return {
    版本: DATA_VERSION,
    章回: null,
    伏笔: [],
    冲突: [],
    弧线: [],
    当前指令: null,
    张力: { 当前: 0, 距上次高潮楼层: 0, 连续低张力: 0, 最近节拍: [] },
    下一伏笔编号: 1,
    下一指令编号: 1,
    已分析轮数: 0,
    已剧终: false,
    收官请求: false,
    指标: 空指标(),
    待决死亡: false,
    死亡抉择: '',
    统计: { 引擎调用次数: 0, 最后调用: 0 },
    锚点楼层: -1,
    处理到楼层: 0,
    清空层: 0,
  };
}

/** 引擎离线状态(熔断): 存**聊天变量 meta** —— 失败时账本快照根本不落盘, 存快照会丢; 也不存全局(跨聊天串味) */
export interface 离线状态 {
  连败次数: number;
  最后失败原因: string;
  最后失败时间: number;
  自动暂停: boolean;
}

/** 连败多少次自动暂停自动接管(防 token 白烧) */
export const 熔断阈值 = 3;

export function empty离线(): 离线状态 {
  return { 连败次数: 0, 最后失败原因: '', 最后失败时间: 0, 自动暂停: false };
}

export interface ChatMeta {
  版本: number;
  快照楼层: number[];
  清空层: number;
  /** 已剧终(与账本字段**双写**: 账本会随快照回退/清空, meta 不会, 故取两者之或) */
  已剧终: boolean;
  /** 熔断/离线可观测(独立于账本: 失败时账本根本没落盘) */
  离线: 离线状态;
}

function emptyMeta(): ChatMeta {
  return { 版本: DATA_VERSION, 快照楼层: [], 清空层: 0, 已剧终: false, 离线: empty离线() };
}

function 解析离线(raw: any): 离线状态 {
  if (!raw || typeof raw !== 'object') return empty离线();
  return {
    连败次数: Math.max(0, Number(raw.连败次数) || 0),
    最后失败原因: String(raw.最后失败原因 ?? ''),
    最后失败时间: Number(raw.最后失败时间) || 0,
    自动暂停: !!raw.自动暂停,
  };
}

function saveMeta(meta: ChatMeta) {
  try {
    useHost().vars.update(variables => {
      variables[STORAGE_KEY] = klona(meta);
      return variables;
    }, { type: 'chat' });
  } catch (error) {
    console.error('[剧情导演] 保存元数据失败:', error);
    toastError(`剧情导演: 保存元数据失败 ${error instanceof Error ? error.message : String(error)}`, '剧情导演');
  }
}

function loadMeta(): ChatMeta {
  let raw = null;
  try {
    raw = useHost().vars.get({ type: 'chat' })?.[STORAGE_KEY] ?? null;
  } catch {
    return emptyMeta();
  }
  if (!raw || typeof raw !== 'object') return emptyMeta();
  const 已剧终 = !!raw.已剧终;
  const 离线 = 解析离线(raw.离线);
  if (!Array.isArray(raw.快照楼层)) {
    return { 版本: DATA_VERSION, 快照楼层: [], 清空层: typeof raw.清空层 === 'number' ? raw.清空层 : 0, 已剧终, 离线 };
  }
  return {
    版本: DATA_VERSION,
    快照楼层: raw.快照楼层.filter((floor: unknown) => typeof floor === 'number' && Number.isFinite(floor)),
    清空层: typeof raw.清空层 === 'number' ? raw.清空层 : 0,
    已剧终,
    离线,
  };
}

// ---------------------------------------------------------------------------
// 熔断/离线 与 已剧终 的读写(都落在聊天变量 meta, **不依赖账本快照**)
// ---------------------------------------------------------------------------

export function 读离线状态(): 离线状态 {
  try {
    return loadMeta().离线;
  } catch {
    return empty离线();
  }
}

/** 记一次推进失败: 连败 +1; 达到阈值 → 自动暂停自动接管 */
export function 记推进失败(原因: string): 离线状态 {
  try {
    const meta = loadMeta();
    const 连败次数 = Math.max(0, Number(meta.离线?.连败次数) || 0) + 1;
    meta.离线 = {
      连败次数,
      最后失败原因: String(原因 ?? ''),
      最后失败时间: Date.now(),
      自动暂停: 连败次数 >= 熔断阈值,
    };
    saveMeta(meta);
    return meta.离线;
  } catch (error) {
    console.warn('[剧情导演] 记录推进失败失败:', error);
    return empty离线();
  }
}

/** 一次成功 → 连败清零、自动暂停解除(本来就没计数时不写存储) */
export function 清推进失败(): 离线状态 {
  try {
    const meta = loadMeta();
    const 之前 = meta.离线;
    if (之前.连败次数 === 0 && !之前.最后失败原因 && !之前.自动暂停) return 之前;
    meta.离线 = empty离线();
    saveMeta(meta);
    return meta.离线;
  } catch (error) {
    console.warn('[剧情导演] 清除推进失败计数失败:', error);
    return empty离线();
  }
}

/** 面板「恢复自动接管」(false) / 需要时临时暂停(true; 保留上次失败原因便于展示) */
export function 设自动暂停(值: boolean): 离线状态 {
  try {
    const meta = loadMeta();
    meta.离线 = 值
      ? {
          连败次数: Math.max(熔断阈值, Number(meta.离线?.连败次数) || 0),
          最后失败原因: String(meta.离线?.最后失败原因 ?? ''),
          最后失败时间: Number(meta.离线?.最后失败时间) || Date.now(),
          自动暂停: true,
        }
      : empty离线();
    saveMeta(meta);
    return meta.离线;
  } catch (error) {
    console.warn('[剧情导演] 更新自动暂停失败:', error);
    return empty离线();
  }
}

export function 读已剧终(): boolean {
  try {
    return !!loadMeta().已剧终;
  } catch {
    return false;
  }
}

/** 写「已剧终」到 chat 变量 meta(账本侧的字段由调用方一起写, 构成双写) */
export function 写已剧终(值: boolean): boolean {
  try {
    const meta = loadMeta();
    meta.已剧终 = !!值;
    saveMeta(meta);
    return true;
  } catch (error) {
    console.warn('[剧情导演] 写已剧终到 meta 失败:', error);
    return false;
  }
}

/**
 * 手动全书结算 · **第一段**(规格 B2): 用户拍板要落幕 → 记账本 `收官请求`, 下一轮由 `构造本幕指令` 编排收束幕。
 * **幂等**: 已经有请求、或已经剧终 → 返回 false 且什么都不改(重复点击攒不出多道收官指令)。
 * 纯函数(不碰平台): 落盘由调用方 `saveData` 负责。
 */
export function 请求收官(账本: 导演账本): boolean {
  if (账本.已剧终 || 账本.收官请求) return false;
  账本.收官请求 = true;
  return true;
}

/**
 * 落幕**拍板**(规格 B2 第二段 + B3): 置 `已剧终`、**清掉 `收官请求`**(不清的话, 将来恢复用会一直出收束幕),
 * 并把"落幕那一刻"的判据快照进 `指标.终值` —— **只在这里写一次, 之后只读不重算**(账本还会随删楼回退变化, 成绩单不能跟着变)。
 * chat meta 侧的 `写已剧终(true)` 仍由调用方做: 双写语义不变, 而纯函数不碰平台才能脱离酒馆单测。
 */
export function 落定剧终(账本: 导演账本): 导演账本 {
  账本.已剧终 = true;
  账本.收官请求 = false;
  账本.指标 = 账本.指标 ?? 空指标();
  账本.指标.终值 = 计算判据(账本);
  return 账本;
}

/**
 * 唯一恢复入口(规格 B4): 清除已剧终 —— **连 `收官请求` 与 `指标.终值` 一起清**。
 * 前者不收拾就会继续出收束幕; 后者是"那一刻的成绩单", 恢复游玩后继续挂着会误导(重新剧全会再写一次)。
 */
export function 解除剧终(账本: 导演账本): 导演账本 {
  账本.已剧终 = false;
  账本.收官请求 = false;
  账本.指标 = 账本.指标 ?? 空指标();
  账本.指标.终值 = null;
  return 账本;
}

function 规范化章回(raw: any): 章回 | null {
  if (!raw || typeof raw !== 'object') return null;
  return 规范化条目<章回>(取层('章回'), raw);
}

function 规范化指令(raw: any): 本幕指令 | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    编号: Number(raw.编号) || 0,
    节拍: 节拍列表.includes(raw.节拍) ? raw.节拍 : '阴影',
    硬性要求: String(raw.硬性要求 ?? ''),
    伏笔现场: String(raw.伏笔现场 ?? ''),
    禁止事项: String(raw.禁止事项 ?? ''),
    生成楼层: Number(raw.生成楼层) || 0,
    核验升级次数: Number(raw.核验升级次数) || 0,
    已跳过: !!raw.已跳过,
    代码调整: Array.isArray(raw.代码调整) ? raw.代码调整.map((x: unknown) => String(x)) : [],
    档位: Number(raw.档位) || 0,
    红线: Array.isArray(raw.红线) ? raw.红线.map((x: unknown) => String(x)) : [],
  };
}

/** 把一份楼层快照(可能是旧格式)按当前结构重建 */
function sanitizeSnapshot(snapshot: Record<string, any>): 导演账本 {
  const data = emptyData();
  data.章回 = 规范化章回(snapshot.章回);
  const 当前章号 = Number(data.章回?.章号) || 0;
  if (Array.isArray(snapshot.伏笔)) {
    data.伏笔 = (snapshot.伏笔 as any[]).filter(Boolean).map((x: any) => {
      const 条 = 规范化条目<伏笔>(取层('伏笔'), x);
      // 老账本(v1.0)只有 埋设层、没有 埋设章: 回填当前章号 —— 不清空、不崩(指标账要靠它)
      return { ...条, 埋设章: Number(条.埋设章) || 当前章号 };
    });
  }
  if (Array.isArray(snapshot.冲突)) data.冲突 = (snapshot.冲突 as any[]).filter(Boolean).map((x: any) => 规范化条目<冲突>(取层('冲突'), x));
  if (Array.isArray(snapshot.弧线)) data.弧线 = (snapshot.弧线 as any[]).filter(Boolean).map((x: any) => 规范化条目<弧线>(取层('弧线'), x));
  data.当前指令 = 规范化指令(snapshot.当前指令);
  if (snapshot.张力 && typeof snapshot.张力 === 'object') {
    data.张力 = {
      当前: Number(snapshot.张力.当前) || 0,
      距上次高潮楼层: Number(snapshot.张力.距上次高潮楼层) || 0,
      连续低张力: Number(snapshot.张力.连续低张力) || 0,
      最近节拍: Array.isArray(snapshot.张力.最近节拍) ? snapshot.张力.最近节拍.filter((x: unknown) => 节拍列表.includes(x as any)) : [],
    };
  }
  /** 老账本没有 指标 / 已剧终: 默认填充, 旧数据一律保留。
   *  第二参传账本伏笔: 老账本没有队列计数器(累计埋设/累计了结)时要用**现存伏笔**播种(见 指标.ts)。 */
  data.指标 = 规范化指标(snapshot.指标, data.伏笔);
  data.已剧终 = !!snapshot.已剧终;
  /** 手动全书结算的标记(规格 B): 老账本没有 → 默认 false, 不崩不伪造 */
  data.收官请求 = !!snapshot.收官请求;
  data.下一伏笔编号 = Math.max(1, Number(snapshot.下一伏笔编号) || (data.伏笔.reduce((m, x) => Math.max(m, x.编号), 0) + 1));
  data.下一指令编号 = Math.max(1, Number(snapshot.下一指令编号) || ((data.当前指令?.编号 ?? 0) + 1));
  data.已分析轮数 = Number(snapshot.已分析轮数) || 0;
  data.待决死亡 = !!snapshot.待决死亡;
  data.死亡抉择 = ['视角转移', '世界观内复活', '剧终结算'].includes(snapshot.死亡抉择) ? snapshot.死亡抉择 : '';
  if (snapshot.统计 && typeof snapshot.统计 === 'object') {
    data.统计 = { 引擎调用次数: Number(snapshot.统计.引擎调用次数) || 0, 最后调用: Number(snapshot.统计.最后调用) || 0 };
  }
  return data;
}

/** 读取账本: 从最新快照楼层往前找第一份**有效**快照(楼层被删/swipe 无快照则继续往前) */
export function loadData(): 导演账本 {
  try {
    const meta = loadMeta();
    const floors = [...meta.快照楼层].sort((a, b) => a - b);
    let lastId = -1;
    try {
      lastId = useHost().chat.lastMessageId();
    } catch {
      lastId = -1;
    }
    if (floors.length > 0 && lastId < 0) {
      return { ...emptyData(), 清空层: meta.清空层, 已剧终: !!meta.已剧终 };
    }
    const missingFloors: number[] = [];
    let result: 导演账本 | null = null;
    for (let i = floors.length - 1; i >= 0; i--) {
      const floorId = floors[i];
      if (floorId > lastId) {
        missingFloors.push(floorId);
        continue;
      }
      let message = null;
      try {
        message = useHost().chat.messages(floorId)[0] ?? null;
      } catch {
        message = null;
      }
      if (!message) continue;
      let snapshot = null;
      try {
        snapshot = useHost().vars.get({ type: 'message', message_id: floorId })?.[STORAGE_KEY] ?? null;
      } catch {
        snapshot = null;
      }
      if (!snapshot || typeof snapshot !== 'object' || snapshot.楼层 !== floorId) continue;
      result = {
        ...sanitizeSnapshot(snapshot),
        锚点楼层: floorId,
        处理到楼层: Number(snapshot.处理到楼层) || 0,
        清空层: meta.清空层,
        // 已剧终双写取"或": 账本侧随快照回退, meta 侧不会 → 剧终不该被删楼/回退悄悄撤销
        已剧终: !!snapshot.已剧终 || !!meta.已剧终,
      };
      break;
    }
    if (missingFloors.length > 0) {
      meta.快照楼层 = meta.快照楼层.filter(floor => !missingFloors.includes(floor));
      saveMeta(meta);
    }
    return result ?? { ...emptyData(), 清空层: meta.清空层, 已剧终: !!meta.已剧终 };
  } catch (error) {
    console.warn('[剧情导演] 读取账本失败, 使用空账本:', error);
    return emptyData();
  }
}

function buildSnapshotPayload(data: 导演账本, anchorFloor: number, processedFloor: number) {
  let message = null;
  try {
    message = useHost().chat.messages(anchorFloor)[0] ?? null;
  } catch {
    message = null;
  }
  if (!message) return null;
  return {
    版本: DATA_VERSION,
    楼层: anchorFloor,
    处理到楼层: processedFloor,
    章回: data.章回 ? klona(data.章回) : null,
    伏笔: klona(data.伏笔 ?? []),
    冲突: klona(data.冲突 ?? []),
    弧线: klona(data.弧线 ?? []),
    当前指令: data.当前指令 ? klona(data.当前指令) : null,
    张力: klona(data.张力),
    已剧终: !!data.已剧终,
    指标: klona(data.指标 ?? 空指标()),
    下一伏笔编号: data.下一伏笔编号,
    下一指令编号: data.下一指令编号,
    已分析轮数: data.已分析轮数,
    待决死亡: data.待决死亡,
    死亡抉择: data.死亡抉择,
    统计: { 引擎调用次数: data.统计?.引擎调用次数 ?? 0, 最后调用: data.统计?.最后调用 ?? 0 },
  };
}

function writeFloorVariables(payload: Record<string, any>) {
  useHost().vars.update(variables => {
    variables[STORAGE_KEY] = payload;
    return variables;
  }, { type: 'message', message_id: payload.楼层 });
}

function snapshotLimit(): number {
  let limit = SNAPSHOT_LIMIT;
  try {
    const configured = getSettings().导演.快照保留份数;
    if (Number.isFinite(configured) && configured >= 1) limit = Math.min(100, Math.round(configured));
  } catch {
    // 设置读取失败用默认值
  }
  return limit;
}

/**
 * 把账本整体写成一份楼层快照。@param consumeClearLayer 成功写入后是否清零「清空层」。
 */
export function writeStateSnapshot(data: 导演账本, anchorFloor: number, processedFloor: number, consumeClearLayer: boolean, metaInput: ChatMeta | null = null): boolean {
  const meta = metaInput ?? loadMeta();
  const payload = buildSnapshotPayload(data, anchorFloor, processedFloor);
  if (!payload) {
    console.warn(`[剧情导演] 楼层 #${anchorFloor} 不存在, 无法保存快照`);
    return false;
  }
  try {
    writeFloorVariables(payload);
  } catch (error) {
    console.error(`[剧情导演] 写入楼层快照失败(楼层 #${anchorFloor}):`, error);
    return false;
  }
  meta.快照楼层 = meta.快照楼层.filter(floor => floor !== anchorFloor);
  meta.快照楼层.push(anchorFloor);
  meta.快照楼层.sort((a, b) => a - b);
  const limit = snapshotLimit();
  while (meta.快照楼层.length > limit) {
    const removed = meta.快照楼层.shift() as number;
    try {
      useHost().vars.del(STORAGE_KEY, { type: 'message', message_id: removed });
    } catch {
      // 楼层可能已不存在, 忽略
    }
  }
  if (consumeClearLayer) meta.清空层 = 0;
  saveMeta(meta);
  console.info(`[剧情导演] 快照写入楼层 #${anchorFloor} (章回=${payload.章回 ? payload.章回.章号 : '无'}, 伏笔=${payload.伏笔.length}, 冲突=${payload.冲突.length}, 弧线=${payload.弧线.length}, 保留${meta.快照楼层.length}/${limit}份)`);
  return true;
}

/** 界面手动编辑用: 以最新楼层为锚点写入快照, 不改变进度 */
export function saveData(data: 导演账本): boolean {
  try {
    const anchor = useHost().chat.lastMessageId();
    return writeStateSnapshot(data, anchor, typeof data.处理到楼层 === 'number' ? data.处理到楼层 : 0, false);
  } catch (error) {
    console.error('[剧情导演] 保存账本失败:', error);
    toastError(`剧情导演: 保存失败 ${error instanceof Error ? error.message : String(error)}`, '剧情导演');
    return false;
  }
}

export interface 存档结果 {
  落盘: boolean;
  锚点楼层: number;
  数据: 导演账本;
  说明: string;
}

/** 一轮引擎推进跑完后的落盘: 锚点 = 本次分析的最后一条楼层, 成功才消费清空层 */
export function 保存推进结果(data: 导演账本, 锚点楼层: number): 存档结果 {
  data.处理到楼层 = 锚点楼层;
  data.清空层 = 0;
  const 落盘 = writeStateSnapshot(data, 锚点楼层, 锚点楼层, true);
  return {
    落盘,
    锚点楼层: 落盘 ? 锚点楼层 : -1,
    数据: 落盘 ? { ...data, 锚点楼层 } : data,
    说明: 落盘 ? `账本已存进楼层 #${锚点楼层}` : `楼层 #${锚点楼层} 写不进去, 快照没落盘`,
  };
}

/** 撤销指定楼层的快照(面板「重新推进」用) */
export function discardSnapshotAt(floorId: number): boolean {
  const meta = loadMeta();
  if (!meta.快照楼层.includes(floorId)) return false;
  meta.快照楼层 = meta.快照楼层.filter(floor => floor !== floorId);
  saveMeta(meta);
  try {
    useHost().vars.del(STORAGE_KEY, { type: 'message', message_id: floorId });
  } catch {
    // 忽略
  }
  return true;
}

/** 清空全部账本数据: 物理删除所有楼层快照 + 重置元数据, 记录当前楼层为「清空层」 */
export function clearAllData(): number {
  const meta = loadMeta();
  for (const floorId of meta.快照楼层) {
    try {
      useHost().vars.del(STORAGE_KEY, { type: 'message', message_id: floorId });
    } catch {
      // 忽略
    }
  }
  const fresh = emptyMeta();
  try {
    fresh.清空层 = useHost().chat.lastMessageId();
  } catch {
    // 保持 0
  }
  saveMeta(fresh);
  return fresh.清空层;
}
