<template>
  <div class="dj-root" ref="rootEl" :style="根变量">
    <!-- 悬浮球: 仅作唤起器(可拖动/位置记忆) -->
    <div
      class="dj-orb"
      :class="{ open: panelOpen }"
      :style="orbStyle"
      :data-态="球状态"
      :aria-label="球悬停"
      tabindex="0"
      @pointerenter="显示球气泡()"
      @pointerleave="藏起球气泡()"
      @focus="显示球气泡()"
      @blur="藏起球气泡()"
      @keydown.enter.prevent="onOrbClick"
      @pointerdown="onOrbPointerDown"
      @click="onOrbClick"
    >
      <span class="dj-orb-ring" aria-hidden="true"></span>
      <span class="dj-orb-glyph" aria-hidden="true">
        <!-- 球标 = 场次刻度（自绘 SVG：单色 currentColor + 描边 1.6px + 宽取球的 47%）。
             球标只承担身份、不承担状态 —— 五态里形态不变，变的只有环/色/动效；
             「编排中」三根刻度依次亮起，prefers-reduced-motion 下静止。 -->
        <svg class="dj-mark" viewBox="0 0 24 24">
          <path class="dj-tk dj-tk1" d="M7 9.4v9.2" />
          <path class="dj-tk dj-tk2" d="M12 5.4v13.2" />
          <path class="dj-tk dj-tk3" d="M17 11v7.6" />
          <path class="dj-tk-base" d="M4.6 19.2h14.8" opacity="0.38" />
        </svg>
      </span>
    </div>

    <!-- 面板(iframe 打开时扩到"球∪面板"联合矩形, clip-path 裁成并集) -->
    <div v-if="panelOpen" class="dj-panel" ref="panelRef" :style="panelStyleRef">
      <header class="dj-head" ref="headerEl" @pointerdown="onPanelPointerDown">
        <span class="dj-title">剧情导演</span>
        <span class="dj-sub">{{ 副标题 }}</span>
        <button class="dj-x" @click="closePanel" title="关闭">
          <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <nav class="dj-tabs">
        <button v-for="页 in 页列表" :key="页" :class="{ on: 当前页 === 页 }" @click="当前页 = 页">{{ 页 }}</button>
        <button class="dj-theme" @click="切主题" :title="theme === 'dark' ? '切到白天' : '切到深色'">
          <svg v-if="theme === 'dark'" class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
          <svg v-else class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
        </button>
      </nav>

      <main class="dj-body">
        <!-- 本幕 -->
        <section v-if="当前页 === '本幕'" class="dj-sec">
          <!-- I 引擎可观测状态条: 优先级高于冷启动提示(故障不得再被冷启动伪装 —— R0 的教训) -->
          <div class="dj-card dj-status" :class="`dj-status-${状态条.级别}`">
            <div class="dj-status-h">
              <b>{{ 状态条.标题 }}</b>
              <button v-if="离线.自动暂停" class="dj-mini" @click="恢复自动接管">恢复自动接管</button>
              <button v-else-if="离线.连败次数 > 0" class="dj-mini" @click="清空离线计数">清除离线计数</button>
            </div>
            <p class="dj-p">{{ 状态条.明细 }}</p>
            <!-- 可观测性: 编排中给一条不确定态细进度条(面板开着的人也知道在跑) -->
            <div v-if="更新中" class="dj-progress" role="progressbar" aria-label="正在编排本幕"></div>
            <div v-if="剧终" class="dj-actions">
              <button class="dj-btn" @click="清除剧终">清除已剧终（继续游玩）</button>
            </div>
          </div>

          <!-- J 指标卡: 只读指标账(§3 五项判据) -->
          <div class="dj-card">
            <div class="dj-card-h">指标（§3 判据 · 只读指标账）</div>
            <div class="dj-metrics">
              <!-- 回收率 = **队列口径**(同一批伏笔的比), 不用章节统计求和(那会算出 >100%, 见 P1 111%)。
                   数字直接取 判据.明细(来自 账本.指标.累计了结/累计埋设), 面板不另算一套。 -->
              <span class="dj-metric">
                <b :class="{ 'dj-bad': 指标.伏笔回收率异常 }">{{ 回收率文本 }}</b>伏笔回收率
                <em v-if="指标.伏笔回收率异常">数据异常：累计了结 {{ 指标.明细.累计了结 }} &gt; 累计埋设 {{ 指标.明细.累计埋设 }}（见日志）</em>
                <em v-else>已了结 {{ 指标.明细.累计了结 }}/{{ 指标.明细.累计埋设 }}</em>
              </span>
              <span class="dj-metric"><b>{{ 张力文本(指标.张力峰) }}/{{ 张力文本(指标.张力谷) }}</b>张力峰/谷<em>本章起伏 {{ 章起伏 }}</em></span>
              <span class="dj-metric"><b>{{ 指标.冲突推进数 }}</b>冲突推进<em>已结算 {{ 指标.明细.已结算章数 }} 章</em></span>
              <span class="dj-metric"><b>{{ 指标.受挫次数 }}</b>受挫次数</span>
              <span class="dj-metric"><b>{{ 百分比(指标.指令执行率) }}</b>指令执行率<em>{{ 指标.明细.核验总 }} 次核验</em></span>
            </div>
            <div class="dj-spark">
              <i v-for="(v, i) in 指标.张力波形" :key="i" :style="{ height: Math.max(3, Math.round(v * 2.4)) + 'px' }" :title="`张力 ${v}/10`"></i>
              <span v-if="!指标.张力波形.length" class="dj-empty">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>尚无张力历史（推进一轮后出现）
              </span>
            </div>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">张力读数</div>
            <div class="dj-tension">
              <b class="dj-tension-v">{{ 账本.张力?.当前 ?? 0 }}</b><span>/10</span>
              <div class="dj-bar"><i :style="{ width: ((账本.张力?.当前 ?? 0) * 10) + '%' }"></i></div>
            </div>
            <div class="dj-beats">
              <span v-for="(b, i) in (账本.张力?.最近节拍 ?? [])" :key="i" class="dj-beat">{{ b }}</span>
              <span v-if="!(账本.张力?.最近节拍 ?? []).length" class="dj-empty">尚无节拍</span>
            </div>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">当前指令预览 {{ 账本.当前指令 ? `#${账本.当前指令.编号}（${账本.当前指令.节拍}）` : '' }}</div>
            <pre v-if="指令预览" class="dj-pre">{{ 指令预览 }}</pre>
            <p v-else class="dj-empty"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>{{ 冷启动提示 }}</p>
            <!-- 代码调整上面板(批次二): 只读 账本.当前指令.代码调整, 无触发时整块不渲染(不留噪音) -->
            <div v-if="代码调整.length" class="dj-adjust">
              <div class="dj-adjust-h">本轮代码规则触发（{{ 代码调整.length }}）</div>
              <ul class="dj-adjust-list">
                <li v-for="(项, i) in 代码调整" :key="i">{{ 项 }}</li>
              </ul>
            </div>
            <div class="dj-actions">
              <button class="dj-btn" :disabled="!账本.当前指令" @click="跳过本幕"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>跳过本幕</button>
              <button class="dj-btn" :disabled="更新中" @click="手动推进">{{ 更新中 ? '推进中…' : '重新推进' }}</button>
              <button class="dj-btn danger" @click="清空">清空账本</button>
            </div>
          </div>

          <div v-if="死亡待决" class="dj-card dj-death">
            <div class="dj-card-h">主角死亡 · 当场抉择</div>
            <p class="dj-hint">未抉择前暂停注入新指令。</p>
            <div v-if="!待确认剧终" class="dj-actions">
              <button v-for="项 in 死亡选项" :key="项" class="dj-btn" :class="{ danger: 项 === '剧终结算' }" @click="做死亡抉择(项)">{{ 项 }}</button>
            </div>
            <!-- F 二次确认: 剧终会永久停引擎且不可逆, 误点不得即生效 -->
            <div v-else class="dj-confirm">
              <p class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>确认「剧终结算」？剧终后引擎永久停止（不调引擎、不注入），剧情就此完结。</span></p>
              <div class="dj-actions">
                <button class="dj-btn danger" @click="确认剧终">确认剧终结算</button>
                <button class="dj-btn" @click="待确认剧终 = false">取消</button>
              </div>
            </div>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">活跃冲突</div>
            <div v-for="c in 活跃冲突" :key="c.名" class="dj-row">
              <b>{{ c.名 }}</b><span class="dj-tag">{{ c.阶段 }}</span><span class="dj-muted">强度 {{ c.强度 }}/10</span>
              <p class="dj-p">{{ c.下一步 }}</p>
            </div>
            <p v-if="!活跃冲突.length" class="dj-empty">无</p>
          </div>
        </section>

        <!-- 账本 -->
        <section v-else-if="当前页 === '账本'" class="dj-sec">
          <!-- 全书结算(规格 B3): 只在剧终后出现; 数字**只读 落幕那一刻的快照(指标.终值)**, 不在这里重算 -->
          <div v-if="剧终 && 终值" class="dj-card dj-final">
            <div class="dj-card-h">全书结算（落幕那一刻 · 读快照不重算）</div>
            <div class="dj-metrics">
              <span class="dj-metric"><b :class="{ 'dj-bad': 终值.伏笔回收率异常 }">{{ 回收率文本of(终值) }}</b>伏笔回收率<em>已了结 {{ 终值.明细.累计了结 }}/{{ 终值.明细.累计埋设 }}</em></span>
              <span class="dj-metric"><b>{{ 张力文本(终值.张力峰) }}/{{ 张力文本(终值.张力谷) }}</b>张力峰/谷<em>起伏 {{ 终值.起伏次数 }} 次</em></span>
              <span class="dj-metric"><b>{{ 终值.冲突推进数 }}</b>冲突推进<em>{{ 终值.明细.已结算章数 }} 章记账</em></span>
              <span class="dj-metric"><b>{{ 终值.受挫次数 }}</b>受挫次数</span>
              <span class="dj-metric"><b>{{ 百分比(终值.指令执行率) }}</b>指令执行率<em>{{ 终值.明细.核验总 }} 次核验</em></span>
            </div>
          </div>
          <p class="dj-hint">修笔：直接改下方状态即保存到账本快照（删中段楼后手动纠正用）。</p>
          <div class="dj-card">
            <div class="dj-card-h">章回</div>
            <template v-if="账本.章回">
              <p><b>第 {{ 账本.章回.章号 }} 章</b>《{{ 账本.章回.主题 }}》<span class="dj-tag">{{ 账本.章回.进度 }}</span></p>
              <p
                class="dj-muted dj-fold"
                :class="{ 'dj-folded': 章回可点() }"
                :role="章回可点() ? 'button' : undefined"
                :tabindex="章回可点() ? 0 : undefined"
                :title="章回可点() ? 揭开提示(章回折叠中()) : undefined"
                @click="章回可点() && 点开(章回键)"
                @keydown.enter.prevent="章回可点() && 点开(章回键)"
                @keydown.space.prevent="章回可点() && 点开(章回键)"
              >
                <svg v-if="章回可点()" class="i dj-fold-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <template v-if="章回折叠中()"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></template>
                  <template v-else><path d="M3 3l18 18" /><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" /><path d="M6.3 6.4A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4-.8" /></template>
                </svg>计划高潮：{{ 章回折叠中() ? 折叠文案('章回') : (账本.章回?.计划高潮 || '—') }}</p>
            </template>
            <p v-else class="dj-empty">尚无章回</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">伏笔账</div>
            <div v-for="s in 账本.伏笔" :key="s.编号" class="dj-row">
              <b>#{{ s.编号 }}</b>
              <!-- 自绘下拉（规格 §1.1-3）：button + 就地展开的 listbox —— 不再有原生下拉外观、也不新增 absolute -->
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '伏' + s.编号"
                  @click="切下拉('伏' + s.编号)"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ s.状态 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '伏' + s.编号" class="dj-ctl-list" role="listbox" aria-label="伏笔状态">
                  <li
                    v-for="st in 伏笔状态列表"
                    :key="st"
                    role="option"
                    tabindex="0"
                    :aria-selected="st === s.状态"
                    @click="选下拉(() => 改伏笔状态(s.编号, st))"
                    @keydown.enter.prevent="选下拉(() => 改伏笔状态(s.编号, st))"
                    @keydown.space.prevent="选下拉(() => 改伏笔状态(s.编号, st))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ st }}</li>
                </ul>
              </div>
              <span class="dj-muted">{{ s.回收窗口 || '—' }}</span>
              <p
                class="dj-p dj-fold"
                :class="{ 'dj-folded': 伏笔可点(s) }"
                :role="伏笔可点(s) ? 'button' : undefined"
                :tabindex="伏笔可点(s) ? 0 : undefined"
                :title="伏笔可点(s) ? 揭开提示(伏笔折叠中(s)) : undefined"
                @click="伏笔可点(s) && 点开(伏笔键(s.编号))"
                @keydown.enter.prevent="伏笔可点(s) && 点开(伏笔键(s.编号))"
                @keydown.space.prevent="伏笔可点(s) && 点开(伏笔键(s.编号))"
              >
                <svg v-if="伏笔可点(s)" class="i dj-fold-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <template v-if="伏笔折叠中(s)"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></template>
                  <template v-else><path d="M3 3l18 18" /><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" /><path d="M6.3 6.4A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4-.8" /></template>
                </svg>{{ 伏笔折叠中(s) ? 折叠文案('伏笔') : s.内容 }}</p>
            </div>
            <p v-if="!(账本.伏笔 || []).length" class="dj-empty">无</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">冲突账</div>
            <div v-for="c in 账本.冲突" :key="c.名" class="dj-row">
              <b>{{ c.名 }}</b>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '冲' + c.名"
                  @click="切下拉('冲' + c.名)"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ c.阶段 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '冲' + c.名" class="dj-ctl-list" role="listbox" aria-label="冲突阶段">
                  <li
                    v-for="st in 冲突阶段列表"
                    :key="st"
                    role="option"
                    tabindex="0"
                    :aria-selected="st === c.阶段"
                    @click="选下拉(() => 改冲突阶段(c.名, st))"
                    @keydown.enter.prevent="选下拉(() => 改冲突阶段(c.名, st))"
                    @keydown.space.prevent="选下拉(() => 改冲突阶段(c.名, st))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ st }}</li>
                </ul>
              </div>
              <p class="dj-p">赌注：{{ c.赌注 || '—' }}｜下一步：{{ c.下一步 || '—' }}</p>
            </div>
            <p v-if="!(账本.冲突 || []).length" class="dj-empty">无</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">角色弧线</div>
            <div v-for="a in 账本.弧线" :key="a.角色" class="dj-row">
              <b>{{ a.角色 }}</b>
              <input class="dj-input dj-input-sm" :value="a.阶段" @change="改弧线阶段(a.角色, ($event.target as HTMLInputElement).value)" />
              <p class="dj-p">缺口：{{ a.缺口 || '—' }}｜契机：{{ a.下一步契机 || '—' }}</p>
            </div>
            <p v-if="!(账本.弧线 || []).length" class="dj-empty">无</p>
          </div>

          <!-- 终局操作(规格 B1/B2 第二段): 与结算卡同页(语义自洽)。「清空账本」保持在原处不移动(DOM 契约优先) -->
          <div class="dj-card dj-final-ops">
            <div class="dj-card-h">终局操作</div>
            <p class="dj-hint">不依赖主角死亡也能走到结局：先编排一幕<b>收束幕</b>（回收剩余伏笔、收束主线），演完后由你确认落幕。</p>
            <div v-if="!剧终 && !账本.收官请求 && !待确认结算" class="dj-actions">
              <button class="dj-btn danger" @click="待确认结算 = true">做全书结算</button>
            </div>
            <div v-if="待确认结算 && !剧终 && !账本.收官请求" class="dj-confirm">
              <p class="dj-err-line">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>确认「做全书结算」？将编排一幕<b>收束幕</b>（回收剩余伏笔、收束主线），演完后由你确认落幕；剧终后自动路径停摆（可「清除已剧终」恢复）。</span>
              </p>
              <div class="dj-actions">
                <button class="dj-btn danger" @click="做全书结算">确认收官（编排收束幕）</button>
                <button class="dj-btn" @click="待确认结算 = false">取消</button>
              </div>
            </div>
            <div v-if="账本.收官请求 && !剧终" class="dj-adjust">
              <div class="dj-adjust-h">收官进行中：下一道指令已编排为收束幕，主 AI 演完这一幕后由你拍板。</div>
              <div v-if="!待确认落幕" class="dj-actions">
                <button class="dj-btn danger" @click="待确认落幕 = true">确认剧终</button>
              </div>
              <div v-else class="dj-confirm">
                <p class="dj-err-line">
                  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                  <span>确认落幕？剧终后自动路径整体停摆（不调引擎、不注入），可到「本幕」页「清除已剧终」恢复游玩。</span>
                </p>
                <div class="dj-actions">
                  <button class="dj-btn danger" @click="确认剧终">确认剧终</button>
                  <button class="dj-btn" @click="待确认落幕 = false">取消</button>
                </div>
              </div>
            </div>
            <p v-if="剧终" class="dj-ok-line">
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              <span>已剧终：自动路径停摆。想继续游玩请到「本幕」页点「清除已剧终」（会一并清掉收官请求与结算快照）。</span>
            </p>
          </div>
        </section>

        <!-- 日志 -->
        <section v-else-if="当前页 === '日志'" class="dj-sec">
          <div class="dj-card">
            <div class="dj-card-h">
              最近一次引擎调用
              <button class="dj-mini" @click="复制报错">复制报错发给助手</button>
            </div>
            <p v-if="!debug" class="dj-empty"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>暂无记录</p>
            <template v-else>
              <p class="dj-muted">模型：{{ debug.model || '—' }}｜楼层：#{{ (debug.replyIds || []).join(', #') }}</p>
              <p v-for="(n, i) in debug.备注" :key="i" class="dj-muted">· {{ n }}</p>
              <!-- 自绘披露（规格 §1.1-4）：自绘折角 caret + 高度动效 + aria-expanded, 不再有原生折叠三角 -->
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('请求内容')" @click="切展开('请求内容')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>请求内容<span class="dj-ctl-n">{{ 展开集.includes('请求内容') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('请求内容') }"><pre class="dj-pre">{{ debug.request }}</pre></div>
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('AI 输出')" @click="切展开('AI 输出')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>AI 输出<span class="dj-ctl-n">{{ 展开集.includes('AI 输出') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('AI 输出') }"><pre class="dj-pre">{{ debug.response }}</pre></div>
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('报错')" @click="切展开('报错')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>报错<span class="dj-ctl-n">{{ 展开集.includes('报错') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('报错') }"><pre class="dj-pre dj-err">{{ debug.error }}</pre></div>
            </template>
          </div>
          <div class="dj-card">
            <div class="dj-card-h">控制台
              <button class="dj-mini" @click="consoleStore.clear()">清空</button>
            </div>
            <pre class="dj-pre dj-console">{{ 控制台文本 }}</pre>
          </div>
        </section>

        <!-- 设置 -->
        <section v-else class="dj-sec">
          <!-- 总开关（放在设置页最顶部）：OFF = 一键停用，且**连带清掉世界书备忘**（否则模型照样看得见账本事实） -->
          <div class="dj-card" :class="{ 'dj-master-off': !设置.启用导演 }">
            <div class="dj-card-h">总开关<span class="k">· 一键停用导演</span></div>
            <label class="dj-check">
              <input type="checkbox" v-model="设置.启用导演" :aria-checked="!!设置.启用导演" role="switch" @change="切换总开关" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>
              {{ 设置.启用导演 ? '导演已启用' : '导演已停用（不调引擎、不注入）' }}
            </label>
            <p class="dj-hint">
              <b>关掉总开关 = 完全停用</b>：不调引擎、不注入本幕指令，<b>并立刻清掉世界书里的「编剧备忘」</b>（否则主 AI 照样看得见账本事实，做对照组会被污染）。重新启用时按下面的「注入编剧备忘」设置写回。
            </p>
            <p class="dj-hint">
              三个开关的关系：<b>总开关</b>（本项）管住插件的**全部副作用**；<b>自动接管</b>只停"自动推进"（你手点「重新推进」仍可跑）；<b>注入「编剧备忘」到世界书</b>只管那个常驻条目。
              <br>想完全停用：<b>关总开关即可</b>（会自动清掉世界书备忘）。
            </p>
            <p v-if="!设置.启用导演" class="dj-err-line">
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
              <span>已停用：引擎不会被调用、本幕指令不会注入、世界书备忘已清理。已有账本保留，随时可再打开。</span>
            </p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">接口</div>
            <label class="dj-field">地址<input v-model="设置.接口.地址" placeholder="https://... (末尾自动补 /v1)" /></label>
            <label class="dj-field">密钥<input v-model="设置.接口.密钥" type="password" /></label>
            <!-- 模型选择也是自绘（原生建议列表的下拉层无法样式化, 属于"原生外观"）：列表就地展开, 也可手填 -->
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">模型</span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '模型'"
                  @click="切下拉('模型')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.接口.模型 || '（未选）' }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '模型'" class="dj-ctl-list" role="listbox" aria-label="模型列表">
                  <li v-for="m in 设置.接口.模型列表" :key="m" role="option" tabindex="0" :aria-selected="m === 设置.接口.模型"
                    @click="选下拉(() => (设置.接口.模型 = m))"
                    @keydown.enter.prevent="选下拉(() => (设置.接口.模型 = m))"
                    @keydown.space.prevent="选下拉(() => (设置.接口.模型 = m))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ m }}</li>
                  <li v-if="!(设置.接口.模型列表 || []).length" class="dj-muted">还没有模型列表：点「拉取模型」</li>
                </ul>
              </div>
              <input v-model="设置.接口.模型" class="dj-input" placeholder="也可直接手填模型名" />
            </div>
            <div class="dj-inline">
              <button class="dj-btn" :disabled="拉取中" @click="拉取模型">{{ 拉取中 ? '拉取中…' : '获取模型列表' }}</button>
              <button class="dj-btn" :disabled="测试中" @click="点击测试连接">{{ 测试中 ? '测试中…' : '测试连接' }}</button>
              <label class="dj-field inline">最大token<input v-model.number="设置.接口.最大token" type="number" /></label>
              <label class="dj-field inline">温度<input v-model.number="设置.接口.温度" type="number" step="0.1" /></label>
              <label class="dj-check"><input type="checkbox" v-model="设置.接口.流式" :aria-checked="!!设置.接口.流式" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>流式</label>
            </div>
            <!-- H 三空校验: 缺哪一项就点出来 —— 空密钥不该变成每轮静默 401 -->
            <p v-if="!接口诊断.可用" class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>{{ 接口诊断.提示 }}</span></p>
            <p v-else class="dj-ok-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>接口配置齐备（建议点「测试连接」实测一次）</span></p>
            <template v-if="测试结果">
              <p :class="测试结果.可用 ? 'dj-ok-line' : 'dj-err-line'">
                <svg v-if="测试结果.可用" class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                <svg v-else class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>[{{ 测试结果.类别 }}] {{ 测试结果.提示 }}</span>
              </p>
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('探测明细')" @click="切展开('探测明细')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>探测明细<span class="dj-ctl-n">{{ (测试结果.探测 || []).length }} 步 · {{ 展开集.includes('探测明细') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('探测明细') }">
                <pre class="dj-pre">{{ (测试结果.探测 || []).join('\n') }}</pre>
              </div>
            </template>
            <p class="dj-hint">最大输出Token：推理模型需要较大值（回退值 ≥16384）。实测你的端点接受 60000，不要调到 4096 —— 思维链会把小预算吃光、正文返空。</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">导演</div>
            <!-- 自绘滑块（规格 §1.1-1）：appearance:none + ::-webkit-slider-* / ::-moz-range-*，
                 已填充段按值联动、刻度 1–4 可读、键盘 ←→/Home/End 原生可用、:focus-visible 有统一光环 -->
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">强度档位<span class="dj-ctl-readout">{{ 设置.导演.强度档位 }} 档 · {{ 档位标准[设置.导演.强度档位] }}</span></span>
              <input
                class="dj-ctl-range"
                type="range"
                min="1"
                max="4"
                step="1"
                v-model.number="设置.导演.强度档位"
                :style="{ '--fill': ((设置.导演.强度档位 - 1) / 3 * 100).toFixed(1) + '%' }"
                aria-label="戏剧强度档位"
              />
              <span class="dj-ctl-ticks" aria-hidden="true"><i></i><b>1</b><i></i><b>2</b><i></i><b>3</b><i></i><b>4</b><i></i></span>
            </div>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.自动接管" :aria-checked="!!设置.导演.自动接管" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>自动接管(生成前注入本幕指令)</label>
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">提示条</span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '提示条'"
                  @click="切下拉('提示条')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.导演.提示条 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '提示条'" class="dj-ctl-list" role="listbox" aria-label="提示条档位">
                  <li
                    v-for="档 in 提示档列表"
                    :key="档"
                    role="option"
                    tabindex="0"
                    :aria-selected="档 === 设置.导演.提示条"
                    @click="选下拉(() => { 设置.导演.提示条 = 档; 设提示档位(档); })"
                    @keydown.enter.prevent="选下拉(() => { 设置.导演.提示条 = 档; 设提示档位(档); })"
                    @keydown.space.prevent="选下拉(() => { 设置.导演.提示条 = 档; 设提示档位(档); })"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ 档 }}</li>
                </ul>
              </div>
            </div>
            <p class="dj-hint">事件用提示条、状态用悬浮球：选「关闭」只是不出声，<b>球仍会显示 编排中/出错/离线/剧终</b>。「全部」才会每轮多一条"开始推进"。</p>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.防剧透伏笔" :aria-checked="!!设置.导演.防剧透伏笔" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>防剧透 · 折叠未引爆伏笔</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.防剧透章回" :aria-checked="!!设置.导演.防剧透章回" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>防剧透 · 折叠章回计划</label>
            <p class="dj-hint">两项各自独立；折叠只发生在面板显示层（账本与发给引擎的内容一条不少）。<b>点被折叠的那一行可临时揭示</b>，再点收回；切页签/刷新即全部收回，不写盘。</p>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.注入世界书条目" :aria-checked="!!设置.导演.注入世界书条目" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>注入「编剧备忘」到世界书</label>
            <p class="dj-hint">
              优先写角色卡主世界书；主世界书不可读（链接悬空/未安装）时自动回退聊天世界书（必要时新建专属聊天世界书），
              实际落点见日志页（那里会写明"已回退到 X"）。
            </p>
            <label class="dj-field inline">更新频率(每 N 条回复)<input v-model.number="设置.导演.更新频率" type="number" min="1" /></label>
            <label class="dj-field inline">读取最近回复数<input v-model.number="设置.导演.读取最近回复数" type="number" min="1" /></label>
            <label class="dj-field inline">快照保留份数<input v-model.number="设置.导演.快照保留份数" type="number" min="1" max="100" /></label>
            <p class="dj-hint">快照保留份数 = 删楼时账本可回退的楼层数（默认 30；每份约几 KB~十几 KB，调大聊天文件变大）。</p>
            <!-- E 配置化: 节奏与冷启动参数(高级区, 默认值对绝大多数剧本够用) -->
            <div class="dj-adv">
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('高级')" @click="切展开('高级')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>高级（节奏与冷启动）<span class="dj-ctl-n">{{ 展开集.includes('高级') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('高级') }">
              <label class="dj-field inline">接管轮数（第 N 轮起编排）<input v-model.number="设置.导演.接管轮数" type="number" min="1" max="20" /></label>
              <label class="dj-field inline">连续高张力阈值<input v-model.number="设置.导演.连续高阈值" type="number" min="1" max="10" /></label>
              <label class="dj-field inline">连续低张力阈值<input v-model.number="设置.导演.连续低阈值" type="number" min="1" max="10" /></label>
              <p class="dj-hint">接管轮数：前 N-1 轮只记账不出指令（默认 4）。张力阈值：连续 N 幕高张力强制喘息幕 / 连续 N 幕低张力安排「山雨欲来」（默认各 3）。</p>
              </div>
            </div>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">红线（优先于一切指令与档位）</div>
            <div v-for="(r, i) in 设置.导演.红线" :key="i" class="dj-row">
              <span class="dj-p">{{ r }}</span><button class="dj-mini" @click="设置.导演.红线.splice(i, 1)">删</button>
            </div>
            <div class="dj-inline">
              <input v-model="新红线" placeholder="如：主角不死" class="dj-input" @keyup.enter="加红线" />
              <button class="dj-btn" @click="加红线">添加</button>
            </div>
            <p v-if="!(设置.导演.红线 || []).length" class="dj-empty">无红线（完全交给剧本）</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">提示词</div>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.破限" :aria-checked="!!设置.导演.破限" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>破限</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.头部填充" :aria-checked="!!设置.导演.头部填充" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>头部填充</label>
            <input v-if="设置.导演.头部填充" v-model="设置.导演.头部填充文本" class="dj-input" placeholder="留空使用内置小说原文" />
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.防截断" :aria-checked="!!设置.导演.防截断" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>防截断</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.预填充" :aria-checked="!!设置.导演.预填充" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>预填充</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.读取世界书" :aria-checked="!!设置.导演.读取世界书" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>引擎读世界书</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.读取全局世界书" :aria-checked="!!设置.导演.读取全局世界书" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>包含全局世界书</label>
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">标签过滤模式</span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '标签模式'"
                  @click="切下拉('标签模式')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.标签.模式 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '标签模式'" class="dj-ctl-list" role="listbox" aria-label="标签过滤模式">
                  <li v-for="模 in ['排除', '只读']" :key="模" role="option" tabindex="0" :aria-selected="模 === 设置.标签.模式"
                    @click="选下拉(() => (设置.标签.模式 = 模 as '排除' | '只读'))"
                    @keydown.enter.prevent="选下拉(() => (设置.标签.模式 = 模 as '排除' | '只读'))"
                    @keydown.space.prevent="选下拉(() => (设置.标签.模式 = 模 as '排除' | '只读'))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ 模 }}</li>
                </ul>
              </div>
            </div>
            <input v-model="标签列表文本" class="dj-input" placeholder="标签，逗号分隔（如 aftertalk,thinking）" />
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { 取根变量 } from './主题';
import { useSettingsStore, 立即保存设置 } from './settings';
import {
  useConsoleStore, useDeathStore, useDebugStore, useStateStore, useUpdatingStore,
  saveData, clearAllData, 读离线状态, 清推进失败, 设自动暂停, 写已剧终, 熔断阈值,
} from './state';
import { build本幕指令 } from './prompts';
import { 档位标准, 跳过本幕 as 跳过本幕规则 } from './引擎规则';
import { fetchModelList, 诊断接口配置, 测试连接, type 测试连接结果 } from './api';
import { 计算判据, 终值日志行 } from './指标';
import { 章回受管, 章回键, 伏笔受管, 伏笔键, 切换揭开, 折叠中, 折叠文案, 揭开提示 } from './防剧透';
import { 落定剧终, 解除剧终, 请求收官 } from './快照';
import { 计算球状态, 球悬停文案 } from './球状态';
import { 显示气泡, 藏气泡 } from './球气泡';
import { 设提示档位, 提示档列表, toastSuccess } from './toast';
import { 重新推进 } from './update';
import { remove本幕指令, renew本幕指令, sync编剧备忘 } from './注入';
import { 使用面板机制 } from './面板机制';
import { 伏笔状态列表, 冲突阶段列表, type 伏笔状态, type 冲突阶段, type 死亡抉择, type 判据, type 伏笔 } from './schema';

const stateStore = useStateStore();
const settingsStore = useSettingsStore();
const debugStore = useDebugStore();
const consoleStore = useConsoleStore();
const updatingStore = useUpdatingStore();
const deathStore = useDeathStore();

const { rootEl, panelRef, headerEl, theme, panelOpen, orbStyle, panelStyleRef, onOrbPointerDown, onOrbClick, onPanelPointerDown, closePanel, 球心坐标 } = 使用面板机制();

const 账本 = computed(() => stateStore.data);
const 设置 = computed(() => settingsStore.settings);
const debug = computed(() => debugStore.log);
const 更新中 = computed(() => updatingStore.active);
const 死亡待决 = computed(() => deathStore.pending || (!!账本.value.待决死亡 && !账本.value.死亡抉择));
const 死亡选项: 死亡抉择[] = ['视角转移', '世界观内复活', '剧终结算'];

const 页列表 = ['本幕', '账本', '日志', '设置'] as const;
const 当前页 = ref<'本幕' | '账本' | '日志' | '设置'>('本幕');
const 新红线 = ref('');
const 拉取中 = ref(false);

const 根变量 = computed(() => 取根变量(theme.value));
const 副标题 = computed(() => {
  const t = 账本.value.张力?.当前 ?? 0;
  const 节拍 = 账本.value.当前指令?.节拍;
  return `${节拍 ? '本幕 ' + 节拍 : '待命'} · 张力 ${t}/10`;
});
const 活跃冲突 = computed(() => (账本.value.冲突 ?? []).filter(c => c.阶段 !== '已收档'));
/**
 * 防剧透(规格 A): **两个独立开关** + **整行点击临时揭开**。
 * 折叠只发生在"渲染哪段文案"这一层 —— 账本里 `伏笔[].内容`、`章回.计划高潮` 一个字都不少,
 * 发往引擎的内容也不经过这里(零截断红线)。
 */
const 防剧透开关 = computed(() => ({ 防剧透伏笔: 设置.value.导演.防剧透伏笔, 防剧透章回: 设置.value.导演.防剧透章回 }));
/** 被点开的条目(内存态, **不写盘**): 切页签/刷新/换聊天即回到折叠 */
const 已揭开 = ref<Set<string>>(new Set());
function 点开(键: string) {
  已揭开.value = 切换揭开(已揭开.value, 键);
}
/** 这条伏笔是否受防剧透管(受管才给可点样式与图标) */
function 伏笔可点(条: 伏笔): boolean {
  return 伏笔受管(防剧透开关.value, 条.状态);
}
function 伏笔折叠中(条: 伏笔): boolean {
  return 折叠中(伏笔可点(条), 已揭开.value, 伏笔键(条.编号));
}
function 章回可点(): boolean {
  return 章回受管(防剧透开关.value, 账本.value.章回?.计划高潮);
}
function 章回折叠中(): boolean {
  return 折叠中(章回可点(), 已揭开.value, 章回键);
}
/** 规格 A2: 展开态不持久化 —— 换页签就全部收回(刷新与换聊天由组件重建天然收回) */
watch(当前页, () => {
  已揭开.value = new Set();
});

// ---------------------------------------------------------------------------
// 自绘控件层(规格 §1.1)的界面状态: 下拉就地展开 + 披露展开 + 球的气泡
// ---------------------------------------------------------------------------
/** 同时只开一个自绘下拉(键 = '伏3' / '冲夺嫡' / '提示条' / '标签模式' / '模型') */
const 打开的下拉 = ref('');
function 切下拉(键: string) {
  打开的下拉.value = 打开的下拉.value === 键 ? '' : 键;
}
/** 选中一项: 先应用, 再收起(自绘 listbox 的就地展开不留残影) */
function 选下拉(应用: () => void) {
  应用();
  打开的下拉.value = '';
}
/** 自绘下拉的键盘支持（规格 §1.1-3）：↑↓ 在选项间移动焦点 */
function 移到相邻项(e: KeyboardEvent, 方向: number) {
  const 项 = e.currentTarget as HTMLElement | null;
  const 兄弟 = 方向 > 0 ? 项?.nextElementSibling : 项?.previousElementSibling;
  if (兄弟 instanceof HTMLElement) 兄弟.focus();
}
/** 点面板空白处关掉自绘下拉（规格 §1.1-3）；点在 .dj-ctl-dd 内不动它 */
function 点外关下拉(e: MouseEvent) {
  const 目标 = e.target as HTMLElement | null;
  if (!目标 || !目标.closest || 目标.closest('.dj-ctl-dd')) return;
  打开的下拉.value = '';
}
onMounted(() => document.addEventListener('click', 点外关下拉));
onUnmounted(() => document.removeEventListener('click', 点外关下拉));

/** 自绘披露的展开集合(默认把「报错」摊开 —— 原来那个默认展开的报错块就是这个语义) */
const 展开集 = ref<string[]>(['报错']);
function 切展开(键: string) {
  展开集.value = 展开集.value.includes(键) ? 展开集.value.filter(k => k !== 键) : [...展开集.value, 键];
}
/** 球的信息气泡: 挂在**父页面 DOM**(球自己的 iframe 只有 40×40 且被 clip-path 裁成并集, 气泡必被裁掉) */
function 显示球气泡() {
  // 传**实时球心**（面板机制从 anchorX/anchorY 给）：拖动后立刻跟手, 不再依赖 toast 锚点
  显示气泡(球悬停.value, 球心坐标.value);
}
function 藏起球气泡() {
  藏气泡();
}
const 指令预览 = computed(() => (账本.value.当前指令 ? build本幕指令(账本.value, 设置.value) : ''));
/** 代码调整上面板(批次二): 本轮代码规则触发记录 —— 只读 指令.代码调整, 不新增任何行为 */
const 代码调整 = computed(() => 账本.value.当前指令?.代码调整 ?? []);
// E 配置化: 接管轮数来自设置(默认 4, 见 schema.ts 的 SettingsSchema)
const 接管轮数 = computed(() => 设置.value.导演.接管轮数);

// ---------------------------------------------------------------------------
// 批次一(H/I/F/J): 接口诊断 · 离线可观测三态 · 已剧终 · 指标卡
// ---------------------------------------------------------------------------
const 离线 = ref(读离线状态());
const 待确认剧终 = ref(false);
const 剧终 = computed(() => !!账本.value.已剧终);
const 接口诊断 = computed(() => 诊断接口配置(设置.value.接口));
const 测试中 = ref(false);
const 测试结果 = ref<测试连接结果 | null>(null);
const 指标 = computed(() => 计算判据(账本.value));
const 章起伏 = computed(() => 账本.value.指标?.本章累计?.起伏次数 ?? 0);
/**
 * 伏笔回收率显示: 数据异常(累计了结 > 累计埋设)时显示**显式异常态**, 不夹断也不显示 >100%
 * (数字与明细都来自 计算判据 ← 账本.指标 的累计计数器, 面板不另算一套)。
 */
/** 判据 → 显示文本(活指标与"落幕快照"共用一条口径, 不各写一套) */
function 回收率文本of(判: 判据): string {
  return 判.伏笔回收率异常 ? '>100%?' : 百分比(判.伏笔回收率);
}
const 回收率文本 = computed(() => 回收率文本of(指标.value));

function 时间文本(t: number): string {
  return t > 0 ? new Date(t).toLocaleTimeString() : '时间未知';
}
function 百分比(v: number): string {
  return v < 0 ? '样本不足' : `${Math.round(v * 100)}%`;
}
/** 张力峰/谷: -1 = 本章还没观测到(不用 0 冒充) */
function 张力文本(v: number): string {
  return v < 0 ? '—' : String(v);
}
/**
 * 状态条三态(互斥): 已剧终 → 引擎离线 → 冷启动攒轮 → 运行中。
 * 优先级刻意如此: **离线/剧终必须压过冷启动提示** —— R0 的教训就是冷启动把故障伪装成了正常特性。
 */
const 状态条 = computed(() => {
  if (剧终.value) {
    return { 级别: 'over', 标题: '已剧终', 明细: '剧终结算后自动路径整体停摆：不调引擎、不注入。想继续请点下方「清除已剧终」。' };
  }
  if (离线.value.自动暂停) {
    return {
      级别: 'off',
      标题: '引擎离线（已自动暂停）',
      明细: `上次失败原因：${离线.value.最后失败原因 || '未知'}（${时间文本(离线.value.最后失败时间)}）· 连败 ${离线.value.连败次数}/${熔断阈值} 次`,
    };
  }
  if (离线.value.连败次数 > 0) {
    return {
      级别: 'warn',
      标题: '引擎离线（链路不稳）',
      明细: `上次失败原因：${离线.value.最后失败原因 || '未知'}（${时间文本(离线.value.最后失败时间)}）· 连败 ${离线.value.连败次数}/${熔断阈值} 次`,
    };
  }
  const 轮数 = 接管轮数.value;
  if ((账本.value.已分析轮数 ?? 0) < 轮数) {
    return {
      级别: 'cold',
      标题: '冷启动攒轮',
      明细: `第 ${账本.value.已分析轮数 ?? 0}/${轮数 - 1} 轮 · 第 ${轮数} 轮起编排本幕`,
    };
  }
  const 楼 = 账本.value.锚点楼层 ?? -1;
  return { 级别: 'on', 标题: '运行中', 明细: `上次编排成功于 #${楼 >= 0 ? 楼 : '—'} 楼 · 已调用引擎 ${账本.value.统计?.引擎调用次数 ?? 0} 次` };
});
/**
 * 可观测性: **悬浮球五态**(优先级与文案都是纯函数, 见 球状态.ts; 这里只做绑定)。
 * 目的是让用户**不打开面板**就知道: 在跑 / 闲着 / 上次失败 / 已停摆。
 */
const 球状态 = computed(() =>
  计算球状态({
    已剧终: 剧终.value,
    自动暂停: 离线.value.自动暂停,
    连败次数: 离线.value.连败次数,
    编排中: 更新中.value,
  }),
);
const 球悬停 = computed(() => {
  const 最后调用 = 账本.value.统计?.最后调用 ?? 0;
  return 球悬停文案(球状态.value, {
    最后失败原因: 离线.value.最后失败原因,
    连败次数: 离线.value.连败次数,
    熔断阈值,
    上次节拍: 账本.value.当前指令?.节拍,
    上次成功分钟前: 最后调用 > 0 ? (Date.now() - 最后调用) / 60000 : -1,
    接管轮数: 接管轮数.value,
    已分析轮数: 账本.value.已分析轮数 ?? 0,
  });
});

/**
 * D 冷启动提示: **直接取状态条的冷启动文案** —— 同一处状态判断, 不许各写一套,
 * 免得出现"状态条说离线、指令预览说冷启动"这种自相矛盾(R0 教训)。
 * 定义必须放在 状态条 之后: 它只是状态条的派生视图。
 */
const 冷启动提示 = computed(() =>
  状态条.value.级别 === 'cold' ? `冷启动中：${状态条.value.明细}。` : '当前无指令（可能已跳过，或死亡抉择未定）。',
);
const 控制台文本 = computed(() => consoleStore.lines.map(l => `[${new Date(l.time).toLocaleTimeString()}] ${l.type} ${l.text}`).join('\n'));
const 标签列表文本 = computed({
  get: () => (设置.value.标签.列表 ?? []).join(','),
  set: v => {
    设置.value.标签.列表 = String(v).split(',').map(s => s.trim()).filter(Boolean);
  },
});

// 死亡待决时自动弹开面板, 让用户看到三选一
watch(死亡待决, v => {
  if (v) panelOpen.value = true;
});

function 切主题() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}
async function 拉取模型() {
  拉取中.value = true;
  try {
    const list = await fetchModelList();
    设置.value.接口.模型列表 = list;
    if (!设置.value.接口.模型 && list.length > 0) 设置.value.接口.模型 = list[0];
  } catch (error) {
    console.warn('[剧情导演] 获取模型列表失败:', error);
  } finally {
    拉取中.value = false;
  }
}
function 加红线() {
  const v = 新红线.value.trim();
  if (v) 设置.value.导演.红线.push(v);
  新红线.value = '';
}
function 跳过本幕() {
  if (!账本.value.当前指令) return;
  跳过本幕规则(账本.value);
  saveData(账本.value);
  renew本幕指令(账本.value, 设置.value, !!账本.value.待决死亡);
  console.info('[剧情导演] 用户跳过本幕');
}
async function 手动推进() {
  await 重新推进();
}
/**
 * 总开关（用户点名要的"关掉就完全不调用那种"）。OFF 必须**真零影响**：
 *   ① 撤本幕指令（生成前不再注入）② 清世界书备忘（`sync编剧备忘(..., false, ...)` 会让"要写=false"，
 *   走到 注入.ts 的 `清理别处的副本('')` —— 所有候选书里的旧副本一并撤掉）。
 * 重新启用：按 `注入世界书条目` 的当前值写回，并把已就绪的指令重新注入。
 */
function 切换总开关() {
  if (!设置.value.启用导演) {
    sync编剧备忘(账本.value, false, 设置.value);
    remove本幕指令();
    console.info('[剧情导演] 总开关已关：不调引擎、不注入，并清理世界书里的「编剧备忘」');
    return;
  }
  sync编剧备忘(账本.value, 设置.value.导演.注入世界书条目, 设置.value);
  renew本幕指令(账本.value, 设置.value, !!账本.value.待决死亡);
  console.info('[剧情导演] 总开关已开：按「注入编剧备忘」设置写回世界书');
}
function 清空() {
  clearAllData();
  stateStore.reload();
  sync编剧备忘(stateStore.data, false, 设置.value);
  renew本幕指令(stateStore.data, 设置.value, false);
}
function 做死亡抉择(项: 死亡抉择) {
  // F 二次确认: 剧终结算不可逆(会永久停引擎), 误点不得即生效
  if (项 === '剧终结算') {
    待确认剧终.value = true;
    return;
  }
  账本.value.死亡抉择 = 项;
  deathStore.settle();
  saveData(账本.value);
  // 抉择交给下一轮引擎消费(据此分向编排); 消费前仍暂停注入
  renew本幕指令(账本.value, 设置.value, true);
  console.info(`[剧情导演] 死亡抉择：${项}(待下一轮引擎消费)`);
}
/**
 * 手动全书结算(规格 B)的状态: 两段都要二次确认 —— 结算会改下一道指令, 落幕会停引擎, 都不能误点生效。
 */
const 待确认结算 = ref(false);
const 待确认落幕 = ref(false);
/** 结算卡的数据源: **只读 落幕那一刻的快照**, 不在这里重算(账本会随删楼回退变化, 成绩单不能跟着变) */
const 终值 = computed(() => 账本.value.指标?.终值 ?? null);
/**
 * 第一段(规格 B2): 请求收官 → 下一道指令由 `构造本幕指令` 编排为收束幕。
 * **幂等**由 `请求收官` 保证(已有请求或已剧终就返回 false 且什么都不改) —— 重复点击攒不出多道收官指令。
 */
function 做全书结算() {
  待确认结算.value = false;
  if (!请求收官(账本.value)) {
    console.info('[剧情导演] 收官请求已存在或已剧终, 忽略重复点击(不产生第二道收束幕)');
    return;
  }
  if (!saveData(账本.value)) console.warn('[剧情导演] 收官请求落盘失败(内存里仍生效, 但删楼回退会丢)');
  renew本幕指令(账本.value, 设置.value, !!账本.value.待决死亡);
  console.info('[剧情导演] 用户请求全书结算：下一道指令将编排为收束幕(演完后由你在账本页确认落幕)');
  toastSuccess('剧情导演: 已请求全书结算——下一道指令改为收束幕（回收剩余伏笔、收束主线）；演完这一幕后请在账本页点「确认剧终」', '剧情导演');
}
/** F 二次确认后落定剧终: **双写**(账本 + chat 变量 meta)并立即停引擎停注入 */
function 确认剧终() {
  待确认剧终.value = false;
  待确认落幕.value = false;
  账本.value.死亡抉择 = '剧终结算';
  落定剧终(账本.value); // 已剧终 + 清 收官请求 + 判据快照写进 指标.终值(纯函数, 见 快照.ts)
  deathStore.settle();
  写已剧终(true);
  if (!saveData(账本.value)) console.warn('[剧情导演] 剧终落盘失败(楼层写不进去), chat meta 侧仍已标记已剧终');
  // 成绩单同时写一行进日志页: 将来「清除已剧终」把 终值 清空了, 用户仍能在日志里回看(dsh 补充)
  console.info(`[剧情导演] ${终值日志行(账本.value.指标?.终值)}`);
  sync编剧备忘(账本.value, false, 设置.value);
  renew本幕指令(账本.value, 设置.value, true);
  console.info('[剧情导演] 剧终结算: 已停引擎(账本 + chat meta 双写)');
}
/** F 面板出口: 清除已剧终(两边都清), 自动路径恢复。规格 B4: **连 收官请求 与 终值 一起清**, 否则会一直出收束幕 */
function 清除剧终() {
  解除剧终(账本.value);
  写已剧终(false);
  saveData(账本.value);
  sync编剧备忘(账本.value, 设置.value.导演.注入世界书条目, 设置.value);
  renew本幕指令(账本.value, 设置.value, false);
  console.info('[剧情导演] 已清除「已剧终」(含收官请求与结算快照), 自动路径恢复');
}
/** I 手动恢复自动接管(连败计数清零、解除暂停) */
function 恢复自动接管() {
  离线.value = 设自动暂停(false);
  console.info('[剧情导演] 已手动恢复自动接管');
}
function 清空离线计数() {
  离线.value = 清推进失败();
}
/** H 测试连接: 两步探测, 把配置缺失/接口真错/推理模型吃满预算分类报出 */
async function 点击测试连接() {
  测试中.value = true;
  try {
    // 刚在输入框里改的配置还没过 300ms 防抖, 这里先立即落盘再测
    立即保存设置(设置.value);
    测试结果.value = await 测试连接();
  } catch (error) {
    测试结果.value = { 可用: false, 类别: '未知', 提示: error instanceof Error ? error.message : String(error), 探测: [] };
  } finally {
    测试中.value = false;
  }
}
/** 账本修笔: 手动改状态并立即写回快照(删中段楼后纠正用) */
function 改伏笔状态(编号: number, 值: string) {
  const 条 = 账本.value.伏笔.find(item => item.编号 === 编号);
  if (!条) return;
  条.状态 = 值 as 伏笔状态;
  saveData(账本.value);
  sync编剧备忘(账本.value, 设置.value.导演.注入世界书条目, 设置.value);
  console.info(`[剧情导演] 修笔：伏笔 #${编号} → ${值}`);
}
function 改冲突阶段(名: string, 值: string) {
  const 条 = 账本.value.冲突.find(item => item.名 === 名);
  if (!条) return;
  条.阶段 = 值 as 冲突阶段;
  saveData(账本.value);
  sync编剧备忘(账本.value, 设置.value.导演.注入世界书条目, 设置.value);
  console.info(`[剧情导演] 修笔：冲突「${名}」→ ${值}`);
}
function 改弧线阶段(角色: string, 值: string) {
  const 条 = 账本.value.弧线.find(item => item.角色 === 角色);
  if (!条) return;
  条.阶段 = 值;
  saveData(账本.value);
  console.info(`[剧情导演] 修笔：弧线「${角色}」→ ${值}`);
}
async function 复制报错() {
  const text = [debug.value?.error, debug.value?.request, debug.value?.response].filter(Boolean).join('\n\n────────\n\n');
  try {
    await navigator.clipboard.writeText(text || '(无报错)');
  } catch {
    console.warn('[剧情导演] 复制失败');
  }
}
</script>

<style lang="scss" scoped>
/* ==========================================================================
 * 方向 A · 排练厅手稿（用户 2026-10-07 选定）+ **全自绘控件层**
 * 规范来源：docs/mockups/剧情导演-界面重做-三方向.html 的 A 稿；规格 docs/剧情导演-界面重做-规格-v1.md
 *
 * 三条硬约束（测试逐条钉住）：
 *  1. **零原生控件**：滑块(::-webkit-slider-* / ::-moz-range-*) · 勾选→自绘开关 · 下拉→自绘 listbox ·
 *     折叠→自绘 caret · 滚动条(::-webkit-scrollbar 三件套 + scrollbar-width/color) · ::selection · 统一 :focus-visible;
 *  2. **颜色/间距/圆角全部来自 主题.ts**（`var(--dj-*)`），样式里零硬编码色；间距走 4px 栅格变量(--dj-s1..s6);
 *  3. **布局只用 in-flow**：下拉**就地展开**、球用 **CSS Grid 叠层**、披露用 max-height —— 本文件**没有**新增 position:absolute
 *     （页签选中下划线那处是风格 B 就有的既有写法，规范稿里也是这么画的）。
 * A 的材质：衬线标题与衬线数字、纸面细纹(--dj-paper)、滑块=红笔笔尖、开关=铜拨片、下拉=活页清单、披露=折角、留白最大。
 * ========================================================================== */

/* ---------------------------------------------------------------- 舞台 */
.dj-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font: 12.5px/1.55 var(--dj-body);
  color: var(--dj-ink);
}

/* ---------------------------------------------------------------- 悬浮球
 * 球用 **grid 叠层**（环与球标各占 grid-area:1/1）实现重叠 —— 不新增 absolute。
 * 球标 = **场次刻度**（三根不同高度竖线 + 淡基线），自绘 SVG、单色描边 1.6px、宽取球的 47%；
 * **球标承担身份、不承担状态**：五态只改环/色/动效，球标形态不变。 */
.dj-orb {
  position: absolute;
  left: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: var(--dj-orb-size, 40px);
  height: var(--dj-orb-size, 40px);
  border: 1px solid var(--dj-line-strong);
  border-radius: 50%;
  background-color: var(--dj-panel);
  background-image: var(--dj-sheen);
  box-shadow: inset 0 1px 0 var(--dj-line-strong), inset 0 -6px 12px var(--dj-bg), inset 0 0 0 1px var(--dj-bg);
  color: var(--dj-ink-dim);
  pointer-events: auto;
  cursor: grab;
  z-index: var(--dj-z-orb, 4);
  user-select: none;
}
.dj-orb:active { cursor: grabbing; }
.dj-orb.open { border-color: var(--dj-seal); }
.dj-orb-ring {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  border: 1px solid transparent;
  border-radius: 50%;
}
.dj-orb-glyph {
  grid-area: 1 / 1;
  display: grid;
  place-items: center;
  width: 47%;
  height: 47%;
  font-size: 0;
}
svg.dj-mark {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* 场次刻度的三根线（编排中时依次亮起）与淡基线 */
.dj-tk1, .dj-tk2, .dj-tk3 { opacity: 0.35; }
.dj-tk-base { opacity: 0.38; }
/* 五态：形态与球标都不变，只换环/色/动效 */
.dj-orb[data-态='待命'] { color: var(--dj-ink-dim); }
.dj-orb[data-态='编排中'] { color: var(--dj-seal); animation: dj-breathe 1.6s ease-in-out infinite; }
.dj-orb[data-态='编排中'] .dj-orb-ring {
  border-top-color: var(--dj-seal);
  border-right-color: var(--dj-seal);
  animation: dj-orb-spin 1.6s linear infinite;
}
.dj-orb[data-态='编排中'] .dj-tk { animation: dj-tick 1.6s ease-in-out infinite; }
.dj-orb[data-态='编排中'] .dj-tk2 { animation-delay: 0.18s; }
.dj-orb[data-态='编排中'] .dj-tk3 { animation-delay: 0.36s; }
.dj-orb[data-态='出错'] {
  color: var(--dj-seal);
  border-color: var(--dj-seal);
  box-shadow: inset 0 0 0 2px var(--dj-seal), inset 0 -6px 12px var(--dj-bg);
}
.dj-orb[data-态='离线'] { color: var(--dj-ink-faint); border-style: dashed; }
.dj-orb[data-态='离线'] .dj-orb-glyph { opacity: 0.5; }
.dj-orb[data-态='剧终'] {
  color: var(--dj-ink-faint);
  border-color: var(--dj-seal);
  box-shadow: inset 0 0 0 2px var(--dj-seal), inset 0 0 0 3px var(--dj-panel), inset 0 -6px 12px var(--dj-bg);
}
@keyframes dj-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes dj-orb-spin { to { transform: rotate(360deg); } }
@keyframes dj-tick { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes dj-sweep { 0%, 100% { background-position: 0% 0; } 50% { background-position: 100% 0; } }

/* ---------------------------------------------------------------- 面板骨架 */
.dj-panel {
  position: absolute;
  left: 0;
  top: 0;
  background-color: var(--dj-panel);
  background-image: var(--dj-paper);
  border: 1px solid var(--dj-line);
  border-radius: var(--dj-radius);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: var(--dj-z-panel, 3);
}
.dj-head {
  display: flex;
  align-items: center;
  gap: var(--dj-s2);
  padding: var(--dj-s3) var(--dj-s3);
  border-bottom: 1px solid var(--dj-line);
  background-color: var(--dj-raise);
  background-image: var(--dj-paper);
  cursor: move;
}
/* 层级 L1：衬线 + 最大字号 + 最亮墨 + 字距 */
.dj-title { font-family: var(--dj-serif); font-size: 17px; font-weight: 600; letter-spacing: 0.5px; color: var(--dj-ink-strong); }
.dj-sub { color: var(--dj-ink-faint); font-size: 11px; flex: 1; }
.dj-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--dj-radius);
  color: var(--dj-ink-dim);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.dj-x:hover { color: var(--dj-ink); border-color: var(--dj-line-strong); }
.dj-tabs {
  display: flex;
  gap: 2px;
  padding: 0 var(--dj-s2);
  border-bottom: 1px solid var(--dj-line);
  background-color: var(--dj-raise);
  background-image: var(--dj-paper);
}
.dj-tabs button {
  position: relative;
  background: none;
  border: 0;
  color: var(--dj-ink-dim);
  padding: var(--dj-s2) var(--dj-s3) var(--dj-s2);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  transition: color 0.15s ease;
}
.dj-tabs button:hover { color: var(--dj-ink); }
.dj-tabs button.on { color: var(--dj-ink-strong); }
.dj-tabs button.on::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--dj-seal);
  border-radius: var(--dj-radius) var(--dj-radius) 0 0;
  transition: background 0.15s ease;
}
.dj-tabs .dj-theme { margin-left: auto; }
.dj-body { flex: 1; overflow: auto; padding: var(--dj-s3) var(--dj-s3) var(--dj-s4); }
.dj-sec { display: flex; flex-direction: column; gap: var(--dj-s3); }

