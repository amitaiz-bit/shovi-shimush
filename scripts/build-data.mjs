// בונה את data/cars.json (רץ ב-GitHub Actions, Node 20+, בלי תלויות)
//
// מקור עיקרי: הקובץ הרשמי של רשות המסים לשווי שימוש (מחיר מחירון, מחיר מתואם ושווי שימוש מחושב
//   לכל שנת רישום/קוד תוצר/קוד דגם). זהו המקור המחייב.
// העשרה: מחירון יבואן (שם היבואן), WLTP ומאגר כלי הרכב (רמת גימור, נפח, כ"ס, מרכב).
// גיבוי: אם הורדת הקובץ של רשות המסים נכשלת – בונים ממחירון היבואן ומחשבים בנוסחה.
//
//   node scripts/build-data.mjs          -> מלא
//   node scripts/build-data.mjs --fast   -> בלי סריקת מאגר הרכבים (מהיר, פחות רמות גימור לשנים ישנות)
import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://data.gov.il/api/3/action/datastore_search';
const RES = {
  prices: '39f455bf-6db0-4926-859d-017f34eacbcb',   // מחירון יבואן (mehir_yevuan)
  wltp: '142afde2-6228-49f9-8a29-9b6c3a0cbe40',     // דגמי רכב WLTP
  registry: '053cea08-09bc-40ec-8f7a-156f0677aff3'  // רכב פרטי ומסחרי פעיל
};
const TAX_PAGE = 'https://secapp.taxes.gov.il/mm_usecar10/DownLoad.aspx?cur=2';
const TAX_BUTTON = 'ctl00$ContentUsersPage$btnexcel2'; // "קובץ מידע לאימות נתונים – מורחב" לשנה הנוכחית
const MIN_YEAR = 2010;
const FAST = process.argv.includes('--fast');
const PAGE = 32000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };

// ===== data.gov.il =====
async function getJson(url) {
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(url, { headers: { ...UA, 'Accept': 'application/json' } });
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
async function fetchAll(resource, wanted, onPage) {
  const first = await getJson(url(resource, { limit: 1 }));
  const names = first.fields.map(f => f.id), total = first.total;
  const fields = wanted.filter(f => names.includes(f));
  const missing = wanted.filter(f => !names.includes(f));
  console.log(`  ${total} rows; fields: ${fields.join(',')}${missing.length ? ' | missing: ' + missing.join(',') : ''}`);
  let offset = 0;
  while (offset < total) {
    const r = await getJson(url(resource, { limit: PAGE, offset, fields: fields.join(','), sort: '_id' }));
    if (!r.records.length) break;
    onPage(r.records);
    offset += r.records.length;
    process.stdout.write(`  ${offset}/${total}\r`);
  }
  console.log('');
}

// ===== קובץ רשות המסים (טופס ASP.NET) =====
const decodeHtml = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function attr(tag, name) { const m = new RegExp(name + '="([^"]*)"', 'i').exec(tag); return m ? decodeHtml(m[1]) : null; }

async function fetchTaxFile() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r1 = await fetch(TAX_PAGE, { headers: UA });
      if (!r1.ok) throw new Error('GET HTTP ' + r1.status);
      const html = await r1.text();
      const cookie = (r1.headers.getSetCookie ? r1.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
      const form = new URLSearchParams();
      for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
        const name = attr(tag, 'name'); if (!name) continue;
        const type = (attr(tag, 'type') || 'text').toLowerCase();
        if (['submit', 'button', 'image', 'checkbox', 'radio'].includes(type) && name !== TAX_BUTTON) continue;
        form.set(name, attr(tag, 'value') ?? '');
      }
      if (!form.has(TAX_BUTTON)) throw new Error('download button not found on page');
      const action = new URL(decodeHtml((/<form[^>]*action="([^"]*)"/i.exec(html) || [])[1] || TAX_PAGE), TAX_PAGE);
      const r2 = await fetch(action, {
        method: 'POST',
        headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': TAX_PAGE, ...(cookie ? { Cookie: cookie } : {}) },
        body: form
      });
      const ct = r2.headers.get('content-type') || '';
      if (!r2.ok || !/csv|octet|excel/i.test(ct)) throw new Error(`POST HTTP ${r2.status} (${ct})`);
      const buf = new Uint8Array(await r2.arrayBuffer());
      console.log(`  ${(buf.length / 1e6).toFixed(1)}MB, ${r2.headers.get('content-disposition') || ''}`);
      return new TextDecoder('windows-1255').decode(buf);
    } catch (e) { console.warn(`  attempt ${attempt}: ${e.message}`); await sleep(3000 * attempt); }
  }
  return null;
}

