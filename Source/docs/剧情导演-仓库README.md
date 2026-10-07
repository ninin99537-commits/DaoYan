# 剧情导演 DaoYan

酒馆助手（SillyTavern · TavernHelper）的外部编剧插件。主 AI 生成前注入「本幕指令」，让剧情真正跌宕起伏：埋设伏笔、代价延续、真实挫折、不可逆失败——而不是一味顺着玩家舔。

## 产物位置

引子按 `master` 分支、路径 `dist/剧情导演/index.js` 拉取：

- `dist/剧情导演/index.js` —— 最终构建产物（导入的就是它）

## 导入酒馆（两种方式）

### A. 经本仓库的引子（推荐，离线也能 CDN 兜底）

把 `docs/剧情导演-经Github导入酒馆.js`（或本文件里下面的代码块）整个粘进酒馆：
「酒馆助手 → 新建脚本按钮 → 命名（如「剧情导演-导入」）→ 启用」。

它会先取仓库最新提交 sha，再按「jsdelivr(永久缓存/快) → jsdelivr-testingcf → raw(新鲜兜底)」顺序 import 最新构建；接口限流/离线都不影响（raw 5 分钟缓存 + jsdelivr@master 兜底）。

### B. 直接 import（适合开发期）

```js
import 'https://cdn.jsdelivr.net/gh/ninin99537-commits/DaoYan@master/dist/剧情导演/index.js';
```

## 需要外部条件

- 插件引擎依赖一个本地推理端点（默认 `http://127.0.0.1:8046/v1`），在插件的「设置 → 接口」里配；
- LoRA/记忆等其它插件与本插件并存不冲突。