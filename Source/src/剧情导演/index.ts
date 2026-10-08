import { setActivePinia } from 'pinia';
import { pinia } from './pinia';
import { getSettings } from './settings';
import { captureConsole, useDeathStore, useDebugStore, useStateStore, 读离线状态 } from './state';
import { updateDirector } from './update';
import { remove本幕指令, renew本幕指令, sync编剧备忘, sync本幕指令 } from './注入';
import { toastWarning, 设提示档位 } from './toast';
import { useHost } from './host';
import { createTextFilter } from '../共用/楼层标签过滤';
import './悬浮球界面';

setActivePinia(pinia);
captureConsole();
// 可观测性: 读到设置的那一刻就把提示条档位钉上(面板没打开也要管住"开始推进"这类事件);
// 此刻酒馆 API 可能还没就绪 → 读不到就保持默认档「完成与异常」, 推进流程里还会再同步一次。
try {
  设提示档位(getSettings().导演.提示条);
} catch {
  // 忽略
}

/** 群聊提示只弹一次, 避免每条消息刷屏 */
let 已提示群聊 = false;

/** 暂停注入: 群聊(首版不支持) 或 死亡抉择待定 */
function 暂停注入(): boolean {
  try {
    return useHost().chat.isGroupChat() || useDeathStore().pending;
  } catch {
    return false;
  }
}

function handleChatChanged() {
  useStateStore().reload();
  useDebugStore().clear();
  const settings = getSettings();
  if (settings.启用导演) {
    sync编剧备忘(useStateStore().data, settings.导演.注入世界书条目, settings).catch(error => {
      console.error('[剧情导演] 切聊天同步编剧备忘失败:', error);
    });
    renew本幕指令(useStateStore().data, settings, 暂停注入());
  }
}

async function handleMessageReceived(message_id: number) {
  const settings = getSettings();
  if (!settings.启用导演) return; // 总开关
  if (!settings.导演.自动接管) return;
  // F 剧终停引擎: 剧终后自动路径整体跳过(不调引擎、不注入)——账本侧与 meta 侧双写, loadData 已取或
  if (useStateStore().data.已剧终) {
    console.info('[剧情导演] 已剧终, 自动路径整体跳过');
    return;
  }
  // I 熔断: 连败达阈值后自动暂停自动接管(面板可手动恢复)
  if (读离线状态().自动暂停) {
    console.warn('[剧情导演] 引擎已自动暂停(连败达阈值), 自动路径跳过');
    return;
  }
  if (useHost().chat.isGroupChat()) {
    console.warn('[剧情导演] 群聊首版不支持, 已暂停推进');
    if (!已提示群聊) {
      已提示群聊 = true;
      toastWarning('剧情导演: 首版不支持群聊, 已暂停(请在单聊中使用)', '剧情导演');
    }
    return;
  }
  let latest;
  try {
    const messages = useHost().chat.messages(message_id);
    latest = messages[messages.length - 1];
  } catch {
    return;
  }
  if (!latest || latest.role !== 'assistant' || latest.is_hidden) return;
  // 正文过短(疑似被截断/内容太少、没有足够剧情)时跳过自动推进, 避免白烧一次引擎请求。
  // **与彼方/烟火同口径**: 用标签过滤**之后**的文本判断 —— 思维链占比高的回复用原文判断
  // 会误以为很长, 过滤后才是真正的剧情正文; 只剔换行/制表, 保留普通空格(英文文本不被低估)。
  const replyText = createTextFilter(settings.标签)(String(latest.message ?? '')).replace(/[\r\n\t]+/g, '').trim();
  if (replyText.length < 500) {
    console.warn(`[剧情导演] 最新正文回复过短(过滤后 ${replyText.length}字), 疑似被截断, 已跳过本次自动推进`);
    return;
  }
  const frequency = Math.max(1, settings.导演.更新频率);
  if (frequency > 1) {
    const 账本 = useStateStore().data;
    const lastId = useHost().chat.lastMessageId();
    const from = Math.max(0, (账本.处理到楼层 ?? 0) + 1);
    if (lastId >= from) {
      const fresh = useHost().chat.messages(`${from}-${lastId}`, { role: 'assistant' }).filter(message => !message.is_hidden);
      if (fresh.length % frequency !== 0) return;
    }
  }
  await updateDirector();
}

function refreshAfterFloorChange() {
  useStateStore().reload();
  const settings = getSettings();
  if (!settings.启用导演) return;
  sync编剧备忘(useStateStore().data, settings.导演.注入世界书条目, settings).catch(() => {
    // 忽略
  });
  renew本幕指令(useStateStore().data, settings, 暂停注入());
}

$(() => {
  // 推进防抖: 流式收尾/重roll 短时间连发 MESSAGE_RECEIVED 时只推进最后一条
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  function clearPendingTick() {
    if (tickTimer) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
  }
  useHost().events.onMessageReceived((message_id: number) => {
    clearPendingTick();
    tickTimer = setTimeout(() => {
      tickTimer = null;
      handleMessageReceived(message_id).catch(error => console.error('[剧情导演] 消息处理失败:', error));
    }, 800);
  });
  useHost().events.onMessageDeleted(() => {
    setTimeout(refreshAfterFloorChange, 2000);
  });
  useHost().events.onMessageSwiped(() => {
    refreshAfterFloorChange();
  });
  let lastChatId: string | null = null;
  try {
    lastChatId = useHost().chat.currentChatId();
  } catch {
    // 读取失败则首次 CHAT_CHANGED 直接刷新
  }
  useHost().events.onChatChanged((new_chat_id: string) => {
    if (lastChatId !== new_chat_id) {
      lastChatId = new_chat_id;
      handleChatChanged();
    }
  });
  // 生成前幂等重注已就绪的指令(绝不 await 慢 API)
  useHost().events.onGenerationAfterCommands(() => {
    try {
      const settings = getSettings();
      if (!settings.启用导演) {
        remove本幕指令();
        // 总开关 OFF = 零影响：世界书常驻条目也一并撤掉（否则主 AI 照样看得见账本事实）
        sync编剧备忘(useStateStore().data, false, settings).catch(error => console.warn('[剧情导演] 停用时清理编剧备忘失败:', error));
        return;
      }
      sync本幕指令(useStateStore().data, settings, 暂停注入());
    } catch (error) {
      console.warn('[剧情导演] 生成前重注失败:', error);
    }
  });
  // 脚本可能在聊天尚未加载完时启动: 延迟补读一次账本
  setTimeout(() => {
    try {
      const store = useStateStore();
      const meta = useHost().vars.get({ type: 'chat' })?.['剧情导演'];
      const hasSnapshots = Array.isArray(meta?.快照楼层) && meta.快照楼层.length > 0;
      if (hasSnapshots && !store.data.章回 && (store.data.伏笔?.length ?? 0) === 0) {
        store.reload();
        console.info('[剧情导演] 聊天就绪后补读账本快照');
      }
    } catch {
      // 忽略
    }
  }, 3000);
  console.info('[剧情导演] 剧情导演已加载');
});