/* ---------------------------------------------------------------- 卡片与层级 */
.dj-card {
  background: var(--dj-raise);
  border: 1px solid var(--dj-line);
  border-left: 2px solid var(--dj-line-strong);
  border-radius: var(--dj-radius);
  padding: var(--dj-s3);
  transition: border-color 0.15s ease;
}
.dj-card:has(.dj-metrics), .dj-card:has(.dj-pre) { border-left-color: var(--dj-seal); }
/* 层级 L2：分组标题 —— 小字号 + 600 + 次级墨 + 加宽字距 + § 记号 */
.dj-card-h { display: flex; align-items: center; gap: var(--dj-s1); color: var(--dj-ink-dim); font-size: 11.5px; font-weight: 600; letter-spacing: 0.8px; margin-bottom: var(--dj-s2); }
.dj-card-h::before { content: '§'; color: var(--dj-seal); font-family: var(--dj-serif); font-weight: 400; margin-right: 2px; }
.dj-card-h .k { color: var(--dj-ink-ghost); font-weight: 400; letter-spacing: 0; }
/* 层级 L3：正文 */
.dj-p { margin: var(--dj-s1) 0 0; color: var(--dj-ink); font-size: 12.5px; line-height: 1.55; }
/* 层级 L4：说明/次要（更小 + 更弱墨 + 更紧字距） */
.dj-hint { color: var(--dj-ink-faint); font-size: 10.5px; line-height: 1.5; letter-spacing: 0.1px; }
.dj-muted { color: var(--dj-ink-faint); font-size: 10.5px; margin-left: var(--dj-s1); font-variant-numeric: tabular-nums; }
.dj-row { padding: var(--dj-s1) 0; border-top: 1px solid var(--dj-line); }
.dj-row:first-of-type { border-top: none; }
.dj-tag {
  display: inline-flex;
  align-items: center;
  margin-left: var(--dj-s1);
  padding: 0 var(--dj-s1);
  border: 1px solid var(--dj-line);
  border-radius: var(--dj-radius);
  background: var(--dj-bg);
  color: var(--dj-ink-dim);
  font-size: 10px;
  font-family: var(--dj-num);
}
.dj-tag.warn { color: var(--dj-gold); border-color: var(--dj-gold); }
.dj-empty { display: inline-flex; align-items: center; gap: var(--dj-s1); color: var(--dj-ink-ghost); font-size: 11.5px; margin: var(--dj-s1) 0; }
.dj-divider { height: 1px; background: var(--dj-line); }

