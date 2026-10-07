# 剧情导演 · 前端改版「风格 B · 剧本批注」实现说明

> 用户已选定 **B**（2026-10-07）。实现：xiaoxi。审查：dsh。真机验收：kilo + 用户体感。
> **规范源码就是对比稿本身**：`docs/mockups/剧情导演-风格对比.html` 里 `.sB` 那个选择器块 + 面板骨架样式，
> 它的值就是本标准；下面的清单是"移植到插件里"的映射与必须守住的边界。

---

## 1. 风格定位（一句话）

**一本摊开在暗处的剧本，旁边搁着一支红笔。** 暖墨灰纸面、**唯一的朱红**当批注色、衬线标题、指令块像舞台提示、**不用阴影堆层次而用边线与留白**。

**设计原则（改样式时的取舍依据）**
1. **只允许一处高饱和**：朱红（`--dj-seal` 那支笔）。别的颜色都是"纸与墨"的浓淡。
2. **层次靠线与留白**，不靠阴影与圆角（圆角一律 2px，几乎方角）。
3. **数字要能被扫读**：等宽数字 + `tabular-nums`，指标数字放大加粗。
4. **动效只回答用户动作**（页签、展开、hover），不做无关起舞。

---

## 2. 令牌（`src/剧情导演/主题.ts`）

现有 `深色` / `白天` 两个对象**键名不变**，只换值 → **视图里的 `var(--dj-*)` 一行都不用改**。

### 深色（主验收对象）
```ts
export const 深色 = {
  accent:       'oklch(0.55 0.16 28)',    // 朱红（原 seal 的职责拆出来：交互强调）
  accentStrong: 'oklch(0.62 0.17 28)',
  accentDeep:   'oklch(0.45 0.14 28)',
  onAccent:     'oklch(0.97 0.01 60)',
  seal:         'oklch(0.58 0.19 28)',    // 朱红原色：剧终 / 危险 / 死亡
  ink:          'oklch(0.90 0.012 75)',
  inkDim:       'oklch(0.72 0.014 75)',
  inkFaint:     'oklch(0.58 0.014 75)',
  bg:           'oklch(0.17 0.008 60)',    // 暖墨（原来是 0.005 270 的冷灰）
  panel:        'oklch(0.21 0.009 60)',
  raise:        'oklch(0.24 0.010 60)',
  hover:        'oklch(0.28 0.011 60)',
  line:         'oklch(0.30 0.010 60)',
  lineStrong:   'oklch(0.40 0.012 60)',
  gold:         'oklch(0.74 0.10 85)',     // 警示/强度
  good:         'oklch(0.70 0.09 148)',    // 成功/已执行
  shadow:       '0 22px 50px rgba(0,0,0,0.6)',   // 只留一层，别双阴影
  serif:        "'Source Han Serif SC','Noto Serif SC','SimSun',serif",
};
```
**新增两个令牌**（视图里要用，务必加进 `主题Token` 与 `白天`）：
```ts
  body:  "'Segoe UI','Microsoft YaHei','PingFang SC',system-ui,sans-serif",  // 显式正文字体栈
  num:   "ui-monospace,'Cascadia Mono',Consolas,monospace",                   // 数字用
```

### 白天（不属本轮验收重点，但**不能留旧冷灰**，按同体系派生）
同色相（hue 60–75）降饱和提亮：`bg: oklch(0.95 0.008 75)`、`panel: oklch(0.975 0.006 75)`、`raise: oklch(0.945 0.008 75)`、
`ink: oklch(0.26 0.012 60)`、`line: oklch(0.86 0.010 75)`、朱红略压暗（`seal: oklch(0.52 0.18 28)`）、`shadow` 减到 `0 18px 40px rgba(0,0,0,0.18)`。

---

## 3. 组件清单（`悬浮球界面.vue` 的 `<style>`）

按对比稿 `.sB` 的规则逐条移植；**每条都对应一条用户抱怨**：

| 抱怨 | 改法 |
| --- | --- |
| ① 配色灰糊不成体系 | §2 换令牌（暖墨 + 朱红）+ **建立语义色**：危险/剧终=`seal`、警告强度=`gold`、成功=`good`、离线/冷启动=`inkFaint`（**不再一律用 seal**） |
| ② 信息太挤没层次 | `.card` 三级权重：普通卡=1px `line` + 左 2px `lineStrong`；重点卡（判据/指令）=左 2px `accent`；状态条=左 3px 语义色。卡片间距 11px、内距 10–12px。**指标数字 16px/600**，标签 10px `inkGhost` |
| ③ 字号字重混乱、数字难读 | 收敛为**五级**：16(指标数字)·15.5(标题 serif)·12.5(正文)·11.5(次要)·10(标签)。**所有数字容器加 `font-variant-numeric: tabular-nums` + `font-family: var(--dj-num)`**（`.dj-metric b`、张力读数、核验数、`dj-pre` 内数字） |
| ④ 圆角阴影粗糙 | **圆角统一 2px**（`--r-*` 全 2px，含按钮/输入/标签）；去掉 `.dj-orb`/`.dj-panel` 的双阴影，只留一层 `--dj-shadow`；边框色改用 `line`/`lineStrong` 两档 |
| ⑤ 图标缺失 | 见 §4（内联 SVG，14px 描边风） |
| ⑥ 无动效 | 见 §5 |

