// 剧情导演 · 引擎推进管线: 取料 → 请求并校验 → 应用 → 快照 → 双层注入。
// 慢 API 只在这条由 MESSAGE_RECEIVED 触发的异步路径里跑; 生成前注入(GENERATION_AFTER_COMMANDS)
// 只读内存里已就绪的指令, 绝不在这里之外的地方等模型。
import { chatCompletion, maskBaseUrl, 诊断接口配置 } from './api';
import { getSettings } from './settings';
import { useDeathStore, useDebugStore, useStateStore, useUpdatingStore } from './state';
import { loadData, discardSnapshotAt, 保存推进结果, 读离线状态, 记推进失败, 清推进失败, 熔断阈值 } from './快照';
import { useHost } from './host';
import { sync编剧备忘, sync本幕指令 } from './注入';
import { toastError, toastInfo, toastSuccess, toastWarning, 设提示档位 } from './toast';
import { 请求并校验 as 共用请求并校验 } from '../共用/模型往返';
import { 解析导演载荷 } from './解析';
import { 应用引擎输出 } from './账本数据';
import { 构造本幕指令 } from './引擎规则';
import { 采集本轮输入 } from './取料';

let isUpdating = false;

// ---------------------------------------------------------------------------
// 校验(不合格则原样重试)
// ---------------------------------------------------------------------------

function 校验导演载荷(候选: any): any {
  if (!候选 || typeof 候选 !== 'object' || Array.isArray(候选)) throw Error('AI 返回的不是 JSON 对象');
  const keys = ['章回', '伏笔', '冲突', '弧线', '下一幕', '上一幕核验', '上一幕节拍'];
  if (!keys.some(key => key in 候选)) throw Error('AI 返回的 JSON 缺少导演账本字段(章回/伏笔/冲突/弧线/下一幕)');
  return 候选;
}

// ---------------------------------------------------------------------------
// 主流程: 推进导演
// ---------------------------------------------------------------------------