/* ---------------------------------------------------------------- 指令预览（舞台提示）与波形 */
.dj-pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--dj-bg);
  border: 1px solid var(--dj-line);
  border-left: 2px solid var(--dj-seal);
  border-radius: var(--dj-radius);
  padding: var(--dj-s2) var(--dj-s3);
  max-height: 260px;
  overflow: auto;
  font-family: var(--dj-serif);
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--dj-ink);
  font-variant-numeric: tabular-nums;
}
.dj-console { max-height: 180px; }
.dj-err { color: var(--dj-seal); }
.dj-tension { display: flex; align-items: baseline; gap: var(--dj-s1); }
.dj-tension-v { font-family: var(--dj-serif); font-variant-numeric: tabular-nums; font-size: 17px; font-weight: 600; color: var(--dj-ink-strong); }
.dj-bar { flex: 1; height: 5px; background: var(--dj-bg); border: 1px solid var(--dj-line); border-radius: var(--dj-radius); overflow: hidden; }
.dj-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--dj-good), var(--dj-gold), var(--dj-seal)); }
.dj-beats { margin-top: var(--dj-s2); display: flex; flex-wrap: wrap; gap: var(--dj-s1); }
.dj-beat { padding: 1px var(--dj-s1); border: 1px solid var(--dj-line); border-radius: var(--dj-radius); background: var(--dj-bg); color: var(--dj-ink-dim); font-size: 10px; }

