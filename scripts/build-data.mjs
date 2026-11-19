// בונה את data/cars.json ממאגרי data.gov.il (רץ ב-GitHub Actions, Node 20+, בלי תלויות)
//   node scripts/build-data.mjs            -> מחירון + WLTP + השלמה ממאגר הרכבים הפרטיים
//   node scripts/build-data.mjs --fast     -> בלי סריקת מאגר הרכבים (מהיר, פחות רמות גימור לשנים ישנות)
import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://data.gov.il/api/3/action/datastore_search';
const RES = {
  prices: '39f455bf-6db0-4926-859d-017f34eacbcb',   // מחירון יבואן (mehir_yevuan)
  wltp: '142afde2-6228-49f9-8a29-9b6c3a0cbe40',     // דגמי רכב WLTP
  registry: '053cea08-09bc-40ec-8f7a-156f0677aff3'  // רכב פרטי ומסחרי פעיל
};
const MIN_YEAR = 2010;            // לפני 2010 שווי השימוש לא מחושב לפי מחירון
const FAST = process.argv.includes('--fast');
const PAGE = 32000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (shovi-shimush data builder)', 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j.success) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { lastErr = e; console.warn(`  retry ${i + 1}: ${e.message}`); await sleep(2000 * (i + 1)); }
  }
  throw lastErr;
}
function url(resource, params) {
  const u = new URL(API);
  u.searchParams.set('resource_id', resource);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  return u;
}
async function fieldsOf(resource) {
  const r = await getJson(url(resource, { limit: 1 }));
  return { names: r.fields.map(f => f.id), total: r.total };
}
// מוריד את כל הרשומות בדפים; onPage מאפשר עיבוד בלי לשמור הכול בזיכרון
async function fetchAll(resource, wanted, onPage) {
  const { names, total } = await fieldsOf(resource);
  const fields = wanted.filter(f => names.includes(f));
  const missing = wanted.filter(f => !names.includes(f));
  console.log(`  ${total} rows; fields: ${fields.join(',')}${missing.length ? ' | missing: ' + missing.join(',') : ''}`);
  let offset = 0, all = [];
  while (offset < total) {
    const r = await getJson(url(resource, { limit: PAGE, offset, fields: fields.join(','), sort: '_id' }));
    if (!r.records.length) break;
    if (onPage) onPage(r.records); else all.push(...r.records);
    offset += r.records.length;
    process.stdout.write(`  ${offset}/${total}\r`);
  }
  console.log('');
  return { rows: all, fields, total };
}

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };

function detectProp(delek, tech) {
  const d = clean(delek), t = clean(tech), s = d + ' ' + t;
  if (/פלאג|plug|נטען|phev/i.test(s)) return 'p';
  if (/^חשמל$|^חשמלי$/.test(d) || /חשמלי מלא|^חשמלי$|bev/i.test(t)) return 'e';
  if (/היבריד|hybrid|hev/i.test(s) || /חשמל\s*\/|\/\s*חשמל/.test(d)) return 'h';
  return d || t ? 'r' : '';
}

// מונה ערך שכיח לכל מפתח
class Mode {
  constructor() { this.m = new Map(); }
  add(key, val) {
    if (!val) return;
    let c = this.m.get(key); if (!c) { c = new Map(); this.m.set(key, c); }
    c.set(val, (c.get(val) || 0) + 1);
  }
  get(key) {
    const c = this.m.get(key); if (!c) return '';
    let best = '', n = 0; for (const [v, k] of c) if (k > n) { best = v; n = k; }
    return best;
  }
  all(key) { const c = this.m.get(key); return c ? [...c.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]) : []; }
}

