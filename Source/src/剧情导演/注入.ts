// 剧情导演 · 双层注入:
//   事实层 → 世界书常驻条目「编剧备忘」(蓝灯常开、防递归、切聊天重写、空则删, 同族范式);
//   指令层 → injectPrompts + GENERATION_AFTER_COMMANDS(in_chat depth 0, 幂等重注, 绝不 await 慢 API)。
import { useHost } from './host';
import { buildInjectionPrompt, build本幕指令 } from './prompts';
import type { Settings, 导演账本 } from './schema';
import { WORLDBOOK_ENTRY_NAME } from './state';
import { toastWarning } from './toast';

function is导演条目(entry: any): boolean {
  return entry?.name === WORLDBOOK_ENTRY_NAME || entry?.comment === WORLDBOOK_ENTRY_NAME || entry?.extra?.daoyan === true;
}

/** ACU 剧情推进的条目屏蔽词: 命中则条目不进剧情推进上下文 */
const ACU_BLOCKED_KEYWORDS = ['规则', '思维链', 'cot', 'MVU', 'mvu', '变量', '状态', 'Status', 'Rule', 'rule', '检定', '判断', '叙事', '文风', 'InitVar', '格式'];

function sanitizeEntryName(currentName: string): string {
  const name = String(currentName || '').trim();
  return ACU_BLOCKED_KEYWORDS.some(keyword => name.includes(keyword)) ? WORLDBOOK_ENTRY_NAME : name;
}

/** 账本是否有可注入的事实(章回/冲突/伏笔/弧线任一非空) */
export function 有账本事实(data: 导演账本): boolean {
  return !!(data?.章回 || (data?.冲突?.length ?? 0) > 0 || (data?.伏笔?.length ?? 0) > 0 || (data?.弧线?.length ?? 0) > 0);
}

let warnedNoWorldbook = false;

/** 事实层落点(哪本世界书 + 为什么选它) */
export interface 事实层落点 {
  名: string;
  来源: string;
}

/**
 * 错误对象的**可读文本**。真机实测遇到过 `getWorldbook` 抛出的错误对象是 `{}`(无 message)——
 * 直接 `console.error('...失败:', error)` 在日志页只会看到 `{}`, 等于静默降级。这里必须兜底。
 */
export function 错误文本(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  const 任意 = error as any;
  if (任意 && typeof 任意 === 'object') {
    if (typeof 任意.message === 'string' && 任意.message) return 任意.message;
    try {
      const 串 = JSON.stringify(任意);
      if (串 && 串 !== '{}') return 串;
    } catch {
      // 循环引用等 → 落到下面的类型名
    }
    return `[无法序列化的对象 ${Object.prototype.toString.call(任意)}]`;
  }
  return String(error);
}

/** 探测世界书**是否真的可读**: 卡里 extensions.world 指向未安装/改名的书时 getWorldbook 会抛错 */
async function 世界书可读(名: string | null | undefined): Promise<boolean> {
  if (!名) return false;
  try {
    await useHost().worldbook.entries(名);
    return true;
  } catch {
    return false;
  }
}

/**
 * 事实层落点解析 —— **按可用性解析, 不盲写 primary**(E1 真机缺陷的修法)。
 * 顺序(dsh 审定):
 *   ① 角色卡主世界书(primary): **先探测存在性**, 悬空/未安装就跳过;
 *   ② 角色卡副世界书(additional)里**已经有我们条目**的那本(避免在多本里重复注入同一条);
 *   ③ 聊天世界书(聊天文件级, 与账本同隔离粒度);
 *   ④ 仅当"确实要写入"时: 取/新建专属**聊天**世界书(酒馆标准能力, 自动对当前聊天生效, **不改用户角色卡**)。
 * 全不可用 → 落点 null + 可读的 失败原因(**不抛穿、不静默**)。
 */