/* ---------------------------------------------------------------- 按钮（朱红填充全屏只有 1 处主操作） */
.dj-actions { display: flex; flex-wrap: wrap; gap: var(--dj-s1); margin-top: var(--dj-s2); }
.dj-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--dj-s1);
  padding: var(--dj-s1) var(--dj-s3);
  background: var(--dj-raise);
  color: var(--dj-ink);
  border: 1px solid var(--dj-line-strong);
  border-radius: var(--dj-radius);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.dj-btn:hover { background: var(--dj-hover); }
.dj-btn:disabled { opacity: 0.45; cursor: default; }
.dj-btn.danger { border-color: var(--dj-seal); color: var(--dj-seal); background: none; }
.dj-btn.danger:hover { background: var(--dj-ctl-on); }
.dj-mini {
  display: inline-flex;
  align-items: center;
  gap: var(--dj-s1);
  background: none;
  border: 1px solid var(--dj-line);
  border-radius: var(--dj-radius);
  color: var(--dj-ink-dim);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  padding: 1px var(--dj-s2);
  margin-left: auto;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.dj-mini:hover { color: var(--dj-ink); border-color: var(--dj-line-strong); }

/* ---------------------------------------------------------------- 表单（数字框去掉原生转轮） */
.dj-field { display: flex; flex-direction: column; gap: var(--dj-s1); margin: var(--dj-s2) 0; color: var(--dj-ink-dim); font-size: 11.5px; }
.dj-field.inline { display: inline-flex; flex-direction: column; width: auto; margin-right: var(--dj-s3); }
.dj-field.inline input { width: 90px; }
.dj-input {
  width: 100%;
  padding: var(--dj-s1) var(--dj-s2);
  background: var(--dj-bg);
  border: 1px solid var(--dj-line);
  border-radius: var(--dj-radius);
  color: var(--dj-ink);
  font: inherit;
  font-size: 12px;
  transition: border-color 0.15s ease;
}
.dj-input::placeholder { color: var(--dj-ink-ghost); }
.dj-input:hover { border-color: var(--dj-line-strong); }
.dj-input[type='number'] { appearance: textfield; -moz-appearance: textfield; }
.dj-input[type='number']::-webkit-outer-spin-button,
.dj-input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.dj-inline { display: flex; align-items: center; gap: var(--dj-s2); flex-wrap: wrap; margin-top: var(--dj-s2); }
.dj-input-sm { display: inline-block; width: 120px; margin-left: var(--dj-s1); padding: 2px var(--dj-s2); }
.dj-death { border-color: var(--dj-seal); border-left-color: var(--dj-seal); }
.dj-adjust { margin-top: var(--dj-s2); border-top: 1px solid var(--dj-line); padding-top: var(--dj-s2); }
.dj-adjust-h { font-size: 11.5px; color: var(--dj-ink-dim); margin-bottom: var(--dj-s1); }
.dj-adjust-list { margin: 0; padding-left: var(--dj-s4); }
.dj-adjust-list li { font-size: 11.5px; color: var(--dj-ink-faint); line-height: 1.55; }
.dj-adv { margin-top: var(--dj-s2); border-top: 1px solid var(--dj-line); padding-top: var(--dj-s2); }

/* ---------------------------------------------------------------- 状态条（四态语义色 + 圆点） */
.dj-status { border-left-width: 3px; background: var(--dj-bg); padding: var(--dj-s2) var(--dj-s3); font-size: 11.5px; }
.dj-status-h { display: flex; align-items: center; gap: var(--dj-s2); }
.dj-status-h::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dj-line-strong); flex: none; }
.dj-status-h b { font-size: 12.5px; font-weight: 600; }
.dj-status-over { border-left-color: var(--dj-seal); }
.dj-status-over .dj-status-h::before { background: var(--dj-seal); }
.dj-status-over .dj-status-h b { color: var(--dj-seal); }
.dj-status-off { border-left-color: var(--dj-ink-faint); }
.dj-status-off .dj-status-h::before { background: var(--dj-ink-faint); }
.dj-status-warn { border-left-color: var(--dj-gold); }
.dj-status-warn .dj-status-h::before { background: var(--dj-gold); }
.dj-status-cold { border-left-color: var(--dj-ink-faint); }
.dj-status-cold .dj-status-h::before { background: var(--dj-ink-faint); }
.dj-status-on { border-left-color: var(--dj-good); }
.dj-status-on .dj-status-h::before { background: var(--dj-good); }
.dj-status-on .dj-status-h b { color: var(--dj-good); }
/* 编排中：不确定态细进度条（只回答「在跑」，**不表示真实百分比**） */
.dj-progress {
  height: 2px;
  margin-top: var(--dj-s2);
  border-radius: var(--dj-radius);
  background-color: var(--dj-line);
  background-image: linear-gradient(90deg, var(--dj-ctl-fill), var(--dj-seal), var(--dj-ctl-fill));
  background-repeat: no-repeat;
  background-size: 40% 100%;
  animation: dj-sweep 1.6s ease-in-out infinite;
}

