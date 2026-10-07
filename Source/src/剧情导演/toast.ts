// 剧情导演 · 悬浮球旁弹窗: 贴球出现, 错误加重。(与彼方/烟火同款, 改成 dj- 前缀)
//
// 可观测性(2026-10-07): **事件用条(短暂、可关), 状态用球(常驻、安静)**。四档闸门就设在 `showToast` 出口 ——
// 于是所有调用点(开始/完成/失败、熔断、E1 未送达、快照没落盘…)自动受同一档管, 不必每处各写一遍判断。
// 规格: docs/剧情导演-可观测性-提示条规格-v1.md §4
export type ToastType = 'success' | 'info' | 'warning' | 'error';

/** 提示条档位(设置页 `导演.提示条` 的取值; schema.ts 直接引用这份常量, 不重抄第二遍) */
export const 提示档列表 = ['全部', '完成与异常', '仅异常', '关闭'] as const;
export type 提示档 = (typeof 提示档列表)[number];
/** 默认「完成与异常」: 每轮最多一条(完成或失败)。**开始推进**是 info, 默认不出声 —— 球已经在呼吸了 */
export const 提示档默认: 提示档 = '完成与异常';

/**
 * 纯函数: 这一档放不放行这一类事件。
 * **球的状态不经过这里** —— 设成「关闭」只是不出声, 悬浮球照常反映 编排中/出错/离线/剧终。
 */
export function 放行提示(档位: 提示档, kind: ToastType): boolean {
  const 异常类 = kind === 'warning' || kind === 'error';
  switch (档位) {
    case '全部':
      return true;
    case '完成与异常':
      return 异常类 || kind === 'success';
    case '仅异常':
      return 异常类;
    case '关闭':
      return false;
  }
}

let 当前档位: 提示档 = 提示档默认;

/** 设置 → 提示条 的唯一同步入口(读到的那一刻调用)。非法值忽略, 保持上一个好值。 */
export function 设提示档位(值: unknown): void {
  if ((提示档列表 as readonly string[]).includes(String(值))) 当前档位 = 值 as 提示档;
}
export function 取提示档位(): 提示档 {
  return 当前档位;
}

const TOAST_DURATION: Record<ToastType, number> = { success: 3400, info: 3400, warning: 5200, error: 8000 };
const TOAST_ACCENT: Record<ToastType, string> = {
  success: '#4f9d69',
  info: '#7d8ea8',
  warning: '#d9a13c',
  error: '#e0574a',
};

const BASE_STYLE =
  'display:flex;align-items:flex-start;gap:9px;padding:9px 14px;border-radius:12px;background:var(--dj-toast-bg,#202024);' +
  'border:1px solid var(--dj-toast-border,#3c3c42);color:var(--dj-toast-text,#e9e8e6);font:12px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;' +
  'box-shadow:0 8px 24px rgba(0,0,0,.45);pointer-events:auto;cursor:pointer;max-width:100%;' +
  'max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-word;' +
  'animation:djToastIn .3s cubic-bezier(.34,1.56,.64,1);';

const ERROR_STYLE =
  'background:var(--dj-toast-error-bg,#2a1413);border:1px solid var(--dj-toast-error-border,#e0574a);color:var(--dj-toast-error-text,#ffe3de);' +
  'box-shadow:0 8px 28px rgba(224,87,74,.3);' +
  'animation:djToastIn .3s cubic-bezier(.34,1.56,.64,1),djToastShake .45s ease .32s;';

const TOAST_STYLE: Record<ToastType, string> = {
  success: `border-left:3px solid ${TOAST_ACCENT.success};`,
  info: `border-left:3px solid ${TOAST_ACCENT.info};`,
  warning: `border-left:3px solid ${TOAST_ACCENT.warning};`,
  error: ERROR_STYLE + `border-left:3px solid ${TOAST_ACCENT.error};`,
};

const KEYFRAMES = [
  '@keyframes djToastIn{from{opacity:0;transform:translateX(12px) scale(.92)}to{opacity:1;transform:none}}',
  '@keyframes djToastOut{to{opacity:0;transform:translateX(12px) scale(.96)}}',
  '@keyframes djToastShake{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}',
].join('');

function parentDoc(): Document | null {
  try {
    return window.parent !== window ? window.parent.document : null;
  } catch {
    return null;
  }
}

function ensureStyles(doc: Document) {
  if (doc.getElementById('dj-toast-style')) return;
  const style = doc.createElement('style');
  style.id = 'dj-toast-style';
  style.textContent = KEYFRAMES;
  doc.head.appendChild(style);
}

function ensureStack(doc: Document): HTMLElement {
  let stack = doc.getElementById('dj-toast-stack');
  if (!stack) {
    stack = doc.createElement('div');
    stack.id = 'dj-toast-stack';
    stack.style.cssText =
      'position:fixed;left:0;top:0;display:flex;flex-direction:column;gap:8px;align-items:flex-end;' +
      'z-index:2147482998;pointer-events:none;max-width:min(380px,70vw);';
    doc.body.appendChild(stack);
  }
  if (!stack.dataset.resizeBound) {
    stack.dataset.resizeBound = '1';
    doc.defaultView?.addEventListener('resize', () => reposition(doc));
  }
  return stack;
}

