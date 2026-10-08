// 剧情导演 · 面板机制: iframe 尺寸 / 悬浮球拖动 / 面板拖动 / 面板阴影 / 跨 document 挂载。
// fork 自 烟火_世界运转/面板机制.ts(去掉推进中弹条那段, 面板尺寸改为 460×620)。
//
// 关键: 面板跑在 40×40 的外层 iframe 里——打开时必须把 iframe 扩到"球∪面板"的联合矩形,
// 再用 clip-path 裁成"球圆 ∪ 面板矩形"的并集(透明空隙不挡酒馆其他区域), 否则面板被 iframe 裁没。
// iframe 内的 box-shadow 会被 clip-path 裁出硬边, 所以阴影画在酒馆页面上的阴影层里。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { klona } from 'klona';
import { useHost } from './host';
import { UI_KEY } from './state';
import { setToastAnchor, setToastColors } from './toast';
import type { 主题模式 } from './主题';
import { 层序, 取弹窗配色, 悬浮球直径 } from './主题';
import { 取收纳坞, 取收纳坞入口 } from '../共用/收纳坞';

const CLOSED_SIZE = 悬浮球直径;
const LS_KEY = '剧情导演_界面';

export function 使用面板机制() {
  interface UiPrefs {
    x: number;
    y: number;
    主题: 主题模式;
    面板x?: number | null;
    面板y?: number | null;
  }

  /** 最近一次成功读到的 UI 偏好(写回基线): 只写**改动过的字段**, 防陈旧副本把别人的球位置/主题改回去 */
  let ui基线: UiPrefs | null = null;

  function readUiPrefs(): UiPrefs | null {
    try {
      const saved = useHost().vars.get({ type: 'global' })?.[UI_KEY];
      if (saved && typeof saved === 'object' && typeof (saved as UiPrefs).x === 'number') {
        ui基线 = klona(saved as UiPrefs);
        return saved as UiPrefs;
      }
    } catch {
      // 忽略
    }
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as UiPrefs;
        if (saved && typeof saved === 'object' && typeof saved.x === 'number') {
          if (!ui基线) ui基线 = klona(saved);
          return saved;
        }
      }
    } catch {
      // 忽略
    }
    return null;
  }
  /**
   * UI 偏好的全局写入: `insertOrAssign` 是**整键替换**, 直接写会把别的窗口刚改的字段一起冲掉。
   * 与设置写回同一纪律: 只把**相对基线改动过**的字段合并进存储里那份; 从没成功读到过(基线为空)就不写全局
   * (本地 localStorage 照写, 那是本机自己的缓存, 不涉及跨窗口覆盖)。
   */
  function saveUiPrefs(prefs: UiPrefs) {
    try {
      if (ui基线) {
        const 变化: Record<string, any> = {};
        let 有变化 = false;
        for (const [键, 值] of Object.entries(prefs)) {
          if ((ui基线 as Record<string, any>)[键] !== 值) {
            变化[键] = 值;
            有变化 = true;
          }
        }
        if (有变化) {
          const 存储 = useHost().vars.get({ type: 'global' })?.[UI_KEY];
          const 合并 =
            存储 && typeof 存储 === 'object' && !Array.isArray(存储)
              ? { ...klona(存储 as UiPrefs), ...变化 }
              : { ...klona(prefs) };
          useHost().vars.insertOrAssign({ [UI_KEY]: 合并 }, { type: 'global' });
          ui基线 = { ...(ui基线 as Record<string, any>), ...变化 } as UiPrefs;
        }
      }
    } catch {
      // 忽略
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    } catch {
      // 忽略
    }
  }

  const theme = ref<主题模式>(readUiPrefs()?.主题 ?? 'dark');
  function applyToastTheme() {
    setToastColors(取弹窗配色(theme.value));
  }

  const rootEl = ref<HTMLElement | null>(null);
  const frameWin = computed<Window | null>(() => rootEl.value?.ownerDocument?.defaultView ?? null);
  const frame = computed<HTMLIFrameElement | null>(() => (frameWin.value?.frameElement as HTMLIFrameElement | null) ?? null);
  const parentWin = computed<Window | null>(() => frameWin.value?.parent ?? null);

  /**
   * 球 iframe 的**真实**视口矩形 —— 贴球定位(弹条/气泡/toast)的唯一锚点来源。
   *
   * 为什么不能只用 anchorX/anchorY: 那是本插件自己的逻辑球位, 而**收纳类插件(悬浮球收纳等)
   * 是直接改 iframe 本体的 style.left/top**, 且不发任何事件 —— 收纳之后逻辑锚点与真实位置脱节,
   * 弹窗会弹到"球原本应该在"的地方。iframe 的真实矩形天然跟着收纳走。
   * 量不到(未挂载/被隐藏/零尺寸)时回 null, 调用方各自退回逻辑锚点。
   */
  const 球矩形 = ref<{ x: number; y: number; w: number; h: number; cx: number; cy: number } | null>(null);

  /** 重新量球; 返回"是否变了"(没变就不惊动下游重排) */
  function 量球(): boolean {
    const el = frame.value;
    if (!el || !el.isConnected) {
      球矩形.value = null;
      return false;
    }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) {
      球矩形.value = null;
      return false;
    }
    const 旧 = 球矩形.value;
    if (旧 && Math.abs(旧.x - r.left) < 0.5 && Math.abs(旧.y - r.top) < 0.5 && Math.abs(旧.w - r.width) < 0.5 && Math.abs(旧.h - r.height) < 0.5) return false;
    球矩形.value = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    return true;
  }

  /** 矩形盯守的两个通道: 属性观察器(瞬时命中) + 慢轮询(兜底) —— 收纳类插件不发任何事件 */
  let 量球定时器: number | null = null;
  let 量球观察器: MutationObserver | null = null;

  const panelOpen = ref(false);
  const isDragging = ref(false);
  const isPanelDragging = ref(false);
  const panelRef = ref<HTMLElement | null>(null);

  const panelShadowEl = ref<HTMLElement | null>(null);
  function ensurePanelShadow() {
    const parentDoc = parentWin.value?.document;
    if (!parentDoc || panelShadowEl.value) return;
    const el = parentDoc.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;display:none;pointer-events:none;background:transparent;z-index:${层序.面板阴影};`;
    parentDoc.body.appendChild(el);
    panelShadowEl.value = el;
  }
  function removePanelShadow() {
    panelShadowEl.value?.remove();
    panelShadowEl.value = null;
  }
  function syncPanelShadow(fade = false) {
    const shadow = panelShadowEl.value;
    if (!shadow) return;
    if (!panelOpen.value) {
      shadow.style.display = 'none';
      return;
    }
    const panel = panelRectView.value;
    shadow.style.display = 'block';
    shadow.style.left = `${panel.x}px`;
    shadow.style.top = `${panel.y}px`;
    shadow.style.width = `${panelW.value}px`;
    shadow.style.height = `${panelH.value}px`;
    const panelNode = panelRef.value;
    if (panelNode) {
      const style = getComputedStyle(panelNode);
      shadow.style.borderRadius = style.borderRadius;
      shadow.style.boxShadow = style.getPropertyValue('--dj-shadow').trim() || 'none';
    }
    if (fade) shadow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
  }

  const viewportW = (): number => parentWin.value?.innerWidth ?? window.innerWidth;
  const viewportH = (): number => parentWin.value?.innerHeight ?? window.innerHeight;
  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  const anchorX = ref<number>(-100);
  const anchorY = ref<number>(-100);

  /**
   * 贴球定位的统一取点, 三档优先级:
   *   ① **被收纳坞收走** → 贴坞里属于本球的那个代理图标。收纳后坞把球**藏起来**(visibility:hidden)
   *      却**没搬走球 iframe**, 所以贴 iframe 会落在"球原来的位置" —— 就是用户看到的现象。
   *      图标 28×28 比球 40×40 小, 半径随图标走, 贴球间距自然跟着缩。
   *   ② 球 iframe 的**真实矩形** → 本插件自己挪球时用它;
   *   ③ 逻辑锚点兜底(还没上屏 / 量不到)。
   */
  function 球锚点(): { x: number; y: number; r: number } {
    const 入口 = 取收纳坞入口(parentWin.value?.document, frame.value);
    if (入口) {
      const r = 入口.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 };
    }
    const 实 = 球矩形.value;
    if (实) return { x: 实.cx, y: 实.cy, r: Math.max(实.w, 实.h) / 2 };
    return { x: anchorX.value, y: anchorY.value, r: CLOSED_SIZE / 2 };
  }

  /** 贴球锚点的**响应式快照**: 弹条等下游 watch 它, 免得各自去调非响应式的 球锚点() */
  const 贴球锚点 = ref<{ x: number; y: number; r: number }>({ x: -100, y: -100, r: CLOSED_SIZE / 2 });

  /** 坞被拖动/折叠/换锚点时不改变球 iframe, 所以"盯坞"与"盯球"是两条独立通道 */
  let 坞观察器: MutationObserver | null = null;
  function 盯住收纳坞(): void {
    if (坞观察器 || typeof MutationObserver === 'undefined') return;
    const 坞 = 取收纳坞(parentWin.value?.document);
    if (!坞) return;
    坞观察器 = new MutationObserver(() => 同步贴球锚点());
    坞观察器.observe(坞, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
  }

  /**
   * 同步"贴球锚点"到 toast 与下游(弹条/气泡)。
   * **不能只在球动了时才同步**: 坞拖动/折叠/释放时球 iframe 一动不动, 锚点却变了 —— 所以按锚点值判重。
   */
  function 同步贴球锚点(强制 = false): void {
    盯住收纳坞();
    量球();
    const 锚 = 球锚点();
    const 旧 = 贴球锚点.value;
    if (!强制 && Math.abs(旧.x - 锚.x) < 0.5 && Math.abs(旧.y - 锚.y) < 0.5 && Math.abs(旧.r - 锚.r) < 0.5) return;
    贴球锚点.value = 锚;
    setToastAnchor(锚.x, 锚.y);
  }
  const panelPos = ref<{ x: number; y: number } | null>(null);
  let mountedDone = false;

  /**
   * 视口是否"量得出来"。iframe 刚挂载/被隐藏时 innerWidth/innerHeight 会是 0 或极小值，
   * 那一刻算出来的"右下角"其实是 (40,40) 这种毒值 —— 真机事故：它被写进存储后
   * `anchor=20>0` 让后面的守卫永远不触发，球永久停在 (2,2)（dsh 追出来的根因）。
   * ⇒ **视口不可用时只当帧渲染，绝不落盘**。
   */
  function 视口可用(vw = viewportW(), vh = viewportH()): boolean {
    return vw >= 200 && vh >= 200;
  }

  /**
   * 球位净化（导出以便单测）：只接受"球完整落在视口内"的坐标。
   * 下界用 **CLOSED_SIZE**（40）而不是半个球 —— 与拖动夹取同口径，
   * 于是 {x:20,y:20} 这类历史毒值一律判无效 → 走默认右下角（dsh 要求的"读取时净化"）。
   */
  function 球位有效(x: unknown, y: unknown, vw: number, vh: number): boolean {
    const 半 = CLOSED_SIZE / 2;
    return (
      typeof x === 'number' && typeof y === 'number' &&
      Number.isFinite(x) && Number.isFinite(y) &&
      x >= CLOSED_SIZE && y >= CLOSED_SIZE &&
      x <= vw - 半 && y <= vh - 半
    );
  }

  /** 球的默认位置：右下角附近（与面板展开方向一致）。视口不可用时**不改 anchor**（只让当帧夹取兜底）。 */
  function 兜底球心(): void {
    if (!视口可用()) return;
    const vw = viewportW();
    const vh = viewportH();
    if (!球位有效(anchorX.value, anchorY.value, vw, vh)) {
      anchorX.value = Math.max(CLOSED_SIZE, vw - 60);
      anchorY.value = Math.max(CLOSED_SIZE, vh - 130);
    }
  }

  const panelW = ref(460);
  const panelH = ref(620);
  const isNarrow = ref(false);
  function computePanelSize() {
    isNarrow.value = viewportW() < 700;
    if (isNarrow.value) {
      panelW.value = Math.max(240, viewportW() - 8);
      panelH.value = Math.max(300, Math.round(viewportH() * 0.94));
    } else {
      panelW.value = Math.min(460, viewportW() - 24);
      panelH.value = Math.min(620, viewportH() - 24);
    }
  }
  const panelRectView = computed(() => {
    const raw = panelPos.value ?? { x: (viewportW() - panelW.value) / 2, y: (viewportH() - panelH.value) / 2 };
    let x = clamp(raw.x, 8, Math.max(8, viewportW() - panelW.value - 8));
    let y = clamp(raw.y, 8, Math.max(8, viewportH() - panelH.value - 8));
    const orbL = anchorX.value - CLOSED_SIZE / 2 - 6;
    const orbR = anchorX.value + CLOSED_SIZE / 2 + 6;
    const orbT = anchorY.value - CLOSED_SIZE / 2 - 6;
    const orbB = anchorY.value + CLOSED_SIZE / 2 + 6;
    const overlaps = () => orbR > x && orbL < x + panelW.value && orbB > y && orbT < y + panelH.value;
    if (overlaps()) {
      const spaceRight = viewportW() - orbR - 8;
      const spaceLeft = orbL - 8;
      if (spaceRight >= panelW.value) x = orbR + 8;
      else if (spaceLeft >= panelW.value) x = Math.max(8, orbL - panelW.value - 8);
      if (overlaps()) {
        const spaceBottom = viewportH() - orbB - 8;
        const spaceTop = orbT - 8;
        if (spaceBottom >= panelH.value) y = orbB + 8;
        else if (spaceTop >= panelH.value) y = Math.max(8, orbT - panelH.value - 8);
      }
    }
    return { x, y };
  });
  const frameOrigin = ref({ x: 0, y: 0 });
  const panelStyleRef = computed<Record<string, string>>(() => ({
    left: `${panelRectView.value.x - frameOrigin.value.x}px`,
    top: `${panelRectView.value.y - frameOrigin.value.y}px`,
    width: `${panelW.value}px`,
    height: `${panelH.value}px`,
  }));

  function applyFrame() {
    const target = frame.value;
    if (!target) return;
    兜底球心();
    if (!panelOpen.value) {
      const left = clamp(anchorX.value - CLOSED_SIZE / 2, 2, Math.max(2, viewportW() - CLOSED_SIZE - 2));
      const top = clamp(anchorY.value - CLOSED_SIZE / 2, 2, Math.max(2, viewportH() - CLOSED_SIZE - 2));
      target.style.width = `${CLOSED_SIZE}px`;
      target.style.height = `${CLOSED_SIZE}px`;
      target.style.left = `${left}px`;
      target.style.top = `${top}px`;
      target.style.borderRadius = '50%';
      target.style.clipPath = 'none';
      frameOrigin.value = { x: left, y: top };
      syncPanelShadow();
      return;
    }
    computePanelSize();
    const panel = panelRectView.value;
    const orbL = clamp(anchorX.value - CLOSED_SIZE / 2, 0, Math.max(0, viewportW() - CLOSED_SIZE));
    const orbT = clamp(anchorY.value - CLOSED_SIZE / 2, 0, Math.max(0, viewportH() - CLOSED_SIZE));
    const left = Math.max(0, Math.min(orbL, panel.x) - 4);
    const top = Math.max(0, Math.min(orbT, panel.y) - 4);
    const right = Math.min(viewportW(), Math.max(orbL + CLOSED_SIZE, panel.x + panelW.value) + 4);
    const bottom = Math.min(viewportH(), Math.max(orbT + CLOSED_SIZE, panel.y + panelH.value) + 4);
    target.style.left = `${left}px`;
    target.style.top = `${top}px`;
    target.style.width = `${right - left}px`;
    target.style.height = `${bottom - top}px`;
    target.style.borderRadius = '12px';
    frameOrigin.value = { x: left, y: top };
    const pad = 4;
    const r = CLOSED_SIZE / 2 + 4;
    const bcx = anchorX.value - left;
    const bcy = anchorY.value - top;
    const px = panel.x - left - pad;
    const py = panel.y - top - pad;
    const pw = panelW.value + pad * 2;
    const ph = panelH.value + pad * 2;
    target.style.clipPath =
      `path('M ${bcx - r} ${bcy} A ${r} ${r} 0 1 1 ${bcx + r} ${bcy} A ${r} ${r} 0 1 1 ${bcx - r} ${bcy} Z ` +
      `M ${px} ${py} H ${px + pw} V ${py + ph} H ${px} Z')`;
    syncPanelShadow();
  }

  function onViewportResize() {
    anchorX.value = clamp(anchorX.value, CLOSED_SIZE / 2, viewportW() - CLOSED_SIZE / 2);
    anchorY.value = clamp(anchorY.value, CLOSED_SIZE / 2, viewportH() - CLOSED_SIZE / 2);
    if (panelPos.value) {
      computePanelSize();
      panelPos.value = {
        x: clamp(panelPos.value.x, 8, Math.max(8, viewportW() - panelW.value - 8)),
        y: clamp(panelPos.value.y, 8, Math.max(8, viewportH() - panelH.value - 8)),
      };
    }
    applyFrame();
  }

  function persistPrefs() {
    // 没量出视口 / 球位不合法(历史毒值) 时**不落盘** —— 否则会把当帧的兜底结果永久写进去
    if (!mountedDone || !视口可用() || !球位有效(anchorX.value, anchorY.value, viewportW(), viewportH())) return;
    // 跳过 null 字段（用户/dsh 2026-10-07）：面板没被拖过时**不写** 面板x/面板y，
    // 免得用 null 覆盖存储里那份有效坐标（saveUiPrefs 是按字段差异合并的，缺键=不改）。
    const 要存: Parameters<typeof saveUiPrefs>[0] = { x: anchorX.value, y: anchorY.value, 主题: theme.value };
    if (panelPos.value) {
      要存.面板x = panelPos.value.x;
      要存.面板y = panelPos.value.y;
    }
    saveUiPrefs(要存);
  }

  watch([panelOpen, anchorX, anchorY, panelPos], applyFrame);
  // iframe 一动(拖动/展开)就立刻重量真实矩形 —— 否则弹条/气泡要等下一次轮询才知道球挪了
  watch([panelOpen, anchorX, anchorY, panelPos], () => requestAnimationFrame(() => 量球()));
  watch([anchorX, anchorY], () => persistPrefs());
  watch(theme, () => {
    persistPrefs();
    if (panelOpen.value) syncPanelShadow();
    applyToastTheme();
  });

  const orbStyle = computed(() => {
    兜底球心();
    return (
    panelOpen.value
      ? {
          left: `${clamp(anchorX.value - CLOSED_SIZE / 2, 0, Math.max(0, viewportW() - CLOSED_SIZE)) - frameOrigin.value.x}px`,
          top: `${clamp(anchorY.value - CLOSED_SIZE / 2, 0, Math.max(0, viewportH() - CLOSED_SIZE)) - frameOrigin.value.y}px`,
        }
      : { left: '0px', top: '0px' }
    );
  });

  let startX = 0;
  let startY = 0;
  let startAnchorX = 0;
  let startAnchorY = 0;
  let moved = false;

  function parentClient(e: PointerEvent): { x: number; y: number } {
    const rect = frame.value?.getBoundingClientRect();
    if (e.view === frameWin.value && rect) return { x: rect.left + e.clientX, y: rect.top + e.clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onOrbPointerDown(e: PointerEvent) {
    e.preventDefault();
    isDragging.value = true;
    moved = false;
    const rect = frame.value?.getBoundingClientRect();
    startX = (rect?.left ?? 0) + e.clientX;
    startY = (rect?.top ?? 0) + e.clientY;
    startAnchorX = anchorX.value;
    startAnchorY = anchorY.value;
    frameWin.value?.addEventListener('pointermove', onOrbMove);
    frameWin.value?.addEventListener('pointerup', onOrbUp);
    parentWin.value?.addEventListener('pointermove', onOrbMove);
    parentWin.value?.addEventListener('pointerup', onOrbUp);
  }
  function onOrbMove(e: PointerEvent) {
    const point = parentClient(e);
    if (Math.abs(point.x - startX) + Math.abs(point.y - startY) > 4) moved = true;
    anchorX.value = clamp(startAnchorX + (point.x - startX), CLOSED_SIZE, viewportW() - CLOSED_SIZE / 2);
    anchorY.value = clamp(startAnchorY + (point.y - startY), CLOSED_SIZE, viewportH() - CLOSED_SIZE / 2);
  }
  function onOrbUp() {
    isDragging.value = false;
    frameWin.value?.removeEventListener('pointermove', onOrbMove);
    frameWin.value?.removeEventListener('pointerup', onOrbUp);
    parentWin.value?.removeEventListener('pointermove', onOrbMove);
    parentWin.value?.removeEventListener('pointerup', onOrbUp);
    window.setTimeout(() => {
      moved = false;
    }, 200);
  }
  function onOrbClick() {
    if (moved) {
      moved = false;
      return;
    }
    panelOpen.value = !panelOpen.value;
  }
  function closePanel() {
    panelOpen.value = false;
  }

  const headerEl = ref<HTMLElement | null>(null);
  function onPanelPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    isPanelDragging.value = true;
    const panelEl = headerEl.value?.closest('.dj-panel') as HTMLElement | null;
    const panelRect = panelEl?.getBoundingClientRect();
    const fr = frame.value?.getBoundingClientRect();
    const panelLeftV = (panelRect?.left ?? 0) + (fr?.left ?? 0);
    const panelTopV = (panelRect?.top ?? 0) + (fr?.top ?? 0);
    const start = parentClient(e);
    const grabX = start.x - panelLeftV;
    const grabY = start.y - panelTopV;
    panelPos.value = { ...panelRectView.value };
    const onMove = (ev: PointerEvent) => {
      const point = parentClient(ev);
      panelPos.value = {
        x: clamp(point.x - grabX, 8, Math.max(8, viewportW() - panelW.value - 8)),
        y: clamp(point.y - grabY, 8, Math.max(8, viewportH() - panelH.value - 8)),
      };
      applyFrame();
    };
    const onUp = () => {
      isPanelDragging.value = false;
      frameWin.value?.removeEventListener('pointermove', onMove);
      frameWin.value?.removeEventListener('pointerup', onUp);
      parentWin.value?.removeEventListener('pointermove', onMove);
      parentWin.value?.removeEventListener('pointerup', onUp);
      persistPrefs();
    };
    frameWin.value?.addEventListener('pointermove', onMove);
    frameWin.value?.addEventListener('pointerup', onUp);
    parentWin.value?.addEventListener('pointermove', onMove);
    parentWin.value?.addEventListener('pointerup', onUp);
  }

  onMounted(() => {
    const saved = readUiPrefs();
    const vw = viewportW();
    const vh = viewportH();
    // 读取时净化：任何来源（localStorage / 全局变量）的旧值都要过 球位有效()，
    // 否则像 {x:20,y:20} 这种"早期兜底算出的毒值"会一直被当成合法值（真机事故）。
    const 存过坏值 = !!saved && (saved.x !== undefined || saved.y !== undefined) && !球位有效(saved.x, saved.y, vw, vh);
    if (saved && 球位有效(saved.x, saved.y, vw, vh)) {
      anchorX.value = saved.x as number;
      anchorY.value = saved.y as number;
    }
    if (saved && typeof saved.面板x === 'number' && typeof saved.面板y === 'number') panelPos.value = { x: saved.面板x, y: saved.面板y };
    // 默认值要真落到右下角（dsh 验收：2048×972 下 x>1900、y>780）
    兜底球心();
    if (存过坏值) {
      console.warn('[剧情导演] 球位置不在视口内(历史毒值), 已纠正为右下角:', saved?.x, saved?.y);
      persistPrefs(); // 把纠正后的值写回, 免得刷新一次又读到旧毒值
    }
    mountedDone = true;
    // 先把"球的位置"这件事做完（兜底 + 上屏 + 锚点），再做装饰性的阴影/配色：
    // 后者任何一步抛错都不该把球留在原点、也不该让气泡失去坐标（真机缺陷 2 + 缺陷 1 的共同根因）。
    兜底球心();
    applyFrame();
    同步贴球锚点(true);
    // 收纳类插件直接搬 iframe 本体(改内联 left/top)、且不发任何事件 —— 只能自己盯住真实矩形。
    // 双通道: MutationObserver 抓属性改动(命中即瞬时), 慢轮询只作兜底。
    // **不用快轮询**: getBoundingClientRect 在脏布局上会触发整页回流, 为一次搬迁一直按秒级跑不划算。
    if (!量球观察器 && typeof MutationObserver !== 'undefined') {
      量球观察器 = new MutationObserver(() => 同步贴球锚点());
      const 球元素 = frame.value;
      if (球元素) 量球观察器.observe(球元素, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    if (量球定时器 === null) 量球定时器 = window.setInterval(() => 同步贴球锚点(), 2000);
    try {
      ensurePanelShadow();
    } catch (error) {
      console.warn('[剧情导演] 面板阴影初始化失败:', error);
    }
    try {
      applyToastTheme();
    } catch (error) {
      console.warn('[剧情导演] 提示条配色初始化失败:', error);
    }
    parentWin.value?.addEventListener('resize', onViewportResize);
  });
  onUnmounted(() => {
    parentWin.value?.removeEventListener('resize', onViewportResize);
    if (量球定时器 !== null) window.clearInterval(量球定时器);
    量球定时器 = null;
    量球观察器?.disconnect();
    量球观察器 = null;
    坞观察器?.disconnect();
    坞观察器 = null;
    removePanelShadow();
  });

  return {
    /** 球的实时中心（父页面视口坐标）—— 气泡用它定位，**不再依赖 toast 锚点**（缺陷 1 的修法） */
    球心坐标: computed(() => {
      兜底球心();
      return { x: anchorX.value, y: anchorY.value };
    }),
    /** 球 iframe 的真实视口矩形(收纳后仍然准) —— 位置与半径都从这取 */
    球矩形,
    /** 贴球锚点的响应式快照(被收纳时=坞图标, 否则=球) —— 弹条 watch 它跟随 */
    贴球锚点,
    rootEl,
    panelRef,
    headerEl,
    parentWin,
    theme,
    panelOpen,
    isDragging,
    isPanelDragging,
    orbStyle,
    panelStyleRef,
    onOrbPointerDown,
    onOrbClick,
    onPanelPointerDown,
    closePanel,
  };
}