/* ---------------------------------------------------------------- 指标卡（A：衬线数字） */
.dj-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--dj-s1); margin: var(--dj-s1) 0 var(--dj-s2); }
.dj-metric { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-size: 10px; color: var(--dj-ink-ghost); letter-spacing: 0.2px; }
.dj-metric b {
  font-family: var(--dj-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--dj-ink-strong);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}
.dj-metric em { font-style: normal; font-size: 10px; color: var(--dj-ink-faint); font-family: var(--dj-num); font-variant-numeric: tabular-nums; }
.dj-metric .dj-bad { color: var(--dj-seal); text-decoration: underline dotted var(--dj-seal); }
.dj-spark { display: flex; align-items: flex-end; gap: 2px; height: 26px; margin-top: var(--dj-s2); border-bottom: 1px solid var(--dj-line); padding-bottom: 2px; }
.dj-spark i { display: block; width: 5px; border-radius: 1px 1px 0 0; background: linear-gradient(180deg, var(--dj-gold), var(--dj-seal)); }
.dj-err-line { display: flex; align-items: flex-start; gap: var(--dj-s1); color: var(--dj-seal); font-size: 11.5px; margin: var(--dj-s1) 0; }
.dj-ok-line { display: flex; align-items: flex-start; gap: var(--dj-s1); color: var(--dj-good); font-size: 11.5px; margin: var(--dj-s1) 0; }
.dj-confirm { margin-top: var(--dj-s2); border-top: 1px solid var(--dj-line); padding-top: var(--dj-s2); }
/* 总开关关掉时：左边线转灰 + 分组标题转弱墨 —— 一眼看出"停用中"（不动尺寸/不动布局） */
.dj-master-off { border-left: 2px solid var(--dj-ink-faint); }
.dj-master-off .dj-card-h { color: var(--dj-ink-faint); }
.dj-final { border-left: 2px solid var(--dj-seal); }
.dj-final-ops { border-left: 2px solid var(--dj-line-strong); }

