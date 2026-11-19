/* מנוע חיפוש + חישוב שווי שימוש. עובד בדפדפן וב-Node (לבדיקות). */
(function (root) {
  'use strict';

  // ===== פרמטרים לשנת המס – לעדכן כל ינואר =====
  const TAX = {
    year: 2026,
    rate: 0.0248,          // 2.48% ממחיר המחירון
    cap: 596860,           // תקרת מחיר מחירון
    reduction: { r: 0, h: 580, p: 1150, e: 1380 } // הפחתה חודשית לפי סוג הנעה (2026)
  };
  const PROP_LABEL = { r: 'בנזין/דיזל', h: 'היברידי', p: 'פלאג-אין', e: 'חשמלי' };
  const PROP_WORDS = {
    r: ['בנזין', 'דיזל', 'petrol', 'diesel'],
    h: ['היברידי', 'היבריד', 'hybrid', 'hev'],
    p: ['פלאג', 'פלאגאין', 'plugin', 'phev', 'נטען'],
    e: ['חשמלי', 'חשמל', 'electric', 'ev']
  };

  // rec (אופציונלי): רשומה מקובץ רשות המסים – אם סוג ההנעה לא שונה, מחזירים את השווי הרשמי.
  // אחרת מחשבים לפי המחיר המתואם (מחיר מחירון צמוד למדד), ואם אין – לפי מחיר המחירון.
  function usageValue(price, prop, rec) {
    if (rec && rec.u && prop === rec.pr) return rec.u;
    if (rec && rec.adj) price = rec.adj;
    if (!price || price <= 0) return null;
    const base = Math.min(price, TAX.cap);
    const gross = Math.round((base * TAX.rate) / 10) * 10;
    return Math.max(0, gross - (TAX.reduction[prop] || 0));
  }

  // ===== נרמול טקסט =====
  const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[֑-ׇ]/g, '')
      .replace(/[ךםןףץ]/g, c => FINALS[c])
      .replace(/["'`׳״]/g, '')
      .replace(/(\d)\.(\d)/g, '$1\u0001$2')   // לשמור נקודה עשרונית (1.6)
      .replace(/[^0-9a-zא-ת\u0001]+/g, ' ')
      .replace(/\u0001/g, '.')
      .trim();
  }
  function tokens(s) { const n = norm(s); return n ? n.split(' ') : []; }
  // פיצול גבולות אות/ספרה: rav4 -> rav, 4
  function splitAlnum(t) {
    const parts = t.split(/(?<=[a-zא-ת])(?=\d)|(?<=\d)(?=[a-zא-ת])/);
    return parts.length > 1 ? parts : [];
  }
  function fieldTokens(s) {
    const out = new Set();
    const toks = tokens(s);
    for (const t of toks) { out.add(t); for (const p of splitAlnum(t)) out.add(p); }
    if (toks.length > 1) out.add(toks.join(''));   // "cx 5" -> "cx5", "ב מ וו" -> "במוו"
    return [...out];
  }
  const isHeb = t => /[א-ת]/.test(t);
  const isNum = t => /^[\d.]+$/.test(t);

  // ===== מילון עברית -> אנגלית (יצרנים, דגמים, מונחים) =====
  const RAW_ALIASES = {
    // יצרנים
    'טויוטה': 'toyota', 'יונדאי': 'hyundai', 'קיה': 'kia', 'מאזדה': 'mazda', 'סקודה': 'skoda',
    'פולקסווגן': 'volkswagen vw', 'פולקסוואגן': 'volkswagen vw', 'ניסאן': 'nissan', 'מיצובישי': 'mitsubishi',
    'סוזוקי': 'suzuki', 'סובארו': 'subaru', 'הונדה': 'honda', 'שברולט': 'chevrolet', 'פורד': 'ford',
    'פיגו': 'peugeot', 'פיזו': 'peugeot', 'רנו': 'renault', 'דאציה': 'dacia', 'דציה': 'dacia', 'סיטרואן': 'citroen',
    'אופל': 'opel', 'סיאט': 'seat', 'טסלה': 'tesla', 'לקסוס': 'lexus', 'במוו': 'bmw', 'מרצדס': 'mercedes benz',
    'אאודי': 'audi', 'אודי': 'audi', 'וולוו': 'volvo', 'גיפ': 'jeep', 'פיאט': 'fiat', 'מיני': 'mini',
    'גנסיס': 'genesis', 'אמגי': 'mg', 'מגי': 'mg', 'מג': 'mg', 'זיאס': 'zs', 'דיאס': 'ds', 'מזדה': 'mazda', 'סיאייצאר': 'c-hr chr', 'ביוודי': 'byd', 'בי': 'byd', 'צרי': 'chery', 'גילי': 'geely',
    'קרייזלר': 'chrysler', 'דודג': 'dodge', 'לנד': 'land', 'רובר': 'rover', 'פורשה': 'porsche',
    'אלפא': 'alfa', 'רומיאו': 'romeo', 'סאנגיונג': 'ssangyong', 'איסוזו': 'isuzu', 'דייהטסו': 'daihatsu',
    'קופרה': 'cupra', 'זיקר': 'zeekr', 'אקספנג': 'xpeng', 'לינק': 'lynk', 'סמארט': 'smart', 'אינפיניטי': 'infiniti',
    // דגמים נפוצים
    'קורולה': 'corolla', 'יאריס': 'yaris', 'קאמרי': 'camry', 'קמרי': 'camry', 'פריוס': 'prius', 'ראב': 'rav4 rav',
    'אוריס': 'auris', 'היילקס': 'hilux', 'לנדקרוזר': 'land cruiser', 'אייגו': 'aygo', 'קרוס': 'cross',
    'טוסון': 'tucson', 'סונטה': 'sonata', 'אלנטרה': 'elantra', 'אקסנט': 'accent', 'איוניק': 'ioniq',
    'קונה': 'kona', 'סנטה': 'santa', 'פה': 'fe', 'גטס': 'getz', 'באיון': 'bayon',
    'פיקנטו': 'picanto', 'ריו': 'rio', 'סיד': 'ceed', 'ספורטאז': 'sportage', 'ספורטג': 'sportage',
    'סורנטו': 'sorento', 'נירו': 'niro', 'סטוניק': 'stonic', 'אופטימה': 'optima', 'סול': 'soul', 'פורטה': 'forte',
    'אוקטביה': 'octavia', 'אוקטבייה': 'octavia', 'פאביה': 'fabia', 'סופרב': 'superb', 'קודיאק': 'kodiaq',
    'קארוק': 'karoq', 'קרוק': 'karoq', 'קמיק': 'kamiq', 'ראפיד': 'rapid', 'סקאלה': 'scala', 'אניאק': 'enyaq',
    'גולף': 'golf', 'פולו': 'polo', 'פאסאט': 'passat', 'פסאט': 'passat', 'טיגואן': 'tiguan', 'גטה': 'jetta',
    'טוארג': 'touareg', 'טירוק': 't-roc troc', 'טיקרוס': 't-cross tcross', 'קאדי': 'caddy', 'טרנספורטר': 'transporter',
    'מיקרה': 'micra', 'קשקאי': 'qashqai', 'גוק': 'juke', 'סנטרה': 'sentra', 'טרייל': 'trail x-trail xtrail',
    'נוט': 'note', 'ליף': 'leaf', 'נבארה': 'navara', 'אלמרה': 'almera',
    'אאוטלנדר': 'outlander', 'אטראז': 'attrage', 'ספייס': 'space', 'סטאר': 'star', 'לנסר': 'lancer',
    'אקליפס': 'eclipse', 'טרייטון': 'triton',
    'סוויפט': 'swift', 'סויפט': 'swift', 'ויטרה': 'vitara', 'בלנו': 'baleno', 'איגניס': 'ignis', 'ספלאש': 'splash',
    'אלטו': 'alto', 'גימני': 'jimny', 'סלריו': 'celerio', 'קרוסאובר': 'crossover sx4',
    'אימפרזה': 'impreza', 'פורסטר': 'forester', 'אאוטבק': 'outback', 'לגאסי': 'legacy', 'קרוסטרק': 'crosstrek',
    'סיוויק': 'civic', 'סיביק': 'civic', 'גאז': 'jazz', 'אקורד': 'accord',
    'ספארק': 'spark', 'קרוז': 'cruze', 'מאליבו': 'malibu', 'טראקס': 'trax',
    'פוקוס': 'focus', 'פיאסטה': 'fiesta', 'קוגה': 'kuga', 'מונדאו': 'mondeo', 'אקספלורר': 'explorer',
    'קליאו': 'clio', 'מגאן': 'megane', 'קפצור': 'captur', 'קדגאר': 'kadjar', 'אוסטרל': 'austral',
    'סנדרו': 'sandero', 'לוגאן': 'logan', 'דאסטר': 'duster', 'גוגר': 'jogger', 'ספרינג': 'spring',
    'אסטרה': 'astra', 'קורסה': 'corsa', 'אינסיגניה': 'insignia', 'מוקה': 'mokka', 'גרנדלנד': 'grandland', 'קרוסלנד': 'crossland',
    'איביזה': 'ibiza', 'לאון': 'leon', 'אטקה': 'ateca', 'ארונה': 'arona', 'טרקו': 'tarraco',
    'מודל': 'model', 'אטו': 'atto', 'דולפין': 'dolphin', 'סיל': 'seal', 'טאנג': 'tang',
    'רנגלר': 'wrangler', 'צירוקי': 'cherokee', 'קומפאס': 'compass', 'רנגייד': 'renegade', 'אוונג׳ר': 'avenger', 'אוונגר': 'avenger',
    'פנדה': 'panda', 'טיפו': 'tipo', 'דובלו': 'doblo', 'קונטרימן': 'countryman', 'קופר': 'cooper',
    // מונחים
    'היברידי': 'hybrid', 'היבריד': 'hybrid', 'הייבריד': 'hybrid', 'חשמלי': 'electric ev', 'פלאגאין': 'plug-in phev',
    'אוטומט': 'auto at', 'אוטומטי': 'auto at', 'ידני': 'manual mt', 'סטיישן': 'station wagon sw', 'סטיישנ': 'station wagon sw',
    'האצבק': 'hatchback hb', 'האצ': 'hatchback hb', 'סדאן': 'sedan', 'טורבו': 'turbo',
    'סאן': 'sun', 'ספורט': 'sport', 'פרימיום': 'premium', 'לקשרי': 'luxury', 'לאקשרי': 'luxury', 'אינספייר': 'inspire',
    'ספשל': 'special', 'אדישן': 'edition', 'סטייל': 'style', 'אליגנס': 'elegance', 'אלגנס': 'elegance',
    'אקזקיוטיב': 'executive', 'פרסטיז': 'prestige', 'פלוס': 'plus', 'קומפורט': 'comfort', 'טרנד': 'trend',
    'אקטיב': 'active', 'לימיטד': 'limited', 'פרו': 'pro', 'ספייס': 'space'
  };
  const ALIASES = new Map();
  for (const [he, en] of Object.entries(RAW_ALIASES)) {
    const k = norm(he).replace(/ /g, '');
    const v = en.split(/\s+/).map(x => norm(x).replace(/ /g, '')).filter(Boolean);
    ALIASES.set(k, [...new Set([...(ALIASES.get(k) || []), ...v])]);
  }
  // יצרן בעברית -> שמות באנגלית (לאינדוקס)
  function manufAliases(m) {
    const joined = norm(m).replace(/ /g, '');
    const out = [];
    for (const [he, en] of ALIASES) {
      if (he.length >= 3 && joined.startsWith(he) && en.length) out.push(...en);
    }
    return out;
  }

  // ===== התאמה עמומה =====
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // "שלד עיצורים" להשוואת תעתיק עברית<->אנגלית
  const HEB2LAT = { 'א': '', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': '', 'ו': '', 'ז': 'z', 'ח': 'h', 'ט': 't', 'י': '', 'כ': 'k',
    'ל': 'l', 'מ': 'm', 'נ': 'n', 'ס': 's', 'ע': '', 'פ': 'p', 'צ': 'z', 'ק': 'k', 'ר': 'r', 'ש': 's', 'ת': 't' };
  function skelHeb(t) {
    let s = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === 'ו' && (i === 0 || t[i + 1] === 'ו')) { s += 'b'; if (t[i + 1] === 'ו') i++; continue; }
      if (c === 'פ' && i === t.length - 1) { s += 'p'; continue; }
      s += HEB2LAT[c] != null ? HEB2LAT[c] : '';
    }
    return s.replace(/(.)\1+/g, '$1');
  }
  function skelLat(t) {
    return t.replace(/ph/g, 'p').replace(/f/g, 'p').replace(/ch/g, 'k').replace(/sh/g, 's').replace(/ts/g, 'z')
      .replace(/[cq]/g, 'k').replace(/[vw]/g, 'b').replace(/x/g, 'ks').replace(/j/g, 'g')
      .replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1');
  }

  // ===== אינדקס =====
  // שדות ומשקלם: ככל שהמשקל גבוה – התאמה בשדה חשובה יותר
  const FIELDS = ['model', 'manuf', 'trim', 'degemNm', 'degemCd', 'prop', 'engine', 'body', 'importer'];
  const W = [10, 8, 7, 5, 9, 4, 4, 3, 2];

  function rowToRec(r, d) {
    // [mIdx, tozeret_cd, degem_cd, degem_nm, kinuy, year, price, trim, cc, hp, prop, body, impIdx, adjPrice, usage]
    return { m: d.m[r[0]] || '', tc: r[1], dc: r[2], dn: r[3] || '', k: r[4] || '', y: r[5], p: r[6],
      t: r[7] || '', cc: r[8] || 0, hp: r[9] || 0, pr: r[10] || 'r', b: r[11] || '', imp: d.i[r[12]] || '',
      adj: r[13] || 0, u: r[14] || 0 };
  }

  function createIndex(data) {
    const recs = data.rows.map(r => rowToRec(r, data));
    const vocab = new Map();
    const add = (tok, ri, f) => {
      let arr = vocab.get(tok);
      if (!arr) { arr = []; vocab.set(tok, arr); }
      arr.push(ri * 16 + f);
    };
    const manufCache = new Map();
    recs.forEach((r, ri) => {
      const per = [[], [], [], [], [], [], [], [], []];
      per[0] = fieldTokens(r.k);
      if (!manufCache.has(r.m)) manufCache.set(r.m, [...new Set([...fieldTokens(r.m), ...manufAliases(r.m)])]);
      per[1] = manufCache.get(r.m);
      per[2] = fieldTokens(r.t);
      per[3] = fieldTokens(r.dn);
      per[4] = [String(r.dc)];
      per[5] = PROP_WORDS[r.pr] || [];
      if (r.cc) per[6] = [(r.cc / 1000).toFixed(1), String(Math.round(r.cc / 100) * 100)];
      per[7] = fieldTokens(r.b);
      per[8] = fieldTokens(r.imp);
      const seen = new Set();
      per.forEach((toks, f) => toks.forEach(t => {
        const key = t + '|' + f;
        if (!seen.has(key)) { seen.add(key); add(t, ri, f); }
      }));
    });
    const keys = [...vocab.keys()];
    const latinKeys = keys.filter(k => !isHeb(k) && !isNum(k) && k.length >= 3).map(k => [k, skelLat(k)]);
    return { recs, vocab, keys, latinKeys };
  }

  // מוצא מילים באוצר המילים שתואמות לטוקן, עם ציון איכות 0..1
  function matchVocab(idx, q) {
    const res = new Map();
    const put = (k, qual) => { if ((res.get(k) || 0) < qual) res.set(k, qual); };
    const alts = [q, ...(ALIASES.get(q) || [])];
    for (const a of alts) {
      if (idx.vocab.has(a)) put(a, 1);
      if (isNum(a)) continue;                 // מספרים – רק התאמה מדויקת
      if (a.length >= 2) {
        for (const k of idx.keys) if (k !== a && k.startsWith(a)) put(k, a.length >= 3 ? 0.75 : 0.5);
      }
      if (a.length >= 4) {
        const max = a.length >= 7 ? 2 : 1;
        for (const k of idx.keys) {
          if (isNum(k) || Math.abs(k.length - a.length) > max) continue;
          if (lev(a, k, max) <= max) put(k, 0.6);
        }
      }
    }
    // תעתיק: מילה עברית שלא במילון מול מילים באנגלית
    if (isHeb(q) && !ALIASES.has(q) && q.length >= 3) {
      const sq = skelHeb(q);
      if (sq.length >= 2) for (const [k, sk] of idx.latinKeys) {
        if (sk === sq) put(k, 0.55);
        else if (sq.length >= 4 && lev(sq, sk, 1) <= 1) put(k, 0.4);
      }
    }
    return res;
  }

  function search(idx, query, opts) {
    opts = opts || {};
    const raw = tokens(query);
    let year = null;
    const qt = [];
    // צירוף מילים עוקבות שמופיעות במילון כביטוי אחד ("זי אס" -> zs)
    for (let i = 0; i < raw.length - 1; i++) {
      for (let n = 3; n >= 2; n--) {
        const j = raw.slice(i, i + n).join('');
        if (i + n <= raw.length && ALIASES.has(j)) { raw.splice(i, n, j); break; }
      }
    }
    for (const t of raw) {
      if (/^(19[89]\d|20[0-4]\d)$/.test(t) && year == null) year = +t;
      else if (!qt.includes(t)) qt.push(t);
    }
    const out = { year, yearRelaxed: false, tokens: qt, unmatched: [], exact: [], near: [] };
    if (!qt.length) return out;

    const N = idx.recs.length;
    const score = new Float32Array(N);
    const matched = new Uint8Array(N);
    for (const q of qt) {
      const vm = matchVocab(idx, q);
      if (!vm.size) { out.unmatched.push(q); continue; }
      const best = new Map();
      for (const [k, qual] of vm) {
        for (const code of idx.vocab.get(k)) {
          const ri = code >> 4, f = code & 15;
          const v = W[f] * qual;
          if ((best.get(ri) || 0) < v) best.set(ri, v);
        }
      }
      for (const [ri, v] of best) { score[ri] += v; matched[ri]++; }
    }

    const collect = (yearOk) => {
      const c = [];
      for (let i = 0; i < N; i++) if (matched[i] && yearOk(idx.recs[i].y)) c.push(i);
      return c;
    };
    let cand = collect(y => year == null || y === year);
    if (!cand.length && year != null) {
      cand = collect(y => Math.abs(y - year) <= 1);
      out.yearRelaxed = cand.length > 0;
    }
    if (!cand.length) return out;

    let maxM = 0;
    for (const i of cand) if (matched[i] > maxM) maxM = matched[i];
    const cmp = (a, b) => (score[b] - score[a])
      || (year != null ? Math.abs(idx.recs[a].y - year) - Math.abs(idx.recs[b].y - year) : idx.recs[b].y - idx.recs[a].y)
      || (idx.recs[a].p - idx.recs[b].p);
    const ex = cand.filter(i => matched[i] === maxM).sort(cmp);
    // ציון דומה לראשון = רלוונטי. כשיש פער גדול – מציגים רק את הקרובים ביותר
    const top = ex.length ? score[ex[0]] : 0;
    const strong = ex.filter(i => score[i] >= top * 0.6);
    const weak = ex.filter(i => score[i] < top * 0.6);
    const near = maxM > 1 ? cand.filter(i => matched[i] === maxM - 1).sort(cmp) : [];
    const lim = opts.limit || 300;
    const wrap = i => Object.assign({ score: Math.round(score[i] * 10) / 10, matched: matched[i] }, idx.recs[i]);
    // איחוד שורות זהות (אותו דגם, גימור, שנה ומחיר) שנבדלות רק בקוד הדגם
    const merge = list => {
      const map = new Map(), res = [];
      for (const i of list) {
        const r = idx.recs[i], key = [r.m, r.k, r.t, r.y, r.p, r.pr, r.imp].join('|');
        const ex = map.get(key);
        if (ex) { if (!ex.dcs.includes(r.dc)) ex.dcs.push(r.dc); continue; }
        const w = wrap(i); w.dcs = [r.dc]; map.set(key, w); res.push(w);
      }
      return res;
    };
    const ex2 = merge(strong);
    out.total = ex2.length;
    out.exact = ex2.slice(0, lim);
    out.near = merge(weak.concat(near)).slice(0, opts.nearLimit || 40);
    out.maxMatched = maxM;
    return out;
  }

  const api = { TAX, PROP_LABEL, usageValue, norm, tokens, createIndex, search, rowToRec, skelHeb, skelLat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShoviSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
