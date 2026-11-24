// Preview presentation only. Existing routing, rendering and actions keep their timing.
const bloom = {
  duration: 450, stagger: 45, maximumDelay: 180,
  fromScale: .72, peakScale: 1.045, rise: 18, peakRise: -3,
  fromOpacity: 0, blur: 3, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)'
};

const cards = '.mp-product,.figma-product-card,.used-card,.sp-card,.sq-store,.mp-store-card,.mp-search-store,.sx-card,.category-card,.sm-card,.sw-ptile,.sw-product,.sw-public-product,.boutique-store-product,.cart-line,.ord,.sw-order,.dw-order,.dw-trip';
const groups = [
  '.section-title,.sq-head,.sp-head,.flow-heading,.buyer-cart-heading,.mc-head,.dh',
  '.header-brand,.header-logo,#buyerSearch,.figma-header-actions > button,.azure-search-back,.preview-promotion,[data-azure-header-action]',
  '.azure-category-children > button,.store-category-cards > button,.sm-cats > button',
  '.pd-media,.pd-head,.pd-owner-price,.pd-desc,.pd-specs,.pd-bar,.va-choice,.product-seller-card',
  '.sm-head,.sm-logo,.sm-info,.sm-facts,.sw-public-header,.boutique-store-hero,.boutique-store-section-title',
  '.azure-favorites-heading,.azure-favorites-info,.azure-favorites-art,.azure-favorites-empty h3,.azure-favorites-empty p,.azure-favorites-explore',
  '.empty > *, .buyer-checkout-card.empty > *, .dw-empty > *, .sw-empty > *, .sm-empty > *, .mc-empty > *',
  '.mc-summary,.mc-total,.mc-empty > *, .sq-empty > *, .sx-empty > *,.buyer-total,.buyer-checkout-actions,.order-progress,.cart-store > .mc-store-name',
  '.profile-card,.profile-heading,.st-group,.account-head,.account-shortcuts,.auth-top,.auth-field,.auth-submit,.auth-providers,.wa-login > label',
  '.sw-sitebar,.sw-header,.sw-card,.sw-toolbar,.sw-fold,.sw-dialog,.sw-drawer,.se-section,.dw-header,.dw-card,.dw-today,.dw-wallet',
  '.post-card,.post-actions,.pe-header,.filter-group,.filter-actions,.confirm-card,.confirm-actions',
  '.promo-editor-tabs,.promo-editor-stage,.promo-editor-actions,.promo-settings,.promo-picker-head,.promo-results > button',
  '.pa-bar,.pa-phone,.admin-hub-tabs,.admin-brand,.admin-tool-link,table',
  '.pl-role-cards > button,.promo-product,#toast,dialog[open],details[open] > :not(summary)'
].join(',');
const candidates = cards + ',' + groups;