// עמודות: שנת מס, שנת רישום, סוג רכב, קוד תוצר, תוצר, קוד דגם, תאור דגם, סוג דלק, כינוי מסחרי, אוטומט,
//         הנעה (1 היברידי, 2 פלאג-אין, 3 חשמלי), ציון ירוק, דרגת זיהום, נפח מנוע, משקל, תאריך תחולה,
//         מחיר מחירון, מחיר מתואם, שווי שימוש
const TAX_PROP = { '0': 'r', '1': 'h', '2': 'p', '3': 'e' };
function parseTax(text) {
  const lines = text.split(/\r?\n/);
  const out = []; let bad = 0, taxYear = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = lines[i].split(',').map(x => x.trim());
    if (f.length < 19) { bad++; continue; }
    const y = num(f[1]), price = num(f[16]), adj = num(f[17]), u = num(f[18]);
    if (!y || !price) { bad++; continue; }
    taxYear = taxYear || num(f[0]);
    out.push({ y, sug: f[2], tc: num(f[3]), tn: clean(f[4]), dc: num(f[5]), dn: clean(f[6]), kinuy: clean(f[8]),
      prop: TAX_PROP[f[10]] || 'r', cc: num(f[13]), price, adj, u });
  }
  console.log(`  ${out.length} rows (tax year ${taxYear})${bad ? `, ${bad} skipped` : ''}`);
  return { rows: out, taxYear };
}

function detectProp(delek, tech) {
  const d = clean(delek), t = clean(tech), s = d + ' ' + t;
  if (/פלאג|plug|נטען|phev/i.test(s)) return 'p';
  if (/^חשמל$|^חשמלי$/.test(d) || /חשמלי מלא|^חשמלי$|bev/i.test(t)) return 'e';
  if (/היבריד|hybrid|hev/i.test(s) || /חשמל\s*\/|\/\s*חשמל/.test(d)) return 'h';
  return d || t ? 'r' : '';
}

class Mode {
  constructor() { this.m = new Map(); }
  add(key, val) {
    if (!val) return;
    let c = this.m.get(key); if (!c) { c = new Map(); this.m.set(key, c); }
    c.set(val, (c.get(val) || 0) + 1);
  }
  get(key) { return this.all(key)[0] || ''; }
  all(key) { const c = this.m.get(key); return c ? [...c.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]) : []; }
}

