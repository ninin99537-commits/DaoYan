// 剧情导演 · 取料: 本轮要发给导演引擎的东西(最近正文 / 玩家输入 / 世界书 / 提示词消息)只此一份。
// ---------------------------------------------------------------------------
// 与彼方 `收集本轮输入.ts` 同户型: 更新主流程只负责"编排", 取料的细节(读哪几层楼、
// 怎么按清空层过滤、拼几条回复、要不要读世界书、怎么组消息)收在这里。
// updateDirector 因此从"取料 + 请求 + 应用 + 落盘"四件事里少一件, 那一件还能单测。
//
// 它照旧只经 host 接缝碰平台(读楼层/人设/世界书), 不碰 Vue。
import { useHost } from './host';
import { getActiveWorldbookText } from './读书';
import { buildDirectorMessages } from './prompts';
import { createTextFilter } from '../共用/楼层标签过滤';
import type { Settings, 导演账本 } from './schema';

/** 取料的返回值: 主流程真正用得到的三样(其余只在拼消息时用掉, 不必外传) */
export interface 本轮输入 {
  /** 最近 N 条 AI 回复(按楼层序, 最后一条最新) —— 锚点 = 最后一条的 message_id */
  recent: { message_id: number; message: string }[];
  /** 拼好的"最近正文"段落(已过标签过滤, 每条带【最新回复】/【较早回复 N】标注) */
  reply: string;
  /** 组好的导演引擎提示词消息 */
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
}

export type 取料结果 = { 成功: true; 输入: 本轮输入 } | { 成功: false; 原因: '没有可分析的AI回复' };

/** 只取末尾一小段楼层(足够找到最近 N 条 AI 回复), 避免每次推进都拉全量楼层 */
function 取最近AI回复(count: number): { message_id: number; message: string }[] {
  try {
    const lastId = useHost().chat.lastMessageId();
    const start = Math.max(0, lastId - count * 10);
    const messages = useHost().chat.messages(`${start}-${lastId}`, { role: 'assistant' });
    return messages
      .filter(message => !message.is_hidden)
      .slice(-count)
      .map(message => ({ message_id: message.message_id, message: String(message.message ?? '') }));
  } catch {
    return [];
  }
}

/** 取最近一条**用户输入**作为本轮情境(与回复同口径过滤; 清空层之前的不取) */
function 取最近用户输入(replyMessageId: number, filter: (text: string) => string, replyIds: Set<number>, minId: number): string {
  try {
    const lastId = useHost().chat.lastMessageId();
    const start = Math.max(0, Math.min(replyMessageId, lastId) - 4);
    const messages = useHost()
      .chat.messages(`${start}-${lastId}`)
      .filter(message => message.role === 'user' && !message.is_hidden && message.message_id > minId && !replyIds.has(message.message_id))
      .slice(-1);
    return messages.map(message => filter(message.message ?? '')).join('\n\n');
  } catch {
    return '';
  }
}

/**
 * 采集本轮输入。
 *
 * @param 账本 当前账本(读清空层与死亡抉择)
 * @param 设置 当前设置(读最近回复数 / 世界书开关 / 破限等)
 * @param force 手动推进: **不受清空层约束**(清空前的楼层也读), 用于"我刚清空但想重推"
 */
export async function 采集本轮输入(账本: 导演账本, 设置: Settings, force: boolean): Promise<取料结果> {
  let playerName: string | null = null;
  let playerDesc = '';
  try {
    playerName = useHost().persona.name();
    playerDesc = useHost().persona.description().trim();
  } catch {
    playerName = null;
    playerDesc = '';
  }

  const recentCount = Math.max(1, 设置.导演.读取最近回复数 ?? 3);
  const clearLayer = 账本.清空层 ?? 0;
  let recent = 取最近AI回复(recentCount);
  if (!force) recent = recent.filter(message => message.message_id > clearLayer);
  if (recent.length === 0) return { 成功: false, 原因: '没有可分析的AI回复' };

  const filter = createTextFilter(设置.标签);
  // 标注每条回复的顺序，最后一条为【最新回复】，让 AI 明确当前场景以最新一条为准
  const reply = recent
    .map((message, index) => `【${index === recent.length - 1 ? '最新回复' : `较早回复 ${index + 1}`}】\n${filter(message.message)}`)
    .join('\n\n');
  const replyIds = new Set(recent.map(message => message.message_id));
  const context = 取最近用户输入(recent[recent.length - 1].message_id, filter, replyIds, force ? 0 : clearLayer);
  const worldbook = 设置.导演.读取世界书
    ? await getActiveWorldbookText([context, reply].filter(Boolean).join('\n\n'), {
        excludeNames: 设置.导演.世界书排除 ?? [],
        includeGlobal: 设置.导演.读取全局世界书,
      })
    : '';

  const messages = buildDirectorMessages({
    账本,
    reply,
    replyCount: recent.length,
    context,
    worldbook,
    playerName,
    playerDesc,
    死亡抉择: 账本.死亡抉择,
    破限: 设置.导演.破限,
    头部填充: 设置.导演.头部填充,
    头部填充文本: 设置.导演.头部填充文本 ?? '',
    防截断: 设置.导演.防截断,
    预填充: 设置.导演.预填充,
  });

  return { 成功: true, 输入: { recent, reply, messages } };
}