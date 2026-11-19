# מחשבון שווי שימוש ברכב

אתר סטטי (HTML + JS, בלי שרת) לחישוב שווי שימוש לפי מספר רכב, קוד דגם או טקסט חופשי.

## מבנה
- `index.html`, `app.js` – הממשק
- `search.js` – מנוע החיפוש ונוסחת החישוב (פרמטרי שנת המס בראש הקובץ – לעדכן כל ינואר)
- `scripts/build-data.mjs` – מוריד ומאחד את מאגרי data.gov.il לקובץ `data/cars.json`
- `.github/workflows/update-data.yml` – מריץ את הבנייה אוטומטית פעם בשבוע
- `test/search.test.mjs` – בדיקות למנוע החיפוש (`node test/search.test.mjs`)

## העלאה ל-GitHub Pages (חינם)
1. צרו repository חדש ב-GitHub והעלו אליו את כל הקבצים (כולל התיקייה `.github`).
2. Settings → Actions → General → Workflow permissions → **Read and write** → Save.
3. Actions → "עדכון נתוני מחירון" → **Run workflow**. ההרצה הראשונה לוקחת כ-10–20 דקות ויוצרת את `data/cars.json`.
4. Settings → Pages → Source: **Deploy from a branch**, Branch: `main` / root → Save.
5. האתר יעלה בכתובת `https://<שם-משתמש>.github.io/<שם-repo>/`.

אפשר גם Cloudflare Pages או Netlify – לחבר אותם לאותו repository, בלי פקודת build.

## הרצה מקומית
```
node scripts/build-data.mjs        # או --fast לגרסה מהירה בלי השלמה ממאגר הרכבים
python3 -m http.server 8000
```
