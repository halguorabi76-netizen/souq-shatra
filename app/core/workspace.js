import { html, render, $ } from './dom.js';
import { icon } from './icons.js';
import { current } from './router.js';
import { unmountShop, LOGO } from '../shop/shell.js';

// Sidebar layout shared by the seller center, driver app and admin console.
let key = '';
export function mountWorkspace({ id, title, subtitle, nav, footer }) {
  unmountShop();
  document.body.classList.remove('has-tabbar');
  document.body.classList.add('ws-mode');
  const k = id + title + JSON.stringify(nav.map((n) => n.href || n.sep));
  const path = '#' + current.path;
  const active = (n) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + '/'));
  if (key !== k || !$('#wsBody')) {
    render(
      '#app',
      html`<div class="ws" id="ws"><aside class="ws-side" aria-label="القائمة">
        <a class="brand" href="#/"><img src="${LOGO}" alt="" width="36" height="36"><span>${title}<small>${subtitle || 'سوق الشطرة'}</small></span></a>
        ${nav.map((n) => (n.sep ? html`<div class="sep">${n.sep}</div>` : html`<a href="${n.href}" data-nav="${n.href}" ${n.exact ? 'data-exact' : ''}>${icon(n.icon, 20)}<span>${n.label}</span>${n.count ? html`<span class="count">${n.count}</span>` : ''}</a>`))}
        <div style="flex:1"></div>${footer || ''}
      </aside><div class="ws-main"><header class="ws-top"><button class="icon-btn ws-menu-btn" data-ws-menu aria-label="القائمة">${icon('menu', 22)}</button><h1 id="wsTitle"></h1><div id="wsTopActions"></div></header><div class="ws-body" id="wsBody"></div></div></div>`,
    );
    key = k;
    $('[data-ws-menu]').addEventListener('click', () => $('#ws').classList.toggle('open'));
    $('#ws').addEventListener('click', (e) => {
      if (e.target.id === 'ws' || e.target.closest('.ws-side a')) $('#ws').classList.remove('open');
    });
  }
  // Badge counts change often; update them in place so the page body is never replaced.
  for (const n of nav) {
    const a = n.href && document.querySelector(`[data-nav="${CSS.escape(n.href)}"]`);
    if (!a) continue;
    let c = a.querySelector('.count');
    if (n.count && !c) a.insertAdjacentHTML('beforeend', '<span class="count"></span>'), (c = a.querySelector('.count'));
    if (c) n.count ? (c.textContent = n.count) : c.remove();
  }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.hasAttribute('data-exact') ? path === a.dataset.nav : active({ href: a.dataset.nav })));
  return $('#wsBody');
}
export function wsTitle(text, actions = '') {
  $('#wsTitle').textContent = text;
  render('#wsTopActions', actions);
  document.title = text + ' | سوق الشطرة';
}
export const resetWorkspace = () => (key = '');