async function main() {
  console.log('1) קובץ שווי שימוש של רשות המסים');
  const taxText = await fetchTaxFile();
  const TAX = taxText ? parseTax(taxText) : null;
  if (!TAX || TAX.rows.length < 5000) console.warn('  ⚠ לא התקבל קובץ רשות המסים – בונים ממחירון היבואן (פחות מדויק)');

  console.log('2) מחירון יבואן');
  const P = [], impByKey = new Map(), impByCode = new Map(), tozName = new Map();
  await fetchAll(RES.prices,
    ['shem_yevuan', 'tozeret_cd', 'tozeret_nm', 'degem_cd', 'degem_nm', 'shnat_yitzur', 'mehir', 'kinuy_mishari'],
    recs => recs.forEach(r => {
      P.push(r);
      const tc = num(r.tozeret_cd), dc = num(r.degem_cd), imp = clean(r.shem_yevuan);
      if (imp) { impByKey.set(`${tc}|${dc}|${num(r.shnat_yitzur)}`, imp); impByCode.set(`${tc}|${dc}`, imp); }
      if (r.tozeret_nm) tozName.set(tc, clean(r.tozeret_nm));
    }));

  console.log('3) WLTP – רמת גימור, נפח, הנעה');
  const wl = new Map(), wlNoYear = new Map();
  await fetchAll(RES.wltp,
    ['tozeret_cd', 'degem_cd', 'shnat_yitzur', 'kinuy_mishari', 'ramat_gimur', 'nefah_manoa', 'koah_sus',
     'delek_nm', 'technologiat_hanaa_nm', 'merkav'],
    recs => recs.forEach(r => {
      const v = { trim: clean(r.ramat_gimur), cc: num(r.nefah_manoa), hp: num(r.koah_sus),
        prop: detectProp(r.delek_nm, r.technologiat_hanaa_nm), body: clean(r.merkav), kinuy: clean(r.kinuy_mishari) };
      wl.set(`${r.tozeret_cd}|${r.degem_cd}|${r.shnat_yitzur}`, v);
      const k2 = `${r.tozeret_cd}|${r.degem_cd}`, old = wlNoYear.get(k2);
      if (!old || num(r.shnat_yitzur) > old.y) wlNoYear.set(k2, { ...v, y: num(r.shnat_yitzur) });
    }));

  const regTrim = new Mode(), regFuel = new Mode(), regKinuy = new Mode();
  if (!FAST) {
    console.log('4) מאגר רכבים פרטיים – השלמת רמות גימור (לוקח כמה דקות)');
    await fetchAll(RES.registry, ['tozeret_cd', 'degem_cd', 'shnat_yitzur', 'ramat_gimur', 'sug_delek_nm', 'kinuy_mishari'],
      recs => recs.forEach(r => {
        if (num(r.shnat_yitzur) < MIN_YEAR - 1) return;
        const k = `${r.tozeret_cd}|${r.degem_cd}|${r.shnat_yitzur}`;
        regTrim.add(k, clean(r.ramat_gimur)); regFuel.add(k, clean(r.sug_delek_nm)); regKinuy.add(k, clean(r.kinuy_mishari));
      }));
  }

  console.log('5) איחוד');
  const mList = [], mIdx = new Map(), iList = [''], iIdx = new Map([['', 0]]);
  const idxOf = (list, map, v) => { if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); };
  const rows = [], seen = new Set();
  let withTrim = 0;
  const enrich = (tc, dc, y) => {
    const k = `${tc}|${dc}|${y}`;
    const w = wl.get(k) || wlNoYear.get(`${tc}|${dc}`) || {};
    let trim = w.trim || '';
    if (!trim) trim = regTrim.all(k).slice(0, 3).join(' / ');
    if (trim) withTrim++;
    return { k, w, trim };
  };

  if (TAX && TAX.rows.length >= 5000) {
    for (const t of TAX.rows) {
      if (t.y < MIN_YEAR) continue;
      const { k, w, trim } = enrich(t.tc, t.dc, t.y);
      const dedup = `${k}|${t.price}|${t.u}`;
      if (seen.has(dedup)) continue; seen.add(dedup);
      const imp = impByKey.get(k) || impByCode.get(`${t.tc}|${t.dc}`) || '';
      rows.push([
        idxOf(mList, mIdx, tozName.get(t.tc) || t.tn), t.tc, t.dc, t.dn, t.kinuy || w.kinuy || regKinuy.get(k) || '', t.y, t.price,
        trim, w.cc || t.cc || 0, w.hp || 0, t.prop, w.body || '', idxOf(iList, iIdx, imp), t.adj, t.u
      ]);
    }
  } else {
    for (const r of P) {
      const y = num(r.shnat_yitzur), price = num(r.mehir);
      if (y < MIN_YEAR || price <= 0) continue;
      const tc = num(r.tozeret_cd), dc = num(r.degem_cd);
      const { k, w, trim } = enrich(tc, dc, y);
      const dedup = `${k}|${price}`;
      if (seen.has(dedup)) continue; seen.add(dedup);
      rows.push([
        idxOf(mList, mIdx, clean(r.tozeret_nm)), tc, dc, clean(r.degem_nm), clean(r.kinuy_mishari) || w.kinuy || regKinuy.get(k) || '',
        y, price, trim, w.cc || 0, w.hp || 0, w.prop || detectProp(regFuel.get(k), '') || 'r', w.body || '',
        idxOf(iList, iIdx, clean(r.shem_yevuan)), 0, 0
      ]);
    }
  }

  rows.sort((a, b) => a[0] - b[0] || a[4].localeCompare(b[4]) || b[5] - a[5]);
  const official = !!(TAX && TAX.rows.length >= 5000);
  const out = {
    built: new Date().toISOString(),
    source: official ? 'taxes' : 'mehir_yevuan',
    taxYear: official ? TAX.taxYear : null,
    cols: ['m', 'tozeret_cd', 'degem_cd', 'degem_nm', 'kinuy', 'year', 'price', 'trim', 'cc', 'hp', 'prop', 'body', 'importer', 'adj_price', 'usage'],
    m: mList, i: iList, rows
  };
  console.log(`✓ ${rows.length} rows | source: ${out.source} | trim: ${withTrim}`);
  if (rows.length < 5000) { console.error('Too few rows – aborting so the old file is kept'); process.exit(1); }
  await mkdir('data', { recursive: true });
  await writeFile('data/cars.json', JSON.stringify(out));
}
main().catch(e => { console.error(e); process.exit(1); });