/* ---------------------------------------------------------------- 防剧透折叠（显示层） */
.dj-fold { display: flex; align-items: baseline; gap: var(--dj-s1); }
.dj-folded { cursor: pointer; }
.dj-folded:hover { color: var(--dj-ink-dim); }
.dj-fold-icon { align-self: center; color: var(--dj-ink-ghost); }

/* ---------------------------------------------------------------- 图标 */
svg.i { width: 13px; height: 13px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.dj-head svg.i, .dj-tabs svg.i { width: 14px; height: 14px; }

/* ==========================================================================
 * 自绘控件层（dj-ctl*）—— 规格 §1.1 的六条，逐条实现
 * ========================================================================== */

/* ① 滑块：红笔笔尖（app/::-webkit-* 与 ::-moz-* 都自绘；刻度 + 读数 + 焦点环 + 禁用） */
.dj-ctl-field { display: flex; flex-direction: column; gap: var(--dj-s1); }
.dj-ctl-lab { display: flex; align-items: baseline; gap: var(--dj-s2); font-size: 11.5px; color: var(--dj-ink-dim); }
.dj-ctl-readout { margin-left: auto; font-family: var(--dj-num); font-variant-numeric: tabular-nums; color: var(--dj-ink); font-size: 11.5px; }
.dj-ctl-range { -webkit-appearance: none; appearance: none; width: 100%; height: 20px; margin: 0; background: none; cursor: pointer; }
.dj-ctl-range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: var(--dj-radius);
  background: linear-gradient(90deg, var(--dj-ctl-fill) var(--fill, 50%), var(--dj-ctl-track) var(--fill, 50%));
}
.dj-ctl-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 17px;
  margin-top: -7px;
  border-radius: var(--dj-radius);
  background: var(--dj-ctl-knob);
  border: 1px solid var(--dj-seal);
  box-shadow: inset 0 -3px 0 var(--dj-ctl-on);
}
.dj-ctl-range::-moz-range-track { height: 3px; border-radius: var(--dj-radius); background: var(--dj-ctl-track); }
.dj-ctl-range::-moz-range-progress { height: 3px; border-radius: var(--dj-radius); background: var(--dj-ctl-fill); }
.dj-ctl-range::-moz-range-thumb { width: 11px; height: 16px; border-radius: var(--dj-radius); background: var(--dj-ctl-knob); border: 1px solid var(--dj-seal); }
.dj-ctl-range:focus { outline: none; }
.dj-ctl-range:focus-visible { outline: 2px solid var(--dj-focus); outline-offset: var(--dj-s1); border-radius: var(--dj-radius); }
.dj-ctl-range:disabled { opacity: 0.45; cursor: default; }
.dj-ctl-ticks { display: flex; justify-content: space-between; align-items: center; padding: 0 var(--dj-s1); }
.dj-ctl-ticks i { width: 1px; height: 4px; background: var(--dj-line-strong); }
.dj-ctl-ticks b { font-size: 10px; font-weight: 400; color: var(--dj-ink-ghost); font-family: var(--dj-num); }

