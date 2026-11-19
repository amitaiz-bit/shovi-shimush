// בדיקות למנוע החיפוש עם נתוני דוגמה מלאכותיים (המחירים לא אמיתיים)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../search.js');

const m = ['טויוטה יפן', 'טויוטה טורקיה', 'סקודה צ\'כיה', 'מאזדה יפן', 'קיה קוריאה', 'ב.מ.וו גרמניה', 'יונדאי קוריאה'];
const i = ['יוניון מוטורס', 'סמלת', 'דלק מוטורס', 'כלמוביל'];
const rows = [
  // m, tc, dc, degem_nm, kinuy, year, price, trim, cc, hp, prop, body, imp
  [0, 413, 1101, 'ZRE181L-GEFNKW', 'COROLLA', 2017, 119990, 'SUN', 1598, 132, 'r', 'סדאן', 0],
  [0, 413, 1102, 'ZRE181L-GEXNKW', 'COROLLA', 2017, 128990, 'SUN PLUS', 1598, 132, 'r', 'סדאן', 0],
  [0, 413, 1103, 'ZRE181L-GEXGKW', 'COROLLA', 2017, 139990, 'SPIRIT', 1598, 132, 'r', 'סדאן', 0],
  [0, 413, 1104, 'NRE180L', 'COROLLA', 2017, 117990, 'CITY', 1329, 99, 'r', 'סדאן', 0],
  [1, 414, 1201, 'ZWE211L', 'COROLLA', 2017, 145990, 'HYBRID', 1798, 122, 'h', 'סטיישן', 0],
  [0, 413, 1101, 'ZRE181L-GEFNKW', 'COROLLA', 2018, 121990, 'SUN', 1598, 132, 'r', 'סדאן', 0],
  [0, 413, 1301, 'ZWE211L', 'COROLLA', 2020, 154990, 'HYBRID SUN', 1798, 122, 'h', 'האצ\'בק', 0],
  [0, 413, 1401, 'NSP151L', 'YARIS', 2017, 92990, 'SUN', 1496, 111, 'r', 'האצ\'בק', 0],
  [0, 413, 1501, 'ZWA10', 'C-HR', 2017, 159990, 'CHIC', 1798, 122, 'h', 'קרוסאובר', 0],
  [0, 413, 1601, 'ASA44', 'RAV4', 2017, 189990, 'PREMIUM', 1987, 152, 'r', 'רכב שטח', 0],
  [2, 520, 801, 'NX3', 'OCTAVIA', 2020, 139990, 'AMBITION', 1395, 150, 'r', 'סטיישן', 1],
  [2, 520, 802, 'NX5', 'OCTAVIA', 2020, 159990, 'STYLE', 1498, 150, 'r', 'סטיישן', 1],
  [3, 310, 501, 'BN', 'MAZDA 3', 2018, 124990, 'SPIRIT', 1998, 165, 'r', 'סדאן', 2],
  [3, 310, 502, 'KF', 'CX-5', 2018, 169990, 'EXECUTIVE', 1998, 165, 'r', 'רכב שטח', 2],
  [4, 610, 901, 'DE', 'NIRO', 2022, 179990, 'EX', 1580, 141, 'h', 'קרוסאובר', 3],
  [4, 610, 902, 'DE-EV', 'NIRO EV', 2022, 219990, 'EX', 0, 204, 'e', 'קרוסאובר', 3],
  [5, 701, 11, 'G20', '320I', 2020, 320000, 'M SPORT', 1998, 184, 'r', 'סדאן', 0],
  [6, 620, 77, 'NX4', 'TUCSON', 2022, 189990, 'PRESTIGE', 1598, 230, 'h', 'רכב שטח', 0],
  [5, 701, 12, 'G05', 'X5', 2024, 700000, 'XDRIVE', 2998, 340, 'r', 'רכב שטח', 0],
];
const idx = S.createIndex({ m, i, rows });

let fail = 0;
const t = (name, query, check) => {
  const r = S.search(idx, query);
  const ok = check(r);
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(42)} → ${r.exact.map(x => `${x.k} ${x.t} ${x.y}`).join(' | ')}${r.near.length ? '  ~near: ' + r.near.length : ''}${r.unmatched.length ? '  unmatched: ' + r.unmatched : ''}`);
};

t('טויוטה קורולה 2017 → כל רמות הגימור', 'טויוטה קורולה 2017', r => r.exact.length === 5 && r.exact.every(x => x.k === 'COROLLA' && x.y === 2017));
t('קורולה 2017 סאן → SUN קודם', 'קורולה 2017 סאן', r => r.exact[0].t === 'SUN' && r.exact.every(x => /SUN/.test(x.t)));
t('קורולה 2017 סאן פלוס → SUN PLUS בלבד', 'קורולה 2017 סאן פלוס', r => r.exact.length === 1 && r.exact[0].t === 'SUN PLUS');
t('corolla 2017 hybrid', 'corolla 2017 hybrid', r => r.exact.length === 1 && r.exact[0].pr === 'h');
t('קורולה היברידי 2017', 'קורולה היברידי 2017', r => r.exact[0].t === 'HYBRID');
t('שגיאת כתיב: קרולה 2017', 'קרולה 2017', r => r.exact.length && r.exact.every(x => x.k === 'COROLLA'));
t('שגיאת כתיב באנגלית: corola', 'corola 2017', r => r.exact.length && r.exact[0].k === 'COROLLA');
t('קורולה 1.6 2017', 'קורולה 1.6 2017', r => r.exact.every(x => x.cc === 1598));
t('שנה ללא תוצאה → שנה סמוכה', 'קורולה 2019', r => r.yearRelaxed && r.exact.length);
t('סקודה אוקטביה 2020 סטייל', 'סקודה אוקטביה 2020 סטייל', r => r.exact[0].t === 'STYLE');
t('מאזדה 3 2018', 'מאזדה 3 2018', r => r.exact[0].k === 'MAZDA 3');
t('cx5 (בלי מקף)', 'cx5', r => r.exact[0].k === 'CX-5');
t('cx 5', 'cx 5', r => r.exact[0].k === 'CX-5');
t('קיה נירו חשמלי', 'קיה נירו חשמלי', r => r.exact[0].pr === 'e');
t('במוו 2020', 'במוו 2020', r => r.exact[0].k === '320I');
t('bmw x5', 'bmw x5', r => r.exact[0].k === 'X5');
t('ראב 4', 'ראב 4 2017', r => r.exact[0].k === 'RAV4');
t('קוד דגם 1103', '1103', r => r.exact[0].dc === 1103);
t('יונדאי טוסון', 'יונדאי טוסון', r => r.exact[0].k === 'TUCSON');
t('תעתיק לא במילון: סי אייצ אר?', 'יאריס סאן', r => r.exact[0].k === 'YARIS');

// חישוב
const eq = (name, a, b) => { const ok = a === b; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name}: ${a} (expected ${b})`); };
eq('119,990 בנזין', S.usageValue(119990, 'r'), 2980);       // 2975.75 -> 2980
eq('145,990 היברידי', S.usageValue(145990, 'h'), 3620 - 560); // 3620.55 -> 3620
eq('219,990 חשמלי', S.usageValue(219990, 'e'), 5460 - 1350);  // 5455.75 -> 5460
eq('700,000 מעל התקרה', S.usageValue(700000, 'r'), 14800);    // 596,860*2.48%=14802.1 -> 14800

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