function readAnchor(doc: Document): { x: number; y: number } {
  const marker = doc.getElementById('dj-toast-anchor');
  if (marker) {
    const x = Number(marker.getAttribute('data-x'));
    const y = Number(marker.getAttribute('data-y'));
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  const win = doc.defaultView;
  return { x: (win?.innerWidth ?? 1080) - 60, y: (win?.innerHeight ?? 720) - 130 };
}

function reposition(doc: Document) {
  const stack = doc.getElementById('dj-toast-stack');
  const win = doc.defaultView;
  if (!stack || stack.children.length === 0 || !win) return;
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  const { x, y } = readAnchor(doc);
  const w = stack.offsetWidth;
  const h = stack.offsetHeight;
  const ballL = x - 20;
  const ballR = x + 20;
  let left = ballL - 10 - w;
  if (left < 8) left = ballR + 10;
  left = Math.min(Math.max(left, 8), Math.max(8, vw - w - 8));
  const top = Math.min(Math.max(y - h / 2, 8), Math.max(8, vh - h - 8));
  stack.style.left = `${Math.round(left)}px`;
  stack.style.top = `${Math.round(top)}px`;
}

function makeMark(type: ToastType): HTMLElement {
  const mark = document.createElement('span');
  if (type === 'error') {
    mark.style.cssText =
      'width:16px;height:16px;border-radius:50%;background:var(--dj-toast-error-border,#e0574a);color:#fff;flex:none;margin-top:2px;' +
      'font:bold 11px/16px "Segoe UI","Microsoft YaHei",sans-serif;text-align:center;';
    mark.textContent = '!';
  } else {
    mark.style.cssText = `width:7px;height:7px;border-radius:50%;background:${TOAST_ACCENT[type]};flex:none;margin-top:7px;`;
  }
  return mark;
}

function dismiss(el: HTMLElement, timer: ReturnType<typeof setTimeout>) {
  if (el.dataset.dismissed) return;
  el.dataset.dismissed = '1';
  clearTimeout(timer);
  const doc = el.ownerDocument;
  el.style.animation = 'djToastOut .2s ease forwards';
  window.setTimeout(() => {
    el.remove();
    reposition(doc);
  }, 210);
}

export function showToast(type: ToastType, message: string, title?: string): void {
  if (!放行提示(当前档位, type)) return; // 四档闸门(默认拦掉 info 与「关闭」时的一切)
  const doc = parentDoc();
  if (!doc) return;
  ensureStyles(doc);
  const stack = ensureStack(doc);
  const el = doc.createElement('div');
  el.style.cssText = BASE_STYLE + TOAST_STYLE[type];
  el.append(makeMark(type));
  const body = doc.createElement('span');
  if (title) {
    const label = doc.createElement('b');
    label.style.cssText = 'font-weight:600;margin-right:6px;';
    label.textContent = title;
    body.append(label);
  }
  body.append(doc.createTextNode(message));
  el.append(body);
  el.addEventListener('click', () => dismiss(el, timer));
  stack.appendChild(el);
  const timer = setTimeout(() => dismiss(el, timer), TOAST_DURATION[type]);
  reposition(doc);
}

export const toastSuccess = (message: string, title?: string) => showToast('success', message, title);
export const toastInfo = (message: string, title?: string) => showToast('info', message, title);
export const toastWarning = (message: string, title?: string) => showToast('warning', message, title);
export const toastError = (message: string, title?: string) => showToast('error', message, title);

/** 悬浮球界面把面板主题色写给弹窗容器 */
export function setToastColors(colors: { bg?: string; border?: string; text?: string; accent?: string; errorBg?: string; errorBorder?: string; errorText?: string }): void {
  const doc = parentDoc();
  if (!doc) return;
  const stack = ensureStack(doc);
  const map: [string, string][] = [
    ['bg', '--dj-toast-bg'],
    ['border', '--dj-toast-border'],
    ['text', '--dj-toast-text'],
    ['accent', '--dj-toast-accent'],
    ['errorBg', '--dj-toast-error-bg'],
    ['errorBorder', '--dj-toast-error-border'],
    ['errorText', '--dj-toast-error-text'],
  ];
  for (const [key, prop] of map) {
    const value = (colors as Record<string, string | undefined>)[key];
    if (value) stack.style.setProperty(prop, value);
  }
}

/** 悬浮球界面在球移动/初始化时调用, 让弹窗跟随球的位置 */
export function setToastAnchor(x: number, y: number): void {
  const doc = parentDoc();
  if (!doc) return;
  let marker = doc.getElementById('dj-toast-anchor');
  if (!marker) {
    marker = doc.createElement('div');
    marker.id = 'dj-toast-anchor';
    marker.style.cssText = 'display:none;';
    doc.body.appendChild(marker);
  }
  marker.setAttribute('data-x', String(Math.round(x)));
  marker.setAttribute('data-y', String(Math.round(y)));
  reposition(doc);
}
