#!/usr/bin/env python3
"""
מוריד את קובץ שווי השימוש הרשמי מרשות המסים (חייב לרוץ מכתובת IP בישראל),
מקצר אותו, ואם הוא השתנה – מעלה אותו ל-GitHub כ-data/taxes-official.csv.
ההעלאה מפעילה את ה-GitHub Action שבונה מחדש את data/cars.json.

הרצה:   python3 sync_taxes.py            (רגיל)
        python3 sync_taxes.py --dry-run  (בלי להעלות, רק בדיקה)
טוקן:   קובץ ~/.shovi-token עם GitHub fine-grained token (הרשאת Contents: Read and write
        ל-repository shovi-shimush בלבד), או משתנה סביבה GITHUB_TOKEN.
בלי תלויות – Python 3.8+ בלבד.
"""
import base64, hashlib, html, http.cookiejar, json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime

REPO = "amitaiz-bit/shovi-shimush"
BRANCH = "main"
PATH = "data/taxes-official.csv"
TAX_PAGE = "https://secapp.taxes.gov.il/mm_usecar10/DownLoad.aspx?cur=2"
TAX_BUTTON = "ctl00$ContentUsersPage$btnexcel2"   # קובץ מידע לאימות נתונים – מורחב, השנה הנוכחית
KEEP = {0, 1, 3, 4, 5, 6, 8, 10, 13, 16, 17, 18}  # אותן עמודות כמו compactTax ב-build-data.mjs
MIN_YEAR = 2010
MIN_ROWS = 5000
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
DRY = "--dry-run" in sys.argv


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def download_tax_file():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", UA)]
    page = opener.open(TAX_PAGE, timeout=60).read().decode("utf-8", "replace")

    form = {}
    for tag in re.findall(r"<input\b[^>]*>", page, re.I):
        name = re.search(r'name="([^"]*)"', tag)
        if not name:
            continue
        name = html.unescape(name.group(1))
        typ = (re.search(r'type="([^"]*)"', tag) or [None, "text"])[1].lower()
        if typ in ("submit", "button", "image", "checkbox", "radio") and name != TAX_BUTTON:
            continue
        val = re.search(r'value="([^"]*)"', tag)
        form[name] = html.unescape(val.group(1)) if val else ""
    if TAX_BUTTON not in form:
        raise RuntimeError("download button not found – the page may have changed")

    action = re.search(r'<form[^>]*action="([^"]*)"', page, re.I)
    url = urllib.parse.urljoin(TAX_PAGE, html.unescape(action.group(1)) if action else TAX_PAGE)
    req = urllib.request.Request(url, data=urllib.parse.urlencode(form).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": TAX_PAGE})
    res = opener.open(req, timeout=300)
    ctype = res.headers.get("Content-Type", "")
    if not re.search(r"csv|octet|excel", ctype, re.I):
        raise RuntimeError(f"unexpected response type: {ctype}")
    raw = res.read()
    log(f"downloaded {len(raw) / 1e6:.1f}MB ({res.headers.get('Content-Disposition', '')})")
    return raw.decode("windows-1255")


def compact(text):
    lines = text.splitlines()
    out = [",".join(x.strip() for x in lines[0].split(","))]
    for line in lines[1:]:
        f = [x.strip() for x in line.split(",")]
        if len(f) < 19:
            continue
        try:
            if int(f[1]) < MIN_YEAR:
                continue
        except ValueError:
            continue
        out.append(",".join(v if j in KEEP else "" for j, v in enumerate(f)))
    if len(out) - 1 < MIN_ROWS:
        raise RuntimeError(f"only {len(out) - 1} rows – refusing to upload")
    return ("\n".join(out) + "\n").encode("utf-8"), len(out) - 1


def git_blob_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def gh(method, path, token, body=None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "shovi-sync"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read() or b"{}")


def upload(data, rows, token):
    # Git Data API – תומך בקבצים גדולים (Contents API מוגבל)
    ref = gh("GET", f"/git/ref/heads/{BRANCH}", token)
    head = ref["object"]["sha"]
    base_tree = gh("GET", f"/git/commits/{head}", token)["tree"]["sha"]
    try:
        current = gh("GET", f"/contents/{PATH}?ref={BRANCH}", token).get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        current = None
    if current == git_blob_sha(data):
        log("no change – nothing to upload")
        return False
    blob = gh("POST", "/git/blobs", token, {"content": base64.b64encode(data).decode(), "encoding": "base64"})["sha"]
    tree = gh("POST", "/git/trees", token, {"base_tree": base_tree,
              "tree": [{"path": PATH, "mode": "100644", "type": "blob", "sha": blob}]})["sha"]
    msg = f"עדכון קובץ שווי שימוש מרשות המסים ({rows} שורות, {datetime.now():%Y-%m-%d})"
    commit = gh("POST", "/git/commits", token, {"message": msg, "tree": tree, "parents": [head]})["sha"]
    gh("PATCH", f"/git/refs/heads/{BRANCH}", token, {"sha": commit})
    log(f"uploaded new file, commit {commit[:7]}")
    return True


def read_token():
    tok = os.environ.get("GITHUB_TOKEN", "").strip()
    if not tok:
        p = os.path.expanduser("~/.shovi-token")
        if os.path.exists(p):
            tok = open(p).read().strip()
    return tok


def main():
    text = download_tax_file()
    data, rows = compact(text)
    log(f"{rows} rows, {len(data) / 1e6:.1f}MB after compaction, blob {git_blob_sha(data)[:7]}")
    if DRY:
        log("dry run – not uploading")
        return
    token = read_token()
    if not token:
        raise RuntimeError("no GitHub token (~/.shovi-token or GITHUB_TOKEN)")
    upload(data, rows, token)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ERROR: {e}")
        sys.exit(1)
