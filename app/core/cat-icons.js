import { raw } from './dom.js';
// «خط الشطرة»: category icons drawn on the same 24×24 outline grid as icons.js,
// so every icon on the site belongs to one family. Paths are static strings.
// Each entry: [Arabic label for the admin picker, SVG paths].
export const CAT_ICONS = {
  basket: ['ماركت وسلة', '<path d="M3 10h18l-1.6 9a2 2 0 0 1-2 1.6H6.6a2 2 0 0 1-2-1.6Z"/><path d="m8 10 3-6m5 6-3-6"/><path d="M9 14v3m3-3v3m3-3v3"/>'],
  grain: ['حبوب', '<path d="M12 22V8"/><path d="M12 8c-2-1-2.5-3-1.5-5 2 .9 2.5 3 1.5 5Zm0 0c2-1 2.5-3 1.5-5-2 .9-2.5 3-1.5 5Zm0 5c-2.5-.2-4-2-4-4 2.4.1 4 1.8 4 4Zm0 0c2.5-.2 4-2 4-4-2.4.1-4 1.8-4 4Zm0 5c-2.5-.2-4-2-4-4 2.4.1 4 1.8 4 4Zm0 0c2.5-.2 4-2 4-4-2.4.1-4 1.8-4 4Z"/>'],
  carrot: ['خضار', '<path d="M14.5 9.5 4 20c4-1 9.5-4.5 12-8a2.8 2.8 0 0 0-1.5-2.5Z"/><path d="M15 9c1-2 3-3.5 5-3.5M15 9c0-2.2.8-4.4 2.5-6M15 9c-1.5-1-2.2-2.6-2-4.5"/><path d="m8 15.5 1.5 1.5m1-4.5 1.5 1.5"/>'],
  apple: ['فواكه', '<path d="M12 7.5c-1.6-1.3-5.5-1.6-7 1.5-1.6 3.4.4 9 3.4 10.6 1.3.7 2.3 0 3.6 0s2.3.7 3.6 0c3-1.6 5-7.2 3.4-10.6-1.5-3.1-5.4-2.8-7-1.5Z"/><path d="M12 7.5c0-2 .8-3.6 2.5-4.5"/>'],
  palm: ['تمور', '<path d="M12 21V10"/><path d="M12 10C10 6 6 5 3 6.5c3 .5 5 1.8 6 3.5m3 0c2-4 6-5 9-3.5-3 .5-5 1.8-6 3.5m-3 0c-1-3.5 0-6 3-7.5M12 10c1-3.5 0-6-3-7.5"/><circle cx="10" cy="13.5" r="1"/><circle cx="14" cy="13.5" r="1"/>'],
  bread: ['مخبوزات وأفران', '<path d="M5 11a4 4 0 0 1 1-7.8C8 3 9.5 4 12 4s4-1 6-.8a4 4 0 0 1 1 7.8V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="M9 9.5 10.5 8m2.5 2 1.5-1.5"/>'],
  cake: ['حلويات', '<path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z"/><path d="M4 15c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0"/><path d="M12 11V7"/><path d="M12 7c-1 0-1.5-.8-1.5-1.5S12 3 12 3s1.5 1.8 1.5 2.5S13 7 12 7Z"/>'],
  icecream: ['مرطبات وآيس كريم', '<path d="M7 10a5 5 0 0 1 10 0"/><path d="M6.5 10h11L12 21Z"/><path d="m9 13 4.5 3M15 13l-4.5 3"/>'],
  cloche: ['مطاعم', '<path d="M3 17h18M2 20h20"/><path d="M4.5 17a7.5 7.5 0 0 1 15 0"/><path d="M12 9.5v-2m-1.5 0h3"/>'],
  pot: ['أكلات بيتية', '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M2 10h2m16 0h2"/><path d="M9 6.5c0-1 1-1.5 1-2.5m3 2.5c0-1 1-1.5 1-2.5"/>'],
  fish: ['لحوم وأسماك', '<path d="M3 12c3-5 9-6.5 13-3l4-3v12l-4-3c-4 3.5-10 2-13-3Z"/><circle cx="8" cy="11" r=".9"/>'],
  milk: ['ألبان', '<path d="M8 2h8M9 2v3L7 8v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8l-2-3V2"/><path d="M7 12c2 1 3.5-1 5 0s3 1 5 0"/>'],
  cup: ['قهوة وشاي', '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5c0 1-1 1.5-1 2.5m5-2.5c0 1-1 1.5-1 2.5"/>'],
  bottle: ['مشروبات وعصائر', '<path d="M9 2h6m-5 0v4L8 9v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V2"/><path d="M8 13h8"/>'],
  shirt: ['ملابس', '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z"/>'],
  dress: ['عبايات وفساتين', '<path d="M9 3h6l-1 4 5 14H5l5-14Z"/><path d="M10 7h4"/>'],
  shoe: ['أحذية', '<path d="M3 17V8h5l2 3 6 1.5a4 4 0 0 1 3 3.9V17Z"/><path d="M3 17h18v2H3Z"/><path d="m11 11.5-1 2.5m4-1.7-.7 2.2"/>'],
  purse: ['حقائب', '<path d="M4 10h16l-1.4 9.2a1 1 0 0 1-1 .8H6.4a1 1 0 0 1-1-.8Z"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/><path d="M11 14h2"/>'],
  scissors: ['خياطة', '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/>'],
  yarn: ['أشغال يدوية', '<circle cx="12" cy="12" r="8"/><path d="M6 6.5c4 2 8 7 9 13M4.5 12c4 0 9 3 11 7.5M9 4.3c3 3 5.5 8.5 5 13"/>'],
  perfume: ['عطور', '<rect x="6" y="9" width="12" height="12" rx="3"/><path d="M10 9V6h4v3M9 4h6"/><path d="M10 15h4"/>'],
  lipstick: ['تجميل', '<path d="M9 21h6v-9H9Z"/><path d="M10 12V7l4-3v8"/>'],
  gem: ['مجوهرات وإكسسوارات', '<path d="M7 4h10l3 4-8 12L4 8Z"/><path d="M4 8h16M10 4 9 8l3 12 3-12-1-4"/>'],
  watch: ['ساعات', '<circle cx="12" cy="12" r="5"/><path d="M9 7.5 10 3h4l1 4.5m-6 9L10 21h4l1-4.5"/><path d="M12 10v2l1.2 1"/>'],
  glasses: ['نظارات', '<circle cx="6.5" cy="14" r="3.5"/><circle cx="17.5" cy="14" r="3.5"/><path d="M10 14h4M3 14l1-6h2m15 6-1-6h-2"/>'],
  mobile: ['هواتف', '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'],
  laptop: ['حاسبات', '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19L20 15H4Z"/>'],
  tv: ['شاشات وتلفزيونات', '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8m-4-4v4"/>'],
  washer: ['أجهزة منزلية', '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M7 6.5h2m6 0h2"/>'],
  plug: ['أجهزة كهربائية', '<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>'],
  sofa: ['أثاث', '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2Z"/><path d="M5 18v2m14-2v2"/>'],
  lamp: ['ديكور ومفروشات', '<path d="M8 3h8l3 8H5Z"/><path d="M12 11v8m-4 2h8"/>'],
  pan: ['أدوات المطبخ', '<circle cx="10" cy="13" r="6"/><path d="m14.5 8.5 6-6"/><path d="M8 12a2 2 0 0 1 2-2"/>'],
  spray: ['منظفات', '<path d="M8 10h6v11H8Z"/><path d="M9 10V7h4v3m0-3h3l1 2"/><path d="M19 4h.01M21 6h.01M19 8h.01"/>'],
  babybottle: ['مستلزمات أطفال', '<path d="M9 8h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z"/><path d="M10 8V6l1-3h2l1 3v2"/><path d="M9 12h3m-3 3h3"/>'],
  blocks: ['ألعاب', '<rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="8" y="3" width="8" height="8" rx="1"/>'],
  book: ['كتب', '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5Z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>'],
  pencil: ['قرطاسية', '<path d="m15 4 5 5L9 20H4v-5Z"/><path d="m13 6 5 5"/>'],
  car: ['سيارات وقطع غيار', '<path d="M3 16v-4l2-5h14l2 5v4Z"/><path d="M3 12h18"/><circle cx="7" cy="16.5" r="1.8"/><circle cx="17" cy="16.5" r="1.8"/>'],
  wrench: ['خدمات وصيانة', '<path d="M15 4a5 5 0 0 0-4.6 6.9l-6.9 6.9a1.8 1.8 0 0 0 2.6 2.6l6.9-6.9A5 5 0 0 0 20 9l-3 1-2-2 1-3Z"/>'],
  brick: ['مواد بناء', '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7m6-4.7v4.7M6 9.7v4.6m6-4.6v4.6m6-4.6v4.6M9 14.3V19m6-4.7V19"/>'],
  sprout: ['زراعة ونباتات', '<path d="M12 21v-9"/><path d="M12 12C12 7 8.5 5 4 5c0 4.5 3 7 8 7Zm0 2c0-4 3-6 7.5-6 0 4-3 6-7.5 6Z"/>'],
  paw: ['حيوانات أليفة', '<circle cx="7" cy="10" r="1.8"/><circle cx="10.5" cy="6" r="1.8"/><circle cx="15" cy="6.5" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/><path d="M8 17.5c0-3 2-5.5 4.5-5.5S17 14.5 17 17.5c0 1.5-1.2 2.5-2.7 2.5-1.1 0-1.4-.6-1.8-.6s-.7.6-1.8.6C9.2 20 8 19 8 17.5Z"/>'],
  ball: ['رياضة', '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10Z"/><path d="M12 3v4m4 3 4.5-1.5m-6 6 2.5 4m-7.5-4L7 18.5M8 10 3.5 8.5"/>'],
  pill: ['صحة وصيدلية', '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m9.2 9.2 5.6 5.6"/>'],
  gift: ['هدايا', '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8C10 4 6.5 4.5 7.5 7c.4 1 2.5 1 4.5 1Zm0 0c2-4 5.5-3.5 4.5-1-.4 1-2.5 1-4.5 1Z"/>'],
  tag: ['أخرى', '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'],
};
// Picks an icon from a category name when the admin has not chosen one.
const GUESS = [
  [/مطعم|مطاعم|وجبات|مشاوي|مندي/, 'cloche'], [/بيت|منزلي[ةه] ?الصنع|طبخ بيت|أكلات/, 'pot'], [/ماركت|سوبر|مواد غذائ|بقال|غذائي/, 'basket'],
  [/حبوب|بقول|رز|طحين/, 'grain'], [/خضار|خضر/, 'carrot'], [/فواكه|فاكهة/, 'apple'], [/تمر|تمور|نخيل/, 'palm'], [/خبز|مخبوز|أفران|فرن|معجنات/, 'bread'],
  [/حلو|كيك|معجنات حلوة/, 'cake'], [/مرطبات|آيس|ايس|بوظة/, 'icecream'], [/لحم|لحوم|دجاج|سمك|أسماك/, 'fish'], [/ألبان|البان|حليب|أجبان/, 'milk'],
  [/قهوة|شاي/, 'cup'], [/مشروب|عصير|عصائر|مياه/, 'bottle'], [/عباي|فستان|فساتين/, 'dress'], [/ملابس|أزياء|تيشيرت|قمصان/, 'shirt'], [/حذاء|أحذية|احذية/, 'shoe'],
  [/حقائب|حقيبة|شنط/, 'purse'], [/خياط/, 'scissors'], [/يدوي|حرف|تطريز|كروشيه/, 'yarn'], [/عطر|عطور|بخور/, 'perfume'], [/تجميل|مكياج|بشرة|شعر/, 'lipstick'],
  [/مجوهر|ذهب|فضة|إكسسوار|اكسسوار/, 'gem'], [/ساع/, 'watch'], [/نظار/, 'glasses'], [/هاتف|هواتف|موبايل|جوال/, 'mobile'], [/حاسب|لابتوب|كمبيوتر|تابلت/, 'laptop'],
  [/تلفزيون|شاش/, 'tv'], [/كهرب/, 'plug'], [/غسال|ثلاج|أجهزة منزلية|مكيف/, 'washer'], [/أثاث|اثاث|أرائك|غرف نوم/, 'sofa'], [/ديكور|مفروشات|سجاد/, 'lamp'],
  [/مطبخ|أواني|اواني/, 'pan'], [/منظف|تنظيف|مطهر/, 'spray'], [/أطفال|اطفال|رضاع|حفاض/, 'babybottle'], [/ألعاب|العاب|دمى/, 'blocks'], [/كتب|كتاب/, 'book'],
  [/قرطاسي|مكتبي|دفاتر/, 'pencil'], [/سيار|إطار|اطار|بطاري/, 'car'], [/خدمات|صيانة|تصليح/, 'wrench'], [/بناء|أدوات|عدد/, 'brick'], [/زراع|نبات|حدائق|ورد|زهور/, 'sprout'],
  [/حيوان/, 'paw'], [/رياض|لياقة/, 'ball'], [/صحة|صيدل|دواء/, 'pill'], [/هدايا|هدية/, 'gift'],
];
export const guessIcon = (name = '') => GUESS.find(([re]) => re.test(name))?.[1] || 'tag';
export const categoryIconKey = (c) => (c?.icon && CAT_ICONS[c.icon] ? c.icon : guessIcon(c?.name));
export function catIcon(key, size = 32) {
  const def = CAT_ICONS[key] || CAT_ICONS.tag;
  return raw(`<svg class="i ci" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def[1]}</svg>`);
}