export async function 解析事实层落点(
  选项: { 允许新建: boolean } = { 允许新建: true },
): Promise<{ 落点: 事实层落点 | null; 悬空: string | null; 失败原因: string }> {
  let 悬空: string | null = null;
  let 附加: string[] = [];
  try {
    const 绑定 = useHost().worldbook.boundNames();
    附加 = [...(绑定?.additional ?? [])];
    if (绑定?.primary) {
      if (await 世界书可读(绑定.primary)) return { 落点: { 名: 绑定.primary, 来源: '角色卡主世界书' }, 悬空: null, 失败原因: '' };
      悬空 = 绑定.primary;
    }
  } catch (error) {
    return { 落点: null, 悬空: null, 失败原因: `读取角色卡世界书绑定失败: ${错误文本(error)}` };
  }

  const 探测过: string[] = [];
  for (const 名 of 附加) {
    try {
      if (!(await 世界书可读(名))) {
        探测过.push(`${名}(不可读)`);
        continue;
      }
      if ((await useHost().worldbook.entries(名)).some(is导演条目)) {
        return { 落点: { 名, 来源: '角色卡副世界书(已有条目)' }, 悬空, 失败原因: '' };
      }
      探测过.push(`${名}(可读但无我们的条目)`);
    } catch (error) {
      探测过.push(`${名}(${错误文本(error)})`);
    }
  }

  try {
    const 聊天书 = useHost().worldbook.chatName();
    if (聊天书) {
      if (await 世界书可读(聊天书)) return { 落点: { 名: 聊天书, 来源: '聊天世界书' }, 悬空, 失败原因: '' };
      探测过.push(`${聊天书}(不可读)`);
    }
  } catch (error) {
    探测过.push(`聊天世界书探测失败(${错误文本(error)})`);
  }

  if (选项.允许新建) {
    try {
      const 新建 = await useHost().worldbook.getOrCreateChat(WORLDBOOK_ENTRY_NAME);
      if (新建 && (await 世界书可读(新建))) return { 落点: { 名: 新建, 来源: '聊天世界书(自动创建)' }, 悬空, 失败原因: '' };
      探测过.push('新建聊天世界书失败(返回空)');
    } catch (error) {
      探测过.push(`新建聊天世界书失败(${错误文本(error)})`);
    }
  }

  const 细节 = 探测过.length > 0 ? `；已探测: ${探测过.join(' / ')}` : '';
  const 头部 = 悬空 ? `角色卡主世界书「${悬空}」不可读(链接悬空/未安装)` : '角色卡没有绑定世界书';
  return { 落点: null, 悬空, 失败原因: `${头部}${细节}` };
}

/**
 * 确保"编剧备忘**只有一份**"(E1 补充①, dsh 2026-10-07):
 * 落点会因为绑定修复而变化(悬空 → 聊天书, 后来主世界书可读了 → 又写回主世界书),
 * 若不清理旧副本, 主 AI 会**同时读到两份**, 其中一份永远是陈旧的。
 * `保留` 传目标书名(撤掉别处的副本); 传空串 = 全部撤掉(关闭注入/剧终时用)。
 */
async function 清理别处的副本(保留: string): Promise<void> {
  const 候选 = new Set<string>();
  try {
    const 绑定 = useHost().worldbook.boundNames();
    if (绑定?.primary) 候选.add(绑定.primary);
    for (const 名 of 绑定?.additional ?? []) 候选.add(名);
  } catch {
    // 忽略: 绑定读不到就当没有候选
  }
  try {
    const 聊天书 = useHost().worldbook.chatName();
    if (聊天书) 候选.add(聊天书);
  } catch {
    // 忽略
  }
  候选.delete(保留);
  for (const 名 of 候选) {
    try {
      if (!(await 世界书可读(名))) continue;
      if (!(await useHost().worldbook.entries(名)).some(is导演条目)) continue;
      await useHost().worldbook.remove(名, is导演条目);
      console.warn(
        保留
          ? `[剧情导演] 编剧备忘落点改为「${保留}」, 已清理「${名}」里的旧副本(避免双份/陈旧)`
          : `[剧情导演] 已撤掉「${名}」里的编剧备忘条目`,
      );
    } catch (error) {
      console.warn(`[剧情导演] 清理「${名}」里的编剧备忘副本失败: ${错误文本(error)}`);
    }
  }
}