**具体规则（照抄对比稿即可，择要）**
- `.dj-head`（标题栏）：`padding 11px 14px`、下边框 `1px line`、背景 `raise`；`.dj-title` 用 `var(--dj-serif)` **17px**、字距 `.5px`
- `.dj-tabs button`：`padding 7px 12px 8px`；`.on` 用 `accent` 的**下划线**（`::after` 高 2px、左右各伸 0）+ 文字转 `inkStrong`；**去掉原来的圆角胶囊底**
- `.dj-status-*`：保留四态语义（over/off/cold/run），边框**左 3px** 用语义色；四态色分别为 `seal` / `inkFaint` / `inkFaint` / `good`
- `.dj-metrics`：五列栅格，间隙 6px；`.dj-metric b` 16px/600 `inkStrong` + 等宽
- `.dj-pre`（指令预览）：**用 `var(--dj-serif)`、12.5px、行高 1.75**、背景 `--dj-bg`、**左 2px `accent`**；`max-height` 保持现状（不要新增滚动容器）
- `.dj-btn`：背景 `raise`、边框 `lineStrong`、圆角 2px；`.danger` 边框与文字用 `seal`
- `.dj-empty` / `.dj-err-line`：加内联图标（§4），空态用 `inkGhost`、错误用 `seal`
- `.dj-tag`：圆角 2px、边框 `line`、背景 `chip-bg`；`.warn` 用 `gold`
- `.dj-spark i`：柱宽 5px、圆角 1px、渐变 `gold → seal`

---

## 4. 图标（内联 SVG，零依赖）

按对比稿的写法：`<svg class="i" viewBox="0 0 24 24">`，`stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap/linejoin: round; width/height: 13px`（标题栏 14px）。
需要这些（对比稿里都有现成的 `path`，直接抄）：
关闭 ×（标题栏）、主题 ☀（页签行右）、判据（折线图）、当前指令（终端/屏）、活跃冲突（层叠）、跳过本幕（箭头）、空态（信息圆）、错误（三角警告）。
> 仓库另允许 fontawesome（`正文美化` 在用），但**内联 SVG 无外部依赖**，更稳，本方案选它。

---

## 5. 动效（只回答动作，120–180ms）

```css
.dj-tabs button        { transition: color .15s ease; }
.dj-tabs button.on::after { transition: background .15s ease; }
.dj-btn, .dj-mini      { transition: background .15s ease, border-color .15s ease; }
.dj-card               { transition: border-color .15s ease; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```
**不要**做：入场逐个淡入、卡片悬停浮起、扫描线动画（用户没要，且拖慢滚动）。

---

## 6. 必须保留的行为（**改版只动呈现，这些一个都不许动**）

1. **111% 判据修复的口径显示**：指标卡明细走 `判据.明细`（`已了结 X/Y`），异常时显示 **`>100%?`** + "数据异常…（见日志）"**且必须继续标红**（样式换成 `seal` 即可，语义不变）；
2. **状态条四态优先级**：已剧终 > 引擎离线 > 冷启动攒轮 > 运行中（文案含义不变）；
3. **所有 `dj-*` 类名与 DOM 结构不变**（测试里有源码级断言）；
4. 设置页字段与全局变量存储路径不变；E1 的开关文案不变；
5. **零截断**：不许用 CSS 隐藏正文内容来"美化"（可折叠交互，不可静默丢弃）；
6. 面板尺寸契约不变（球 40×40、面板 522×628）。

---

## 7. 硬约束（违反即不予验收）

- 仓库规范（`.cursor/rules/前端界面.mdc`）：**禁 `vh`**；避免 `min-height`/`overflow:auto` 撑高父容器；主体不得 `position:absolute` 脱流；**不得横向滚动**；样式写在 `<style lang="scss">`；
- 零依赖：不引 CDN / 远程字体 / 新 npm 包（**字体只用本地字体栈**）；
- 若必须改到测试断言，**同一提交内同步更新**并说明理由。

---

## 8. 门槛与验收

1. `pnpm test` 全绿 + `tsc --noEmit` 在 `src/剧情导演/`+`tests/` 零错 + 平台直连 0 处 + 发送路径 `.slice(` 0 处；
2. **dsh 规范核对**：`grep -n "vh\|min-height\|overflow: *auto\|position: *absolute"` 逐条看（对比稿里没有这些）；
3. **kilo 真机**：改版前后同尺寸截图对比 + 无横向滚动/无裁切；
4. **用户体感**：看图说"不丑了"（本阶段最终判据）。

---

## 9. 节奏（重要）

- **现在就能改**：只动源码、**先别 `pnpm build`**——kilo 正在跑延长测试（R16–R20），dist 冻结在 `03:05:12`；你改源码不影响它。
- 改完发 INFO（改动文件 + 门槛结果），我复核；
- **build 时机由我统一安排**（等 kilo 收尾），届时这次 build 会**一起带上 111% 判据修复 + 风格 B**。