/* ② 勾选 → 自绘开关（铜拨片）：保 input[type=checkbox] 语义（Space 可切），外观全自绘，零 absolute */
.dj-check { display: flex; align-items: center; gap: var(--dj-s2); margin: var(--dj-s1) 0; color: var(--dj-ink); font-size: 11.5px; cursor: pointer; user-select: none; }
.dj-check input[type='checkbox'] { appearance: none; -webkit-appearance: none; width: 1px; height: 1px; margin: 0; padding: 0; border: 0; opacity: 0; overflow: hidden; }
.dj-ctl-sw {
  display: grid;
  grid-template-columns: 14px;
  align-items: center;
  justify-content: start;
  flex: none;
  width: 34px;
  height: 18px;
  padding: 2px;
  background: var(--dj-ctl-off);
  border: 1px solid var(--dj-line-strong);
  border-radius: var(--dj-radius);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.dj-ctl-knob { grid-area: 1 / 1; width: 12px; height: 12px; border-radius: 1px; background: var(--dj-ctl-knob); transition: transform 0.15s ease; }
.dj-check input:checked + .dj-ctl-sw { background: var(--dj-ctl-on); border-color: var(--dj-seal); }
.dj-check input:checked + .dj-ctl-sw .dj-ctl-knob { transform: translateX(16px); background: var(--dj-seal); }
.dj-check input:focus-visible + .dj-ctl-sw { outline: 2px solid var(--dj-focus); outline-offset: 2px; }
.dj-check input:disabled + .dj-ctl-sw { opacity: 0.45; }

/* ③ 下拉 → 自绘 listbox（就地展开，不浮层、不 absolute、无原生下拉外观） */
.dj-ctl-dd { display: flex; flex-direction: column; gap: var(--dj-s1); }
/* 旧类名保留（规格 §1.4-19 类名契约）：现在挂在自绘下拉的触发器(button)上 */
.dj-select { }
.dj-ctl-dd-btn {
  display: flex;
  align-items: center;
  gap: var(--dj-s2);
  width: 100%;
  padding: var(--dj-s1) var(--dj-s2);
  background: var(--dj-bg);
  color: var(--dj-ink);
  border: 1px solid var(--dj-line);
  border-radius: var(--dj-radius);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.dj-ctl-dd-btn:hover { border-color: var(--dj-line-strong); background: var(--dj-raise); }
.dj-ctl-dd-btn[aria-expanded='true'] { border-color: var(--dj-seal); }
.dj-ctl-val { flex: 1; }
.dj-ctl-caret {
  width: 7px;
  height: 7px;
  flex: none;
  border-right: 1.5px solid var(--dj-ink-dim);
  border-bottom: 1.5px solid var(--dj-ink-dim);
  transform: rotate(45deg) translateY(-2px);
  transition: transform 0.15s ease;
}
.dj-ctl-dd-btn[aria-expanded='true'] .dj-ctl-caret { transform: rotate(-135deg) translateY(-1px); }
.dj-ctl-list {
  list-style: none;
  margin: 0;
  padding: var(--dj-s1);
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--dj-list-bg);
  border: 1px solid var(--dj-seal);
  border-radius: var(--dj-radius);
}
.dj-ctl-list li { padding: var(--dj-s1) var(--dj-s2); border-radius: 1px; font-size: 11.5px; color: var(--dj-ink-dim); cursor: pointer; }
.dj-ctl-list li:hover { background: var(--dj-hover); color: var(--dj-ink); }
.dj-ctl-list li[aria-selected='true'] { color: var(--dj-ink); }
.dj-ctl-list li[aria-selected='true']::before { content: '›'; color: var(--dj-seal); font-weight: 700; margin-right: var(--dj-s1); }
.dj-ctl-list li:focus-visible { outline: 2px solid var(--dj-focus); outline-offset: -2px; }

/* ④ 折叠 → 自绘披露（折角 caret + 高度动效，零原生折叠三角） */
.dj-ctl-disc {
  display: flex;
  align-items: center;
  gap: var(--dj-s2);
  width: 100%;
  padding: var(--dj-s2) 0;
  background: none;
  border: 0;
  border-top: 1px solid var(--dj-line);
  color: var(--dj-ink-dim);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  transition: color 0.15s ease;
}
.dj-ctl-disc:hover { color: var(--dj-ink); }
.dj-ctl-disc[aria-expanded='true'] .dj-ctl-caret { transform: rotate(-135deg) translateY(-1px); }
.dj-ctl-n { margin-left: auto; font-family: var(--dj-num); font-size: 10px; color: var(--dj-ink-ghost); }
.dj-ctl-disc-body {
  display: flex;
  flex-direction: column;
  gap: var(--dj-s2);
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-height 0.18s ease, opacity 0.18s ease;
}
.dj-ctl-disc-body.open { max-height: 640px; opacity: 1; }

/* ④bis 文本类输入一律主题化（规格 §1.1bis）：**不看类名**，按元素上下文接管
   起因：用户实机发现"接口的地址、密钥居然还是原生的，都还是白的" ——
   根因是旧规则只挂在 .dj-input 这个类上, 而地址/密钥/8 个 number 都没带类名 ⇒ 落回 UA 默认
   （computed style 实测: 背景 rgb(255,255,255)、描边 rgb(118,118,118)、高 21.2px）。
   这里用 :not() 排掉自绘的 checkbox 与 range，其余（text/password/number/search/url/email/无 type/textarea）全部接管。 */
.dj-root input:not([type='checkbox']):not([type='range']),
.dj-root textarea {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  padding: var(--dj-s1) var(--dj-s2);
  background: var(--dj-bg);
  border: 1px solid var(--dj-line);
  border-radius: var(--dj-radius);
  color: var(--dj-ink);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  transition: border-color 0.15s ease;
}
.dj-root input:not([type='checkbox']):not([type='range']):hover,
.dj-root textarea:hover { border-color: var(--dj-line-strong); }
.dj-root input:not([type='checkbox']):not([type='range'])::placeholder,
.dj-root textarea::placeholder { color: var(--dj-ink-ghost); }
.dj-root input:not([type='checkbox']):not([type='range']):disabled,
.dj-root textarea:disabled { opacity: 0.45; }
.dj-root input[type='number'] { appearance: textfield; -moz-appearance: textfield; }
.dj-root input[type='number']::-webkit-outer-spin-button,
.dj-root input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.dj-root input[type='search']::-webkit-search-cancel-button { -webkit-appearance: none; }

/* ⑤ 滚动条：自绘（细轨 + 悬停加重） */
.dj-body, .dj-pre { scrollbar-width: thin; scrollbar-color: var(--dj-line-strong) transparent; }
.dj-body::-webkit-scrollbar, .dj-pre::-webkit-scrollbar { width: 8px; height: 8px; }
.dj-body::-webkit-scrollbar-track, .dj-pre::-webkit-scrollbar-track { background: transparent; }
.dj-body::-webkit-scrollbar-thumb, .dj-pre::-webkit-scrollbar-thumb {
  background: var(--dj-line-strong);
  border: 2px solid transparent;
  border-radius: var(--dj-radius);
  background-clip: content-box;
}
.dj-body::-webkit-scrollbar-thumb:hover, .dj-pre::-webkit-scrollbar-thumb:hover { background: var(--dj-ink-ghost); background-clip: content-box; }

/* ⑥ 选区与全局焦点环（不许浏览器默认蓝框） */
.dj-root ::selection { background: var(--dj-seal); color: var(--dj-on-accent); }
.dj-root :focus { outline: none; }
.dj-root :focus-visible { outline: 2px solid var(--dj-focus); outline-offset: 2px; border-radius: var(--dj-radius); }

/* ---------------------------------------------------------------- 减弱动效：全关（编排中的呼吸环换成静态朱红环） */
@media (prefers-reduced-motion: reduce) {
  .dj-root *, .dj-root *::before, .dj-root *::after { transition: none !important; animation: none !important; }
  .dj-orb[data-态='编排中'] { box-shadow: inset 0 0 0 3px var(--dj-seal), inset 0 -6px 12px var(--dj-bg); }
  .dj-orb[data-态='编排中'] .dj-orb-ring { border-color: var(--dj-seal); }
  .dj-progress { background-position: 50% 0; }
}

</style>