/** 事实层: 把编剧备忘写入可用世界书的常驻条目 */
export async function sync编剧备忘(data: 导演账本, enabled: boolean, _settings: Settings): Promise<void> {
  const 要写 = !!enabled && 有账本事实(data) && !data?.已剧终;
  try {
    const 解析 = await 解析事实层落点({ 允许新建: 要写 });
    if (解析.悬空) {
      console.warn(
        `[剧情导演] 角色卡主世界书「${解析.悬空}」不可读(链接悬空/未安装)` +
          (解析.落点 ? `, 已回退到「${解析.落点.名}」(${解析.落点.来源})` : ', 且没有可用回退目标'),
      );
    }
    if (!解析.落点) {
      // 只有"该注入却没落点"才算问题; 无事可做(关闭/剧终/无事实)时保持安静
      if (要写) {
        console.error(`[剧情导演] 编剧备忘未送达: ${解析.失败原因}`);
        if (!warnedNoWorldbook) {
          warnedNoWorldbook = true;
          toastWarning(`「编剧备忘」未送达(主 AI 拿不到账本事实): ${解析.失败原因}`, '剧情导演');
        }
      }
      return;
    }
    const 名 = 解析.落点.名;
    // F 剧终停引擎: 剧终后事实层也撤条目(不注入); 关闭/无事实同理。
    // 撤的时候**所有候选都撤**(传空串): 只撤落点那一本的话, 别处可能有上一次回退留下的陈旧副本。
    if (!要写) {
      await 清理别处的副本('');
      warnedNoWorldbook = false;
      return;
    }
    const content = buildInjectionPrompt(data);
    const existing = (await useHost().worldbook.entries(名)).find(is导演条目);
    if (existing) {
      await useHost().worldbook.update(名, wb =>
        wb.map(entry =>
          is导演条目(entry)
            ? {
                ...entry,
                name: sanitizeEntryName(entry.name || WORLDBOOK_ENTRY_NAME),
                content,
                recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
              }
            : entry,
        ),
      );
    } else {
      await useHost().worldbook.create(名, [
        {
          name: WORLDBOOK_ENTRY_NAME,
          content,
          enabled: true,
          probability: 100,
          strategy: {
            type: 'constant',
            keys: [],
            keys_secondary: { logic: 'not_any', keys: [] },
            scan_depth: 'same_as_global',
          },
          position: { type: 'after_character_definition', role: 'system', depth: 0, order: 100 },
          recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
          extra: { daoyan: true },
        },
      ]);
    }
    // E1 补充①: 落点可能变过(悬空 → 聊天书 → 主世界书恢复可读), 写完后把别处的旧副本撤掉,
    // 保证主 AI 只读到**一份**(否则其中一份永远是陈旧的)。
    await 清理别处的副本(名);
    warnedNoWorldbook = false;
  } catch (error) {
    const 原因 = 错误文本(error);
    console.error(`[剧情导演] 同步编剧备忘到世界书失败: ${原因}`);
    if (要写 && !warnedNoWorldbook) {
      warnedNoWorldbook = true;
      toastWarning(`「编剧备忘」未送达: ${原因}`, '剧情导演');
    }
  }
}

// ---------------------------------------------------------------------------
// 指令层: 本幕导演指令(生成前幂等重注, 绝不 await 慢 API)
// ---------------------------------------------------------------------------

const 指令注入ID = (() => {
  try {
    return `daoyan-act-${useHost().vars.scriptId()}`;
  } catch {
    return 'daoyan-act';
  }
})();

const ACT_INJECTION: InjectionPrompt = {
  id: 指令注入ID,
  position: 'in_chat',
  depth: 0,
  role: 'system',
  content: '',
  should_scan: false,
};

let lastContent = '';
let injected = false;

/** 当前该注入的指令文本(空串=不注入)。已剧终/跳过本幕/死亡抉择未定/关闭 → 空 */
export function 应注入的指令文本(data: 导演账本 | null | undefined, settings: Settings, 暂停注入: boolean): string {
  if (!settings.启用导演 || !settings.导演.自动接管 || 暂停注入) return '';
  if (data?.已剧终) return ''; // F 剧终停引擎: 不注入
  const 指令 = data?.当前指令;
  if (!指令 || 指令.已跳过) return '';
  if (data?.待决死亡) return ''; // 死亡待抉择/待消费期间暂停注入
  return build本幕指令(data as 导演账本, settings);
}

/**
 * 幂等地把已就绪的指令注入主AI(在 GENERATION_AFTER_COMMANDS 里调用)。
 * 只读内存里已算好的 账本.当前指令——**绝不在这里调用慢 API**。
 */
export function sync本幕指令(data: 导演账本 | null | undefined, settings: Settings, 暂停注入: boolean): void {
  const content = 应注入的指令文本(data, settings, 暂停注入);
  const active = content.length > 0;
  if (content === lastContent) {
    if (!active && injected) {
      injected = false;
      try {
        useHost().inject.uninject([指令注入ID]);
      } catch {
        // 忽略
      }
    }
    return;
  }
  lastContent = content;
  if (injected) {
    injected = false;
    try {
      useHost().inject.uninject([指令注入ID]);
    } catch {
      // 忽略
    }
  }
  if (active) {
    ACT_INJECTION.content = content;
    try {
      useHost().inject.inject([ACT_INJECTION]);
      injected = true;
    } catch (error) {
      console.warn('[剧情导演] 注入本幕指令失败:', error);
    }
  }
}

/** 移除注入(卸载/关闭时) */
export function remove本幕指令(): void {
  lastContent = '';
  injected = false;
  try {
    useHost().inject.uninject([指令注入ID]);
  } catch {
    // 忽略
  }
}

/** 切聊天/切分支后强制重注(注入绑定当前聊天) */
export function renew本幕指令(data: 导演账本 | null | undefined, settings: Settings, 暂停注入: boolean): void {
  lastContent = '';
  injected = false;
  sync本幕指令(data, settings, 暂停注入);
}
