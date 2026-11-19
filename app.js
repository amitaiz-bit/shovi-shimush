(function () {
  'use strict';
  const S = window.ShoviSearch;
  const API = 'https://data.gov.il/api/3/action/datastore_search';
  const REG = ['053cea08-09bc-40ec-8f7a-156f0677aff3', 'f6efe89a-fb3d-43a4-bb61-9bf12a9b9099']; // פעיל, לא פעיל עם קוד דגם
  const PRICES = '39f455bf-6db0-4926-859d-017f34eacbcb';
  const PAGE = 40;

  const $ = id => document.getElementById(id);
  const q = $('q'), out = $('out'), status = $('status');
  const fmt = n => n == null ? '—' : '₪' + Math.round(n).toLocaleString('he-IL');
  const pad5 = n => String(n ?? '').padStart(5, '0');   // כמו ברישיון הרכב ובסימולטור של רשות המסים
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let idx = null, data = null, pending = null;

  // ===== הערכת עלות נטו לעובד (הערכה בלבד) =====
  // מדרגות מס הכנסה לשכיר (שכר חודשי ברוטו, בקירוב) וביטוח לאומי + מס בריאות לעובד 2026:
  // 4.27% עד 7,703 ₪ (שיעור מופחת), 12.17% מעל (שיעור מלא).
  const BRACKETS = [
    { r: 10, t: 'עד כ-7,000 ₪' }, { r: 14, t: 'כ-7,000–10,000 ₪' }, { r: 20, t: 'כ-10,000–16,000 ₪' },
    { r: 31, t: 'כ-16,000–22,500 ₪' }, { r: 35, t: 'כ-22,500–46,500 ₪' }, { r: 47, t: 'כ-46,500–60,000 ₪' }, { r: 50, t: 'מעל כ-60,000 ₪' }
  ];
  const BL_REDUCED = 4.27, BL_FULL = 12.17;
  let bracket = 0;
  try { bracket = +localStorage.getItem('shovi-bracket') || 0; } catch (e) { /* בלי אחסון */ }
  const costOf = u => (bracket && u) ? u * (bracket + (bracket >= 20 ? BL_FULL : BL_REDUCED)) / 100 : null;
  (function taxBar() {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:.9rem;color:var(--muted)';
    bar.innerHTML = `<label for="bracket">להערכת העלות נטו – מדרגת המס שלי:</label>
      <select id="bracket" style="font:inherit;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);padding:3px 6px">
        <option value="0">לא נבחר</option>
        ${BRACKETS.map(b => `<option value="${b.r}"${b.r === bracket ? ' selected' : ''}>${b.r}% (שכר ${b.t})</option>`).join('')}
      </select>`;
    $('chips').after(bar);
    $('bracket').addEventListener('change', e => {
      bracket = +e.target.value;
      try { localStorage.setItem('shovi-bracket', String(bracket)); } catch (err) { /* בלי אחסון */ }
      if (q.value.trim()) run();
    });
  })();

  // ===== טעינת נתונים =====
  fetch('data/cars.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => {
      data = d;
      idx = S.createIndex(d);
      const built = d.built ? new Date(d.built).toLocaleDateString('he-IL') : '';
      status.textContent = `${idx.recs.length.toLocaleString('he-IL')} דגמים במחירון` + (built ? ` · עודכן ${built}` : '');
      footer(built);
      const fromUrl = new URLSearchParams(location.search).get('q');
      if (fromUrl) { q.value = fromUrl; run(); }
      else if (pending) run();
    })
    .catch(e => { status.textContent = 'שגיאה בטעינת המחירון (' + e.message + '). חיפוש לפי מספר רכב עדיין זמין.'; footer(''); });

  function footer(built) {
    const T = S.TAX;
    $('foot').innerHTML = `
      <p><b>זה לא הסכום שיורד מהמשכורת.</b> שווי השימוש הוא סכום ברוטו: הוא נזקף לשכר כאילו קיבלתם אותו בכסף,
      ועליו משלמים מס הכנסה, ביטוח לאומי ומס בריאות. העלות בפועל משתנה מעובד לעובד, לפי מדרגת המס השולית
      (10%–50%, תלוי בגובה השכר), נקודות הזיכוי ושיעור הביטוח הלאומי. לדוגמה, שווי של ₪4,000 במדרגה של 31%
      יעלה בערך ₪1,240 מס הכנסה בחודש, ועוד ביטוח לאומי ומס בריאות. יש מעסיקים שלוקחים על עצמם את המס ("גילום").</p>
      <p><b>* העלות המשוערת היא הערכה בלבד, ולא החישוב הסופי.</b> היא מחושבת כשווי השימוש כפול מדרגת המס השולית שבחרתם,
      ועוד ביטוח לאומי ומס בריאות (4.27% לשכר עד 7,703 ₪, 12.17% מעליו). בפועל הסכום תלוי בשכר המלא, בנקודות הזיכוי,
      בזיכויים ובפטורים נוספים, בשכר ממקומות עבודה נוספים ובגילום של המעסיק. הסכום המדויק מופיע רק בתלוש השכר.</p>
      <p><b>שני הערכים בכל תוצאה:</b> "מעודכן" – השווי שנזקף בפועל בתלוש השנה, לפי המחיר המתואם.
      "כחדש" – אותו חישוב לפי מחיר המחירון המקורי, בלי הצמדה למדד (כפי שהיה נזקף לרכב חדש באותו מחיר היום).</p>
      <p><b>אופן החישוב (שנת מס ${T.year}):</b> ${(T.rate * 100).toFixed(2)}% מהמחיר המתואם – מחיר המחירון של הרכב כחדש,
      צמוד למדד מאז שנת הרישום – מעוגל ל-10 ₪, עד תקרה של ${fmt(T.cap)}. בניכוי הפחתה חודשית: היברידי ${fmt(T.reduction.h)},
      פלאג-אין ${fmt(T.reduction.p)}, חשמלי ${fmt(T.reduction.e)}.</p>
      <p>${data && data.source === 'taxes'
        ? 'מחירי המחירון ושווי השימוש לקוחים מהקובץ הרשמי של רשות המסים'
        : 'מחירי המחירון לקוחים ממחירון היבואנים של משרד התחבורה'}${built ? ' (עדכון אחרון ' + built + ')' : ''}.
      רמות הגימור והמפרט – ממאגרי משרד התחבורה ב-data.gov.il. לאותו דגם יכולים להיות כמה מחירים: לכל יבואן (רשמי או מקביל) מחיר מחירון משלו.</p>
      <p>התוצאה להמחשה בלבד. החישוב המחייב – ב<a href="https://www.misim.gov.il/mm_usecar10/UseCarScreen.aspx" target="_blank" rel="noopener">סימולטור רשות המסים</a>.</p>`;
  }

  // ===== חיפוש =====
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  $('f').addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); run(); q.blur(); });
  $('chips').addEventListener('click', e => { if (e.target.classList.contains('chip')) { q.value = e.target.textContent; run(); } });

  function run() {
    const text = q.value.trim();
    history.replaceState(null, '', text ? '?q=' + encodeURIComponent(text) : location.pathname);
    if (!text) { out.innerHTML = ''; return; }
    const digits = text.replace(/[\s-]/g, '');
    if (/^\d{7,8}$/.test(digits)) return plate(digits);
    if (!idx) { pending = text; out.innerHTML = '<div class="note">המחירון עדיין נטען…</div>'; return; }
    render(S.search(idx, text));
  }

  function render(r) {
    let h = '';
    if (!r.tokens.length) {
      out.innerHTML = '<div class="note">הוסיפו יצרן או דגם (שנה לבדה לא מספיקה).</div>'; return;
    }
    if (r.unmatched.length) h += `<div class="note warn">לא נמצאה התאמה למילים: <b>${esc(r.unmatched.join(', '))}</b> – נסו כתיב אחר או באנגלית.</div>`;
    if (r.yearRelaxed) h += `<div class="note warn">לא נמצאו דגמים משנת ${r.year} – מוצגות שנים סמוכות.</div>`;
    if (!r.exact.length) { out.innerHTML = h + '<div class="note">לא נמצאו תוצאות.</div>'; return; }

    const many = r.total > 1;
    h += `<div class="sec">${many ? r.total.toLocaleString('he-IL') + ' דגמים תואמים' : 'דגם תואם'}
      ${many && r.tokens.length < 3 ? '<small>· הוסיפו רמת גימור, נפח מנוע או סוג הנעה כדי לצמצם</small>' : ''}</div>`;
    h += `<div id="list"></div>`;
    if (r.near.length) h += `<div class="sec">דגמים קרובים <small>· התאמה חלקית</small></div><div id="near"></div>`;
    out.innerHTML = h;
    paginate($('list'), r.exact);
    if (r.near.length) paginate($('near'), r.near);
  }

  function paginate(el, list) {
    let shown = 0;
    const more = document.createElement('button');
    more.className = 'more';
    const step = () => {
      const frag = document.createDocumentFragment();
      list.slice(shown, shown + PAGE).forEach(rec => frag.appendChild(card(rec)));
      shown += PAGE;
      el.insertBefore(frag, more.parentNode ? more : null);
      if (shown >= list.length) more.remove(); else more.textContent = `הצג עוד (${list.length - shown})`;
    };
    more.onclick = step;
    el.appendChild(more);
    step();
  }

  function card(rec, extra) {
    const d = document.createElement('div');
    d.className = 'card';
    const engine = rec.cc ? (rec.cc / 1000).toFixed(1) + ' ל׳' : '';
    const opts = Object.entries(S.PROP_LABEL).map(([k, v]) => `<option value="${k}"${k === rec.pr ? ' selected' : ''}>${v}</option>`).join('');
    d.innerHTML = `
      <div class="title">${esc(rec.m)} ${esc(rec.k || rec.dn)} ${rec.t ? `<span class="trim">${esc(rec.t)}</span>` : ''}</div>
      <div class="meta">
        <span>שנת ${rec.y}</span>
        <span>קוד תוצר <b>${pad5(rec.tc)}</b> · קוד דגם <b>${(rec.dcs || [rec.dc]).map(pad5).join(', ')}</b></span>
        ${rec.dn ? `<span>תיאור דגם: <b dir="ltr">${esc(rec.dn)}</b></span>` : ''}
        ${engine ? `<span>${engine}</span>` : ''}
        ${rec.hp ? `<span>${rec.hp} כ״ס</span>` : ''}
        ${rec.b ? `<span>${esc(rec.b)}</span>` : ''}
        ${rec.imp ? `<span>${rec.off ? '<b style="color:var(--good)">יבואן רשמי</b>' : 'יבואן מקביל'}: ${esc(rec.imp)}</span>` : ''}
        <span><select class="prop" aria-label="סוג הנעה">${opts}</select></span>
        ${extra || ''}
      </div>
      <div class="val">
        <div class="lbl">שווי שימוש חודשי – מעודכן ל-${S.TAX.year}</div>
        <div class="num"></div>
        <div class="price">מחיר מתואם ${fmt(rec.adj || rec.p)}${(rec.adj || rec.p) > S.TAX.cap ? ' (מעל התקרה)' : ''}</div>
        <div class="asnew" style="font-size:.82rem;white-space:nowrap;margin-top:2px">כחדש: <b class="num2"></b> <span style="color:var(--muted)">(מחירון ${fmt(rec.p)}, בלי הצמדה)</span></div>
        <div class="cost" style="font-size:.82rem;margin-top:4px;padding:3px 8px;border-radius:8px;background:var(--accent-soft);display:none"></div>
      </div>`;
    const numEl = d.querySelector('.num'), num2El = d.querySelector('.num2'), costEl = d.querySelector('.cost'), sel = d.querySelector('select');
    const upd = () => {
      const u = S.usageValue(rec.p, sel.value, rec);
      numEl.textContent = fmt(u);
      num2El.textContent = fmt(S.usageValue(rec.p, sel.value));   // לפי מחיר המחירון המקורי
      const c = costOf(u);
      costEl.style.display = c ? '' : 'none';
      if (c) costEl.innerHTML = `עלות משוערת לעובד: <b>כ-${fmt(Math.round(c / 10) * 10)}</b> לחודש <span style="color:var(--muted)">(הערכה בלבד*)</span>`;
    };
    sel.onchange = upd; upd();
    return d;
  }

  // ===== חיפוש לפי מספר רכב (בזמן אמת מול data.gov.il) =====
  async function plate(num) {
    out.innerHTML = `<div class="status"><span class="spinner"></span>מחפש רכב <span class="plate">${num}</span>…</div>`;
    try {
      let car = null;
      for (const res of REG) {
        const r = await api(res, { filters: JSON.stringify({ mispar_rechev: +num }), limit: 1 });
        if (r.records.length) { car = r.records[0]; break; }
      }
      if (!car) { out.innerHTML = `<div class="note warn">לא נמצא רכב מספר ${num} במאגרי משרד התחבורה.</div>`; return; }

      const tc = +car.tozeret_cd, dc = +car.degem_cd, yProd = +car.shnat_yitzur;
      const yReg = parseInt(String(car.moed_aliya_lakvish || '').split('-')[0], 10) || yProd;
      let rows = idx ? idx.recs.filter(r => r.tc === tc && r.dc === dc) : [];
      if (!rows.length) rows = await livePrices(tc, dc, car);
      const pick = rows.find(r => r.y === yReg) || rows.find(r => r.y === yProd);
      const fuelProp = /חשמל\s*\/|\/\s*חשמל/.test(car.sug_delek_nm || '') ? 'h' : /^חשמל$/.test((car.sug_delek_nm || '').trim()) ? 'e' : null;

      let h = `<div class="sec"><span class="plate">${num}</span> · ${esc(car.tozeret_nm)} ${esc(car.kinuy_mishari || car.degem_nm)}
        ${car.ramat_gimur ? `<span style="color:var(--accent)">${esc(car.ramat_gimur)}</span>` : ''}</div>
        <div class="note">שנת ייצור ${yProd || '—'} · עלה לכביש ${esc(car.moed_aliya_lakvish || '—')} · קוד תוצר ${pad5(tc)} · קוד דגם ${pad5(dc)} · ${esc(car.sug_delek_nm || '')}</div>`;
      if (yReg < 2010) h += `<div class="note warn">הרכב נרשם לפני 2010 – שווי השימוש נקבע לפי טבלאות קבוצות מחיר ולא לפי מחירון.</div>`;
      out.innerHTML = h + '<div id="list"></div>';
      const list = $('list');
      if (!rows.length) { list.innerHTML = '<div class="note warn">לא נמצא מחיר מחירון לקוד הדגם הזה. בדקו בסימולטור של רשות המסים.</div>'; return; }
      const mk = (r, tag) => {
        const rec = Object.assign({}, r, { t: r.t || car.ramat_gimur || '' });
        if (fuelProp && rec.pr === 'r' && !rec.u) rec.pr = fuelProp;
        return card(rec, tag);
      };
      if (pick) {
        // התוצאה של הרכב הזה: שנת העלייה לכביש. שאר השנים של אותו קוד דגם – רק בלחיצה
        list.appendChild(mk(pick, `<span style="color:var(--good);font-weight:700">✓ לפי שנת ${pick.y === yReg ? 'העלייה לכביש' : 'הייצור'} (${pick.y})</span>`));
        const others = rows.filter(r => r !== pick).sort((a, b) => b.y - a.y);
        if (others.length) {
          const btn = document.createElement('button');
          btn.className = 'more';
          btn.textContent = `אותו קוד דגם בשנות רישום אחרות (${others.length})`;
          btn.onclick = () => { btn.remove(); others.forEach(r => list.appendChild(mk(r))); };
          list.appendChild(btn);
        }
      } else {
        list.insertAdjacentHTML('beforeend', `<div class="note warn">לא נמצא מחירון לשנת ${yReg} – מוצגות השנים הקרובות לאותו קוד דגם.</div>`);
        rows.sort((a, b) => Math.abs(a.y - yReg) - Math.abs(b.y - yReg) || (b.off - a.off)).forEach(r => list.appendChild(mk(r)));
      }
    } catch (e) {
      out.innerHTML = `<div class="note warn">שגיאה בפנייה למאגר משרד התחבורה (${esc(e.message)}). נסו שוב בעוד רגע.</div>`;
    }
  }

  async function livePrices(tc, dc, car) {
    const r = await api(PRICES, { filters: JSON.stringify({ tozeret_cd: tc, degem_cd: dc }), limit: 50 });
    return r.records.filter(x => +x.mehir > 0).map(x => ({
      m: x.tozeret_nm || car.tozeret_nm, tc, dc, dn: x.degem_nm || '', k: x.kinuy_mishari || car.kinuy_mishari || '',
      y: +x.shnat_yitzur, p: +x.mehir, t: car.ramat_gimur || '', cc: 0, hp: 0, pr: 'r', b: '', imp: x.shem_yevuan || '', adj: 0, u: 0
    }));
  }

  async function api(resource, params) {
    const u = new URL(API);
    u.searchParams.set('resource_id', resource);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await fetch(u);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j.success) throw new Error('API');
    return j.result;
  }
})();
