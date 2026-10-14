import { html } from './dom.js';
import { icon } from './icons.js';
import { modal, toast } from './ui.js';

export const SHATRA = { lat: 31.4106, lon: 46.1712 };
let leaflet;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return (leaflet ||= new Promise((ok, fail) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'vendor/leaflet/leaflet.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => ok(window.L);
    s.onerror = () => fail(new Error('تعذّر تحميل الخريطة'));
    document.head.append(s);
  }));
}
export const validPoint = (p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
export const mapsLink = (p) => `https://www.google.com/maps?q=${+p.lat},${+p.lon}`;
export const directionsLink = (p) => `https://www.google.com/maps/dir/?api=1&destination=${+p.lat},${+p.lon}`;

// Center-pin picker: the user moves the map under a fixed pin, then confirms.
export function pickLocation({ value, title = 'حدّد الموقع على الخريطة', hint = 'حرّك الخريطة حتى يقع الدبوس على الموقع بدقة' } = {}) {
  return new Promise((resolve) => {
    let done = false,
      map;
    const d = modal(
      title,
      html`<div class="map-box lg" id="pickerMap"><div class="map-pin-hint">${icon('info', 16)} ${hint}</div>
        <div style="position:absolute;z-index:600;left:50%;top:50%;transform:translate(-50%,-100%);color:var(--brand);pointer-events:none">${icon('pin', 44)}</div>
        <button type="button" class="btn btn-sm map-locate" style="background:var(--surface);box-shadow:var(--shadow)" data-locate>${icon('locate', 18)} موقعي الحالي</button></div>
        <div class="row-actions"><button class="btn btn-primary" data-ok>${icon('check', 18)} تأكيد هذا الموقع</button><button class="btn btn-ghost" data-close>إلغاء</button></div>`,
      { size: 'lg', onClose: () => !done && resolve(null) },
    );
    loadLeaflet()
      .then((L) => {
        const start = validPoint(value) ? value : SHATRA;
        map = L.map(d.querySelector('#pickerMap'), { zoomControl: true, attributionControl: true }).setView([start.lat, start.lon], validPoint(value) ? 17 : 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        setTimeout(() => map.invalidateSize(), 150);
        if (!validPoint(value)) locate();
      })
      .catch((e) => toast(e.message, 'error'));
    function locate() {
      if (!navigator.geolocation) return toast('خدمة الموقع غير متاحة على هذا الجهاز', 'error');
      const b = d.querySelector('[data-locate]');
      b.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          b.disabled = false;
          map?.setView([pos.coords.latitude, pos.coords.longitude], 17);
        },
        () => {
          b.disabled = false;
          toast('تعذّر تحديد موقعك. فعّل GPS واسمح للمتصفح بالوصول للموقع.', 'error');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    }
    d.querySelector('[data-locate]').addEventListener('click', locate);
    d.querySelector('[data-ok]').addEventListener('click', () => {
      if (!map) return;
      const c = map.getCenter();
      done = true;
      d.close();
      resolve({ lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) });
    });
  });
}
// Small static preview without loading Leaflet.
export function mapPreview(p, h = 160) {
  const b = 0.003;
  return html`<iframe title="الموقع على الخريطة" loading="lazy" style="width:100%;height:${h}px;border:0;border-radius:12px" src="${`https://www.openstreetmap.org/export/embed.html?bbox=${p.lon - b}%2C${p.lat - b}%2C${p.lon + b}%2C${p.lat + b}&layer=mapnik&marker=${p.lat}%2C${p.lon}`}"></iframe>`;
}