async function main() {
  console.log('1) מחירון יבואן');
  const P = await fetchAll(RES.prices,
    ['semel_yevuan', 'shem_yevuan', 'sug_degem', 'tozeret_cd', 'tozeret_nm', 'degem_cd', 'degem_nm', 'shnat_yitzur', 'mehir', 'kinuy_mishari']);

  console.log('2) WLTP – רמת גימור, נפח, הנעה');
  const wl = new Map(), wlNoYear = new Map();
  await fetchAll(RES.wltp,
    ['tozeret_cd', 'degem_cd', 'shnat_yitzur', 'kinuy_mishari', 'ramat_gimur', 'nefah_manoa', 'koah_sus',
     'delek_nm', 'technologiat_hanaa_nm', 'merkav', 'sug_degem'],
    recs => recs.forEach(r => {
      const v = { trim: clean(r.ramat_gimur), cc: num(r.nefah_manoa), hp: num(r.koah_sus),
        prop: detectProp(r.delek_nm, r.technologiat_hanaa_nm), body: clean(r.merkav), kinuy: clean(r.kinuy_mishari) };
      wl.set(`${r.tozeret_cd}|${r.degem_cd}|${r.shnat_yitzur}`, v);
      const k2 = `${r.tozeret_cd}|${r.degem_cd}`;
      const old = wlNoYear.get(k2);
      if (!old || num(r.shnat_yitzur) > old.y) wlNoYear.set(k2, { ...v, y: num(r.shnat_yitzur) });
    }));

  const regTrim = new Mode(), regFuel = new Mode(), regKinuy = new Mode();
  if (!FAST) {
    console.log('3) מאגר רכבים פרטיים – השלמת רמות גימור ודלק (לוקח כמה דקות)');
    await fetchAll(RES.registry, ['tozeret_cd', 'degem_cd', 'shnat_yitzur', 'ramat_gimur', 'sug_delek_nm', 'kinuy_mishari'],
      recs => recs.forEach(r => {
        if (num(r.shnat_yitzur) < MIN_YEAR - 1) return;
        const k = `${r.tozeret_cd}|${r.degem_cd}|${r.shnat_yitzur}`;
        regTrim.add(k, clean(r.ramat_gimur)); regFuel.add(k, clean(r.sug_delek_nm)); regKinuy.add(k, clean(r.kinuy_mishari));
      }));
  }

  console.log('4) איחוד');
  const mList = [], mIdx = new Map(), iList = [], iIdx = new Map();
  const idxOf = (list, map, v) => { if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); };
  const rows = [], seen = new Set();
  let withTrim = 0, withProp = 0;
  for (const r of P.rows) {
    const y = num(r.shnat_yitzur), price = num(r.mehir);
    if (y < MIN_YEAR || price <= 0) continue;
    const tc = num(r.tozeret_cd), dc = num(r.degem_cd);
    const k = `${tc}|${dc}|${y}`;
    const w = wl.get(k) || wlNoYear.get(`${tc}|${dc}`) || {};
    // רמת גימור: WLTP, אחרת השכיחה במאגר הרכבים; אם יש כמה – מציגים את כולן
    let trim = w.trim || '';
    if (!trim) { const all = regTrim.all(k); trim = all.slice(0, 3).join(' / '); }
    const prop = w.prop || detectProp(regFuel.get(k), '') || 'r';
    const kinuy = clean(r.kinuy_mishari) || w.kinuy || regKinuy.get(k) || '';
    const dedup = `${k}|${price}`;
    if (seen.has(dedup)) continue; seen.add(dedup);
    if (trim) withTrim++; if (w.prop || regFuel.get(k)) withProp++;
    rows.push([
      idxOf(mList, mIdx, clean(r.tozeret_nm)), tc, dc, clean(r.degem_nm), kinuy, y, price,
      trim, w.cc || 0, w.hp || 0, prop, w.body || '', idxOf(iList, iIdx, clean(r.shem_yevuan))
    ]);
  }
  rows.sort((a, b) => a[0] - b[0] || a[4].localeCompare(b[4]) || b[5] - a[5]);
  const out = {
    built: new Date().toISOString(),
    source: { prices: RES.prices, wltp: RES.wltp, registry: FAST ? null : RES.registry },
    cols: ['m', 'tozeret_cd', 'degem_cd', 'degem_nm', 'kinuy', 'year', 'price', 'trim', 'cc', 'hp', 'prop', 'body', 'importer'],
    m: mList, i: iList, rows
  };
  console.log(`✓ ${rows.length} rows | trim: ${withTrim} | propulsion: ${withProp}`);
  if (rows.length < 5000) { console.error('Too few rows – aborting so the old file is kept'); process.exit(1); }
  await mkdir('data', { recursive: true });
  await writeFile('data/cars.json', JSON.stringify(out));
}
main().catch(e => { console.error(e); process.exit(1); });