export function mountAzureBloom() {
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  const shown = new Map();
  const seen = new WeakSet();
  const pending = new Set();
  let scheduled = false;
  let screen = '';
  let panel = '';
  let panelVisit = 0;

  function animate(element, delay, gentle) {
    const compress = gentle ? .42 : 1;
    const blur = !gentle && element.matches('.category-card,.promo-product') ? bloom.blur : 0;
    const keyframes = [
      {offset:0, translate:`0 ${bloom.rise * compress}px`, scale:1 - (1 - bloom.fromScale) * compress, opacity:bloom.fromOpacity},
      {offset:.7, translate:`0 ${bloom.peakRise * compress}px`, scale:1 + (bloom.peakScale - 1) * compress, opacity:1},
      {offset:1, translate:'0 0', scale:1, opacity:1}
    ];
    if (blur) keyframes.forEach((frame, index) => { frame.filter = `blur(${index ? 0 : blur}px)`; });
    // No backwards fill: delayed controls stay available and visible while waiting.
    const animation = element.animate(keyframes, {
      duration:gentle ? 300 : bloom.duration, delay, easing:bloom.easing
    });
    running.set(element, animation);
    animation.finished.catch(() => {}).finally(() => {
      if (running.get(element) === animation) running.delete(element);
    });
  }

  function scopeOf(element) {
    if (element.closest('#sheet')) return 'panel:' + panelVisit;
    if (element.closest('#view')) return screen;
    return 'chrome';
  }

  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio > 0)
      .map(entry => entry.target).filter(element => element.isConnected && pending.has(element));
    if (!visible.length) return;
    const rectangles = new Map(visible.map(element => [element, element.getBoundingClientRect()]));
    visible.sort((a,b) => {
      const first = rectangles.get(a), second = rectangles.get(b);
      return Math.round(first.top / 12) - Math.round(second.top / 12) || second.right - first.right;
    });
    visible.forEach((element, index) => {
      observer.unobserve(element);
      pending.delete(element);
      const scope = scopeOf(element);
      const key = element.dataset.bloomIdentity;
      if (!shown.has(scope)) shown.set(scope, new Set());
      const keys = shown.get(scope);
      if (key && keys.has(key)) return;
      if (key) keys.add(key);
      seen.add(element);
      if (reduced.matches || document.hidden || element.contains(document.activeElement)) return;
      animate(element, Math.min(index * bloom.stagger, bloom.maximumDelay),
        !!element.closest('.admin-preview-host,.promo-editor,.sw-shell,.dw-shell,.pd-bar') || element.id === 'toast');
    });
  }, {threshold:.05});

  function scan() {
    scheduled = false;
    for (const element of pending) {
      if (!element.isConnected) {
        observer.unobserve(element);
        pending.delete(element);
      }
    }
    const active = document.querySelector('.tabs [aria-current="page"],.tabs [aria-pressed="true"],.tabs .active,.tabs .on');
    const view = document.querySelector('#view');
    const heading = view?.querySelector('h1');
    const headingText = heading?.firstChild?.textContent.trim() || '';
    screen = [location.pathname,location.search,active?.dataset.a,active?.dataset.v,view?.firstElementChild?.className,headingText].join('|');
    const sheet = document.querySelector('#sheet');
    const shade = document.querySelector('#shade');
    const panelTitle = sheet?.querySelector('h1,h2')?.textContent.trim() || '';
    const nextPanel = sheet && !shade?.hidden && sheet.childElementCount ? panelTitle || sheet.firstElementChild.className : '';
    if (nextPanel !== panel) {
      if (panel) shown.delete('panel:' + panelVisit);
      panel = nextPanel;
      panelVisit++;
    }
    const repetitions = new Map();
    document.querySelectorAll(candidates).forEach(element => {
      if (element.closest('.tabs,.nav-glider,.co-page,.loading-overlay,[hidden],[aria-hidden="true"]')) return;
      if (element.parentElement.closest(cards)) return;
      if (!element.matches('#toast,.promo-product,.confirm-card,dialog')) {
        const action = (element.matches('[data-v]') ? element : element.querySelector('[data-v]'))?.dataset.v;
        const label = element.getAttribute('aria-label') || element.querySelector('h1,h2,h3,strong')?.textContent || (element.matches('button') ? element.textContent : '');
        const type = Array.from(element.classList).find(name => !['active','on','selected','added'].includes(name)) || element.tagName;
        const base = [scopeOf(element),type,action || label?.trim() || ''].join(':');
        const occurrence = repetitions.get(base) || 0;
        repetitions.set(base, occurrence + 1);
        if (!pending.has(element)) element.dataset.bloomIdentity = base + ':' + occurrence;
      }
      if (seen.has(element) || pending.has(element)) return;
      pending.add(element);
      observer.observe(element);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  const changes = new MutationObserver(records => {
    for (const record of records) {
      if (record.target.id === 'toast' && !record.target.hidden) seen.delete(record.target);
    }
    schedule();
  });
  changes.observe(document.body, {subtree:true, childList:true, attributes:true,
    attributeFilter:['hidden','open','aria-current','aria-expanded']});
  window.addEventListener('popstate', schedule);
  reduced.addEventListener('change', () => {
    if (reduced.matches) for (const animation of running.values()) animation.cancel();
  });
  scan();
}
