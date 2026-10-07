import { useHost } from './host';
import { pinia } from './pinia';
import { 层序, 悬浮球直径 } from './主题';
import 悬浮球界面 from './悬浮球界面.vue';
import { createApp } from 'vue';

const SRCDOC = `<!DOCTYPE html><html><head><style>*,*::before,*::after{box-sizing:border-box;}html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent;}body:focus,html:focus{outline:none;}</style></head><body></body></html>`;

function copyStylesTo(nestedDoc: Document) {
  const existing = new Set([...nestedDoc.head.querySelectorAll('style')].map(style => style.textContent));
  document.head.querySelectorAll('style').forEach(style => {
    if (style.textContent && !existing.has(style.textContent)) {
      nestedDoc.head.appendChild(style.cloneNode(true));
    }
  });
}

$(() => {
  const app = createApp(悬浮球界面).use(pinia);
  if (!document.getElementById('dj-orb-force-style')) {
    const style = document.createElement('style');
    style.id = 'dj-orb-force-style';
    style.textContent = `
      iframe[script_id] { border: none !important; outline: none !important; box-shadow: none !important; background: transparent !important; }
      iframe[script_id]:focus, iframe[script_id]:focus-visible, iframe[script_id]:focus-within { outline: none !important; }`;
    document.head.appendChild(style);
  }
  const $app = $('<iframe>')
    .attr({ script_id: useHost().vars.scriptId(), frameborder: 0, tabindex: -1, srcdoc: SRCDOC })
    .css({
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: `${悬浮球直径}px`,
      height: `${悬浮球直径}px`,
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      // 挂载成功前绝不吃指针事件。这个壳一插进 DOM 就停在 [0,0] 且 40×40；
      // 若 setup 抛错（真机事故：useStateStore 未定义），onMounted 永不执行、位置永不迁走，
      // 它就会把左上角全部指针事件吃掉，压住别的插件（彼方、玉子手机都中过招）。
      pointerEvents: 'none',
      zIndex: String(层序.球iframe),
    })
    .appendTo('body');
  $app.on('load', () => {
    const nestedDoc = ($app[0] as HTMLIFrameElement).contentDocument;
    if (!nestedDoc) return;
    copyStylesTo(nestedDoc);
    app.mount(nestedDoc.body);
    // mount 走通 ⇒ onMounted 已把球迁到右下角，此刻才接管指针事件
    ($app[0] as HTMLIFrameElement).style.pointerEvents = 'auto';
    window.setTimeout(() => copyStylesTo(nestedDoc), 300);
    window.setTimeout(() => copyStylesTo(nestedDoc), 1200);
  });
  $(window).on('pagehide', () => {
    app.unmount();
    $app.remove();
  });
});
