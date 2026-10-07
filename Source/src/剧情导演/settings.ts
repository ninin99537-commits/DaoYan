import { klona } from 'klona';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useHost } from './host';
import { SettingsSchema, type Settings } from './schema';

const SETTINGS_KEY = '剧情导演_settings';

/** 全局设置读取缓存(写入即失效 / 读失败即失效) */
let globalReadCache: Settings | null = null;
let globalReadTime = 0;

/**
 * 是否**成功读到过**全局设置。
 * P1 事故根因(1): 读失败时静默返回默认值(密钥=空), 随后 300ms 防抖把这个"默认值"写回存储
 * → **用户的接口密钥/地址被抹掉**。所以: 没成功读到之前**一律禁止写回**。
 */
let 可写回 = false;
/** 最近一次"成功读到"的设置快照: 写回前与它比对, 只有**用户真正改动过的字段**才落盘 */
let 写回基线: Settings | null = null;

function invalidateReadCache() {
  globalReadCache = null;
  globalReadTime = 0;
}

/** 用例用: 清掉读取缓存 + 重置写回闸门 */
export function resetSettingsReadCacheForTest() {
  invalidateReadCache();
  可写回 = false;
  写回基线 = null;
}

function 是普通对象(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 深合并: `prev` 里**本次没提到的子字段**必须原样保留。
 * P1 事故根因(2): 旧实现 `{ ...prev, ...settings }` 是**浅合并**——`接口` 是顶层键,
 * 于是整个 `接口` 对象被内存里那份(可能陈旧/残缺)覆盖, 地址与密钥一起没了。
 * (数组与标量按原语义整体替换; E 的可选字段传 undefined 表示"不涉及", 不会清空 prev。)
 */
function 深合并(prev: any, next: any): any {
  if (!是普通对象(prev) || !是普通对象(next)) return klona(next);
  const 结果: Record<string, any> = klona(prev);
  for (const [键, 值] of Object.entries(next)) {
    if (值 === undefined) continue;
    结果[键] = 是普通对象(结果[键]) && 是普通对象(值) ? 深合并(结果[键], 值) : klona(值);
  }
  return 结果;
}

/** 相对写回基线的差异: 只收集**真正改动过**的字段(递归); 无变化 → {有:false} */
function 取差异(基线: any, 当前: any): { 有: boolean; 值: any } {
  if (是普通对象(基线) && 是普通对象(当前)) {
    const 差: Record<string, any> = {};
    let 有 = false;
    for (const [键, 值] of Object.entries(当前)) {
      const 子 = 取差异(基线[键], 值);
      if (子.有) {
        差[键] = 子.值;
        有 = true;
      }
    }
    return { 有, 值: 差 };
  }
  let 同: boolean;
  try {
    同 = JSON.stringify(基线) === JSON.stringify(当前);
  } catch {
    同 = 基线 === 当前;
  }
  return { 有: !同, 值: klona(当前) };
}

/**
 * 读全局设置。成功 → 打开写回闸门并刷新基线；失败(抛错/格式异常/解析失败) → **关闭闸门**,
 * 返回默认值但**绝不落盘**(P1 事故的根因(3): 读失败必须与"没配置"区分开)。
 */
function 读全局设置(): { 设置: Settings; 成功: boolean } {
  let 原始: any;
  try {
    原始 = useHost().vars.get({ type: 'global' })?.[SETTINGS_KEY];
  } catch (error) {
    console.warn('[剧情导演] 读取全局设置失败, 已暂停写回(绝不用默认值覆盖真数据):', error);
    可写回 = false;
    return { 设置: SettingsSchema.parse({}), 成功: false };
  }
  if (原始 === undefined || 原始 === null) {
    // 首次使用: 成功读到"还没配置" → 允许写回(否则新装用户永远存不下设置), 基线=默认值
    const 默认 = SettingsSchema.parse({});
    可写回 = true;
    写回基线 = klona(默认);
    return { 设置: 默认, 成功: true };
  }
  if (!是普通对象(原始)) {
    console.warn('[剧情导演] 全局设置格式异常(不是对象), 已暂停写回:', 原始);
    可写回 = false;
    return { 设置: SettingsSchema.parse({}), 成功: false };
  }
  const 解析 = SettingsSchema.safeParse(原始);
  if (!解析.success) {
    console.warn('[剧情导演] 全局设置解析失败, 已暂停写回(请检查/清理全局变量 剧情导演_settings):', 解析.error?.message);
    可写回 = false;
    return { 设置: SettingsSchema.parse({}), 成功: false };
  }
  可写回 = true;
  写回基线 = klona(解析.data);
  return { 设置: 解析.data, 成功: true };
}

/** 写回: 只把**相对基线改动过的字段**深合并进存储里那份(其余一律保留) */
function saveToGlobalMerged(settings: Settings) {
  if (!可写回) {
    console.warn('[剧情导演] 尚未成功读到全局设置, 本次改动不落盘(防止用默认值覆盖已配置的接口密钥等)');
    return;
  }
  const 差 = 取差异(写回基线 ?? {}, settings);
  if (!差.有) return; // 初始化/解析填充这类"与读到的一致"的变化不写盘
  try {
    useHost().vars.update(variables => {
      const prev = variables[SETTINGS_KEY];
      variables[SETTINGS_KEY] = 深合并(是普通对象(prev) ? prev : {}, 差.值);
      return variables;
    }, { type: 'global' });
    写回基线 = klona(深合并(写回基线 ?? {}, 差.值));
    invalidateReadCache();
  } catch (error) {
    console.warn('[剧情导演] 保存全局设置失败:', error);
  }
}

function loadSettings(): Settings {
  return 读全局设置().设置;
}

export const useSettingsStore = defineStore('daoyan-settings', () => {
  const settings = ref<Settings>(loadSettings());
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    settings,
    value => {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveToGlobalMerged(klona(value));
      }, 300);
    },
    { deep: true },
  );
  return { settings };
});

/** 立即落盘设置: 「测试连接」这类"马上要用刚输入的配置"的场景(平时靠 300ms 防抖) */
export function 立即保存设置(settings: Settings) {
  saveToGlobalMerged(klona(settings));
  invalidateReadCache();
}

/** 读取设置: 优先实时读全局, 读不到回退本地 store; 500ms 窗口内不重复打存储 */
export function getSettings(): Settings {
  const now = Date.now();
  if (now - globalReadTime <= 500) {
    return globalReadCache ?? useSettingsStore().settings;
  }
  globalReadTime = now;
  // 走同一条读取路径: 成功则刷新写回基线, 失败则关闭写回闸门(不会把回退的那份写回存储)
  const 结果 = 读全局设置();
  if (结果.成功) {
    globalReadCache = 结果.设置;
    return 结果.设置;
  }
  globalReadCache = null;
  return useSettingsStore().settings;
}
