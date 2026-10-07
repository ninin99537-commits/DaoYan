// 接口调用只走一条路: 请求交给酒馆服务器转发(getModelList / generateRaw / stopGenerationById,
// 都收在 host.ts 里)。与彼方/烟火同款, 不再有浏览器直连支路。
import { useHost } from './host';
import { getSettings } from './settings';

export function normalizeBaseUrl(url: string): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/** 脱敏接口地址(隐藏 token/key 查询参数) */
export function maskBaseUrl(url: string): string {
  const value = String(url || '').trim();
  return value.replace(/([?&](?:key|token|api_key|apiKey|apikey)=)[^&]*/gi, '$1***');
}

function requestContext(): string {
  const { 模型, 最大token } = getSettings().接口;
  return `模型=${模型 || '(未选)'}, 最大token=${最大token}`;
}

function policyBlockHint(message: string): string {
  return /violat|prohibit|policy|sensitive words|unsupported content|content filter/i.test(message)
    ? '\n(疑似被接口/模型的内容政策拦截——可尝试换用其他模型)'
    : '';
}

export async function fetchModelList(): Promise<string[]> {
  const { 地址, 密钥 } = getSettings().接口;
  const base = normalizeBaseUrl(地址);
  if (!base) throw Error('请先填写接口地址');
  try {
    return await useHost().model.list({ apiurl: base, key: 密钥 });
  } catch (error) {
    throw Error('通过酒馆服务器获取模型列表失败, 请检查地址与密钥', { cause: error });
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  max_tokens?: number;
}

export async function chatCompletion(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const baseCfg = getSettings().接口;
  const 地址 = baseCfg.地址;
  const 密钥 = baseCfg.密钥;
  const 模型 = baseCfg.模型;
  const 温度 = options.temperature ?? baseCfg.温度;
  const 最大token = options.max_tokens ?? baseCfg.最大token;
  const 流式 = baseCfg.流式 ?? false;

  // H 接口健康检查: 地址/密钥/模型**三空**都在这里拦住(R0 不止"密钥空"——空密钥会每轮静默 401)
  const 诊断 = 诊断接口配置({ 地址, 密钥, 模型 });
  if (!诊断.可用) {
    const 错 = Error(诊断.提示);
    错.name = '接口配置';
    throw 错;
  }
  const base = normalizeBaseUrl(地址);
  if (!base) {
    const 错 = Error('接口地址不合法: 需要以 http:// 或 https:// 开头(末尾自动补 /v1)');
    错.name = '接口配置';
    throw 错;
  }

  // 最后一条 user 消息作为 user_input 传入, 避免 generateRaw 追加空消息
  let userInput = '';
  const orderedPrompts = messages.map(message => ({ role: message.role, content: message.content }));
  const lastMessage = orderedPrompts[orderedPrompts.length - 1];
  if (lastMessage && lastMessage.role === 'user') {
    userInput = lastMessage.content;
    orderedPrompts.pop();
  }
  const generationId = `daoyan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const abortSignal = options.signal;
  if (abortSignal?.aborted) throw Error('用户已中断本次导演推进');
  const stopHandler = () => {
    try {
      useHost().model.stop(generationId);
    } catch {
      // 忽略
    }
  };
  const cancelBlocker = new Promise<never>((_, reject) => {
    if (!abortSignal) return;
    abortSignal.addEventListener('abort', () => reject(Error('用户已中断本次导演推进')), { once: true });
  });
  if (abortSignal) abortSignal.addEventListener('abort', stopHandler, { once: true });
  try {
    const result = await Promise.race([
      useHost().model.raw({
        generation_id: generationId,
        user_input: userInput,
        should_silence: true,
        should_stream: 流式,
        max_chat_history: 0,
        custom_api: {
          apiurl: base,
          key: 密钥.trim(),
          model: 模型,
          source: 'openai',
          temperature: 温度,
          max_tokens: 最大token,
        },
        ordered_prompts: orderedPrompts,
      }),
      cancelBlocker,
    ]);
    const content = typeof result === 'string' ? result : (result as { content?: string })?.content ?? '';
    if (!content) {
      throw Error(`响应中没有找到有效的正文内容(${requestContext()})。可能是推理模型把最大输出Token用尽(无正文), 或模型不支持当前参数。请调大「最大输出Token」或更换模型后重试。`);
    }
    return content;
  } catch (error) {
    if (abortSignal?.aborted) throw Error('用户已中断本次导演推进', { cause: error });
    if (error instanceof Error && /无法连接到|接口返回错误|响应中|获取模型/.test(error.message)) throw error;
    if (error instanceof Error && /Gateway|timeout|time-out|超时/i.test(error.message)) {
      throw Error(`生成超时(可能是模型思维链/推理过长或接口负载高)。调小「最大输出Token」后重试。原始错误: ${error.message}`, { cause: error });
    }
    const errText = error instanceof Error ? error.message : String(error);
    throw Error(`通过酒馆服务器请求失败(${requestContext()}): ${errText}${policyBlockHint(errText)}`, { cause: error });
  } finally {
    if (abortSignal) abortSignal.removeEventListener('abort', stopHandler);
  }
}

// ---------------------------------------------------------------------------
// H 接口健康检查: 三空校验 / 错误分类 / 「测试连接」两步探测
//
// 为什么要有这一块: R0 的根因是**空密钥不校验 → 每轮静默 401**, 插件看着装好了却一轮都没生效,
// 而且冷启动设计把这个故障伪装成了正常特性。所以配置缺失必须在**发请求之前**就拦住,
// 接口真错要分类报出, 而"推理模型把预算吃在思维链上导致正文空"必须与接口错分开诊断。
// ---------------------------------------------------------------------------

export type 接口问题类别 = '正常' | '地址未配置' | '地址不合法' | '密钥未配置' | '模型未选择';

export interface 接口诊断 {
  可用: boolean;
  类别: 接口问题类别;
  提示: string;
}

/** 三空校验: 地址/密钥/模型任一缺失都分类报出(R0 不止"密钥空") */
export function 诊断接口配置(配置: { 地址?: string; 密钥?: string; 模型?: string } | null | undefined): 接口诊断 {
  const 地址 = String(配置?.地址 ?? '').trim();
  const 密钥 = String(配置?.密钥 ?? '').trim();
  const 模型 = String(配置?.模型 ?? '').trim();
  if (!地址) return { 可用: false, 类别: '地址未配置', 提示: '接口地址未配置: 请填写 OpenAI 兼容地址(末尾自动补 /v1)' };
  if (!/^https?:\/\//i.test(地址)) {
    return { 可用: false, 类别: '地址不合法', 提示: `接口地址不合法: ${maskBaseUrl(地址)}(需要以 http:// 或 https:// 开头)` };
  }
  if (!密钥) {
    return {
      可用: false,
      类别: '密钥未配置',
      提示: '接口密钥未配置: 空密钥会让每一轮都静默 401 —— 插件看着装好了, 实际一轮都不会生效',
    };
  }
  if (!模型) return { 可用: false, 类别: '模型未选择', 提示: '模型未选择: 请先「获取模型列表」再选一个模型' };
  return { 可用: true, 类别: '正常', 提示: '接口配置齐备' };
}

export type 失败类别 = '密钥错' | '地址错' | '参数错' | '超时' | '未连上' | '正文空' | '未知';

/** 把接口错误文本归类(「测试连接」与推进失败提示共用) */
export function 分类接口错误(文本: string): { 类别: 失败类别; 提示: string } {
  const text = String(文本 ?? '');
  if (/没有找到有效的正文|正文内容|正文为空|empty content/i.test(text)) {
    return {
      类别: '正文空',
      提示: '接口通了但正文为空 —— 推理模型会把输出预算先花在思维链上: 请把「最大输出Token」调大(回退值 ≥16384), 或换非推理模型',
    };
  }
  if (/401|403|unauthor|invalid[\s_-]*(api[\s_-]*)?key|api[_-]?key|密钥|鉴权/i.test(text)) {
    return { 类别: '密钥错', 提示: '密钥被拒(401/403): 请核对密钥是否正确、是否过期' };
  }
  if (/404|not found|unknown model|模型不存在|接口地址/i.test(text)) {
    return { 类别: '地址错', 提示: '地址或模型名不对(404): 请核对接口地址(含 /v1)与模型名' };
  }
  if (/400|invalid|参数|max_tokens|maximum context|too large|context length/i.test(text)) {
    return { 类别: '参数错', 提示: '参数被拒(400): 常见是「最大输出Token」超过端点上限 —— 请调小(回退值 ≥16384)' };
  }
  if (/timeout|time-out|超时|Gateway|502|503|504/i.test(text)) {
    return { 类别: '超时', 提示: '请求超时或网关错误: 可能是推理模型思考过长/接口负载高, 稍后重试' };
  }
  if (/无法连接|ECONN|ENOTFOUND|fetch failed|network/i.test(text)) {
    return { 类别: '未连上', 提示: '连不上接口: 请检查地址可达性与网络/代理' };
  }
  return { 类别: '未知', 提示: `未识别的失败: ${text}` };
}

export interface 测试连接结果 {
  可用: boolean;
  类别: 接口问题类别 | 失败类别;
  提示: string;
  /** 逐步探测记录(面板与日志可读) */
  探测: string[];
}

/** 小预算探测的预算: 足以让普通模型秒回, 又足以暴露"推理模型吃满预算 → 正文空"这一类 */
export const 短探测预算 = 512;

/**
 * 「测试连接」: 两步探测, 把三类失败分开——
 *  ① 配置缺失(地址/密钥/模型) —— 不发请求就能判;
 *  ② 接口真错(401/404/400/连不上) —— 分类报出;
 *  ③ **正文空**: 接口通了但预算被思维链吃满(推理模型) —— 这不是接口错, 要提示调大 max_token。
 * 绝不擅自改小用户配置的 max_token(实测 60000 可用; 改小到 4096 会正文空)。
 */
export async function 测试连接(): Promise<测试连接结果> {
  const 配置 = getSettings().接口;
  const 诊断 = 诊断接口配置(配置);
  if (!诊断.可用) return { 可用: false, 类别: 诊断.类别, 提示: 诊断.提示, 探测: [`配置校验: 未通过 → ${诊断.类别}`] };
  const 探测: string[] = [`配置校验: 通过(地址 ${maskBaseUrl(配置.地址)}, 模型 ${配置.模型}, 最大token ${配置.最大token})`];

  const 试探 = async (预算: number): Promise<{ 正文: string; 错: string; 类别?: 失败类别; 提示?: string }> => {
    try {
      const 正文 = await chatCompletion([{ role: 'user', content: '回复两个字: 就绪' }], { max_tokens: 预算 });
      return { 正文, 错: '' };
    } catch (error) {
      const 文本 = error instanceof Error ? error.message : String(error);
      const 归类 = 分类接口错误(文本);
      return { 正文: '', 错: 文本, 类别: 归类.类别, 提示: 归类.提示 };
    }
  };

  // 第一步: 小预算探测(推理模型会把小预算吃在思维链上 → 正文空; 这是最容易被误判成"接口坏了"的一类)
  const 小 = await 试探(短探测预算);
  探测.push(`小预算探测(max_tokens=${短探测预算}): ${小.正文 ? `返回正文「${小.正文.trim()}」` : `失败 → ${小.类别}`}`);
  if (小.正文) return { 可用: true, 类别: '正常', 提示: '接口可用(小预算探测即返回正文)', 探测 };
  if (小.类别 && 小.类别 !== '正文空') {
    return { 可用: false, 类别: 小.类别, 提示: 小.提示 ?? 小.错, 探测 };
  }

  // 第二步: 用用户真实的 max_token 再探一次(R1: 端点可能直接拒绝超上限的请求; 也可能只是小预算被思维链吃光)
  const 大 = await 试探(配置.最大token);
  探测.push(`满预算探测(max_tokens=${配置.最大token}): ${大.正文 ? `返回正文「${大.正文.trim()}」` : `失败 → ${大.类别}`}`);
  if (大.正文) {
    return {
      可用: true,
      类别: '正常',
      提示: `接口可用, 但小预算(${短探测预算})下正文为空 —— 该模型是推理模型, 思维链吃满了预算。当前 max_token=${配置.最大token} 已验证通过, 请保持较大值(≥16384), 不要调小`,
      探测,
    };
  }
  if (大.类别 === '参数错') {
    return { 可用: false, 类别: '参数错', 提示: `端点不接受 max_token=${配置.最大token}(参数错): 请调小(回退值 ≥16384)`, 探测 };
  }
  if (大.类别 && 大.类别 !== '正文空') return { 可用: false, 类别: 大.类别, 提示: 大.提示 ?? 大.错, 探测 };
  return {
    可用: false,
    类别: '正文空',
    提示: `两次探测都只拿到思维链、没有正文: 请把「最大输出Token」再调大(当前 ${配置.最大token}, 回退值 ≥16384)或换非推理模型`,
    探测,
  };
}
