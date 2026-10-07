// ============================================================
// 剧情导演 · 经 GitHub 导入酒馆（引子方案）—— 仿「烟火」同款
// 仓库: ninin99537-commits/DaoYan · 产物: dist/剧情导演/index.js
//
// 用法：把整个 IIFE 粘进酒馆的「酒馆助手 → 新建脚本按钮」里，命名随意（如「剧情导演-导入」），启用即可。
//       它会从 DaoYan 仓库拉取最新构建并 import。依赖 :5500 或任意离线时也能靠 CDN 拿到。
// 说明：引子加载的是 build 出来的 dist 产物；源码型脚本（直接写功能）不需要这个方案。
// ============================================================
(async () => {
  const 仓库 = 'ninin99537-commits/DaoYan';
  const 文件 = 'dist/剧情导演/index.js';
  const 名 = '剧情导演';

  // 1) 问 GitHub 接口要最新提交 sha。未登录按 IP 限流 60 次/小时，频繁刷会 403，
  //    所以必须有"不靠接口也新鲜"的路 —— 一次拿不到就走兜底，403 不是重试能好的。
  let 引用 = '';
  try {
    const 响应 = await fetch(`https://api.github.com/repos/${仓库}/commits/master`, { cache: 'no-store' });
    const 提交 = await 响应.json();
    if (提交 && 提交.sha) 引用 = 提交.sha;
  } catch { /* 走兜底 */ }

  // 2) 顺序按"新鲜度"排，两种情形分开：
  //    · 拿到 sha: 带 sha 的 CDN 地址是永久缓存、绝不串版本，国内又快，放前面；
  //    · 没拿到 sha: **raw 必须第一** —— 只缓存 5 分钟；
  //      jsdelivr 的 @master 只能垫底：缓存 7 天，会一声不响喂回几天前的旧构建（烟火就是这么翻过车的）。
  const 戳 = `?t=${Date.now()}`;
  const 地址表 = 引用
    ? [`https://testingcf.jsdelivr.net/gh/${仓库}@${引用}/${文件}`,
       `https://cdn.jsdelivr.net/gh/${仓库}@${引用}/${文件}`,
       `https://raw.githubusercontent.com/${仓库}/${引用}/${文件}`]
    : [`https://raw.githubusercontent.com/${仓库}/master/${文件}${戳}`,
       `https://cdn.jsdelivr.net/gh/${仓库}@master/${文件}`,
       `https://testingcf.jsdelivr.net/gh/${仓库}@master/${文件}`];

  let 用了 = '';
  for (let 轮 = 1; 轮 <= 2 && !用了; 轮++) {
    for (const 地址 of 地址表) {
      try {
        await import(地址);
        用了 = 地址;
        break;
      } catch { /* 换下一个源 */ }
    }
    if (!用了) await new Promise(等 => setTimeout(等, 1500)); // jsdelivr 首次遇到新提交要回源
  }
  if (!用了) throw new Error('三个源都取不到构建');

  console.log(`[${名}] 引子已加载: ${引用 ? 引用.slice(0, 7) : 'master(接口没通, 用 raw 兜底)'} ← ${用了.replace(/\?t=\d+$/, '')}`);
})().catch(e => console.error('[剧情导演] 引子加载失败:', e));