export async function updateDirector(force = false): Promise<void> {
  if (isUpdating) {
    console.warn('[剧情导演] 上一次推进尚未完成, 已跳过本次推进');
    return;
  }
  isUpdating = true;
  const debugStore = useDebugStore();
  const updatingStore = useUpdatingStore();
  const abortSignal = updatingStore.start('导演编排中…');
  const 开始时刻 = Date.now();
  let parsed: any = null;
  let parseError: Error | null = null;
  try {
    const settings = getSettings();
    设提示档位(settings.导演.提示条); // 档位跟着设置走(改了设置下一轮就生效, 不用重启)
    // H 接口健康检查: 地址/密钥/模型**三空**任一缺失都不发请求(空密钥会每轮静默 401 白烧 token)
    const 接口诊断 = 诊断接口配置(settings.接口);
    if (!接口诊断.可用) {
      console.warn('[剧情导演] 接口未配置完成, 已拦截本次推进:', 接口诊断.类别);
      toastError(`剧情导演: ${接口诊断.提示}`, '剧情导演·接口未就绪');
      return;
    }
    // I 熔断: 连败达阈值后自动暂停自动接管(用户手点「重新推进」不受此限——那是明确动作)
    const 离线 = 读离线状态();
    if (离线.自动暂停 && !force) {
      console.warn(`[剧情导演] 引擎已自动暂停(连败 ${离线.连败次数} 次)`);
      toastWarning(`剧情导演: 引擎已自动暂停(连败 ${离线.连败次数} 次: ${离线.最后失败原因})——面板可「恢复自动接管」`, '剧情导演');
      return;
    }
    // 群聊首版不支持: 检测到即暂停并提示
    if (useHost().chat.isGroupChat()) {
      toastWarning('剧情导演: 首版不支持群聊, 已暂停(请在单聊中使用)', '剧情导演');
      return;
    }
    let data = loadData();
    // F 剧终停引擎: 剧终后自动路径整体跳过(不调引擎、不注入); 手动推进也拦, 出口是面板「清除已剧终」
    if (data.已剧终) {
      if (force) toastWarning('剧情导演: 已剧终——如需继续, 请先在面板点「清除已剧终」', '剧情导演');
      else console.info('[剧情导演] 已剧终, 自动路径整体跳过(不调引擎、不注入)');
      return;
    }
    // 取料已独立成 module(候选三): 读哪几层楼 / 怎么过滤 / 拼什么消息 都在 取料.ts
    const 取 = await 采集本轮输入(data, settings, force);
    if (!取.成功) {
      if (force) toastWarning('剧情导演: 没有可分析的AI回复(请确认已生成至少一条AI回复)', '剧情导演');
      else console.warn('[剧情导演] 未找到新的AI回复(清空后或仅剩旧楼层), 跳过本次推进');
      return;
    }
    const { recent, reply, messages } = 取.输入;
    debugStore.record({
      time: Date.now(),
      model: settings.接口.模型,
      replyIds: recent.map(message => message.message_id),
      replyPreview: reply.slice(0, 150),
      request: messages
        .map(message => `【${message.role === 'system' ? '系统指令' : message.role === 'user' ? '用户' : '助手'}】\n${message.content}`)
        .join('\n\n────────\n\n'),
    });
    console.info(`[剧情导演] 开始推进 (使用最近 ${recent.length} 条回复: #${recent.map(message => message.message_id).join(', #')})`);
    // 可观测性: "什么时候在更新" 主要由**球**(呼吸环)回答; 这条 info 受四档闸门管, 默认不出声, 设成「全部」才每轮两条
    toastInfo(`外部编剧正在编排本幕…（最近 ${recent.length} 条回复）`, '剧情导演');
    const 往返 = await 共用请求并校验({
      messages,
      预填充: settings.导演.预填充,
      signal: abortSignal,
      发请求: chatCompletion,
      解析: content => {
        const 结果 = 解析导演载荷(content);
        if (结果.成功) return 结果.载荷;
        const 错 = Error(结果.原因);
        错.name = 结果.截断 ? '截断' : '解析';
        throw 错;
      },
      校验: 候选 => 校验导演载荷(候选),
      判断错误: (error, 阶段) => {
        parseError = error;
        if (阶段 === '解析') return error.name === '截断' ? '反馈' : '致命';
        return 阶段 === '请求' ? '接口' : '反馈';
      },
      名字: '剧情导演',
      结构失败标签: '编排失败',
      中断文案: '用户已中断本次导演推进',
      取重试理由: error => {
        const errMsg = error.message ?? '';
        return errMsg.includes('JSON') || errMsg.includes('解析') ? 'AI 返回的 JSON 不完整' : 'AI 返回格式不符合要求';
      },
      记日志: 记录 => debugStore.record(记录),
      报进度: 文字 => {
        updatingStore.message = 文字;
      },
    });
    parsed = 往返.parsed;

    // 应用引擎输出 → 构造本幕指令 → 落盘
    const anchorFloor = recent[recent.length - 1].message_id;
    const 本次抉择 = data.死亡抉择; // 用户在上一轮当场做出的抉择(交给本轮引擎消费)
    const 应用 = 应用引擎输出(data, parsed, anchorFloor);
    const 账本 = 应用.账本;
    账本.已分析轮数 = (data.已分析轮数 ?? 0) + 1;
    const 新死亡 = 应用.核验.主角死亡;
    const 构造 = 构造本幕指令({
      旧指令: data.当前指令,
      下一幕: parsed.下一幕,
      账本,
      核验: 应用.核验,
      档位: settings.导演.强度档位,
      红线: settings.导演.红线 ?? [],
      楼层: anchorFloor,
      暂停注入: 新死亡, // 本轮刚检测到死亡 → 先不下令, 等用户三选一
      // E 配置化: 阈值与接管轮数从设置传入(默认 3/3/4, 见 schema.ts)
      阈值: { 高: settings.导演.连续高阈值, 低: settings.导演.连续低阈值 },
      接管轮数: settings.导演.接管轮数,
    });
    账本.当前指令 = 构造.指令;
    if (构造.指令) 账本.下一指令编号 = 构造.指令.编号 + 1;
    for (const [名, 次数] of Object.entries(构造.顶回更新)) {
      const 冲突条 = 账本.冲突.find(item => item.名 === 名);
      if (冲突条) 冲突条.顶回次数 = 次数;
    }
    账本.统计 = { 引擎调用次数: (data.统计?.引擎调用次数 ?? 0) + 1, 最后调用: Date.now() };
    // 死亡抉择的消费: 本轮检测到死亡 → 待决; 否则若上一轮有抉择 → 引擎已读入并据此编排, 消费掉
    if (新死亡) {
      账本.待决死亡 = true;
      账本.死亡抉择 = '';
      useDeathStore().markPending();
      toastWarning('剧情导演: 检测到主角死亡——请在本幕面板中做出抉择(未抉择前暂停注入新指令)', '剧情导演');
    } else if (本次抉择) {
      账本.待决死亡 = false;
      账本.死亡抉择 = '';
      useDeathStore().settle();
      console.info(`[剧情导演] 已消费死亡抉择「${本次抉择}」, 注入恢复`);
    } else {
      账本.待决死亡 = data.待决死亡;
      账本.死亡抉择 = '';
    }

    const 落盘 = 保存推进结果(账本, anchorFloor);
    const stateStore = useStateStore();
    stateStore.data = 落盘.数据;
    if (!落盘.落盘) toastWarning('剧情导演: 楼层写不进去, 账本快照没落盘', '剧情导演');
    // I 熔断: 本轮成功 → 连败清零、解除自动暂停(计数只由 catch 写; 本来没计数时不会多写一次存储)
    清推进失败();

    debugStore.record({
      time: Date.now(),
      备注: [`分析轮数=${落盘.数据.已分析轮数}`, ...(构造.调整.length > 0 ? 构造.调整 : ['本轮无代码规则介入'])],
    });

    // 双层注入
    if (settings.导演.注入世界书条目) {
      sync编剧备忘(落盘.数据, true, settings).catch(error => console.error('[剧情导演] 同步编剧备忘失败:', error));
    }
    sync本幕指令(落盘.数据, settings, !!落盘.数据.待决死亡);

    const 用时秒 = Math.max(0, Math.round((Date.now() - 开始时刻) / 1000));
    const 节拍 = 落盘.数据.当前指令?.节拍 ?? '(冷启动·仅记账)';
    console.info(`[剧情导演] 编排完成: 本幕节拍=${节拍} · 用时 ${用时秒}s (伏笔 ${落盘.数据.伏笔.length}, 冲突 ${落盘.数据.冲突.length}, 弧线 ${落盘.数据.弧线.length})`);
    // 可观测性: "什么时候更新完了" —— 完成提示带**用时**(慢的时候用户知道是在等, 不是卡死); 冷启动那条把轮次进度说全
    const 下令轮 = settings.导演.接管轮数;
    const 完成文案 = 落盘.数据.当前指令
      ? `编排完成：本幕节拍 → ${落盘.数据.当前指令.节拍} · 用时 ${用时秒}s`
      : `已记账（冷启动 第 ${落盘.数据.已分析轮数}/${Math.max(1, 下令轮 - 1)} 轮 · 第 ${下令轮} 轮起下令）· 用时 ${用时秒}s`;
    toastSuccess(`剧情导演: ${完成文案}`, '剧情导演');
  } catch (error) {
    if (abortSignal.aborted) {
      debugStore.record({ time: Date.now(), error: '推进已中断' });
      toastInfo('剧情导演: 推进已中断', '剧情导演');
      return;
    }
    console.error('[剧情导演] 推进失败:', error);
    const settingsNow = getSettings();
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    const message = error instanceof Error ? error.message : String(error);
    const detail = [
      '[剧情导演] 推进失败',
      `阶段: ${parseError && parsed === null ? 'JSON 解析' : '接口调用/其他'}`,
      `接口: ${maskBaseUrl(settingsNow.接口.地址) || '(未填)'} / 模型: ${settingsNow.接口.模型 || '(未选)'} / 最大token: ${settingsNow.接口.最大token}`,
      `错误: ${message}`,
      `用时: ${Math.max(0, Math.round((Date.now() - 开始时刻) / 1000))}s`,
      ...(stack ? ['堆栈:', stack] : []),
    ].join('\n');
    debugStore.record({ time: Date.now(), error: detail });
    // I 熔断: 失败写 chat 变量 meta —— **不**写账本快照(失败时账本根本没落盘, 存快照必丢)
    const 失败后 = 记推进失败(message);
    toastError(
      `剧情导演推进失败(连败 ${失败后.连败次数}/${熔断阈值}${失败后.自动暂停 ? ', 已自动暂停自动接管(面板可恢复)' : ''}): ${message}`,
      '剧情导演推进失败',
    );
  } finally {
    isUpdating = false;
    updatingStore.stop();
  }
}

/** 面板「重新推进」: 撤销当前锚点快照再重推(状态自动回落到更早楼层) */
export async function 重新推进(): Promise<void> {
  const data = loadData();
  if ((data.锚点楼层 ?? -1) >= 0) discardSnapshotAt(data.锚点楼层);
  await updateDirector(true);
}
