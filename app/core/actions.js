// One delegated click listener for the whole app. Each page registers its own handlers,
// replaced on navigation, so re-rendering never stacks duplicate listeners.
let page = {};
const global = {};
export const pageActions = (handlers) => (page = handlers || {});
export const globalActions = (handlers) => Object.assign(global, handlers);
let wired = false;
export function wireActions(root = document) {
  if (wired) return;
  wired = true;
  root.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-action]');
    if (!el || el.disabled) return;
    const name = el.dataset.action;
    const fn = page[name] || global[name];
    if (!fn) return;
    if (el.tagName === 'A' && !el.hasAttribute('data-follow')) e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('routechange', () => {}, { passive: true });
}
