# איך עושים

**2026-10-12 - בדיקות בדפדפן מקומית:** מגדירים `PYTHON=/home/user/studyspot/backend/.venv/bin/python` ו-`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, ואז `npx playwright test` מתוך `frontend`, וגם עם `-c playwright.edge.config.ts`.

**2026-10-12 - לספור בקשות שנדחו:** מריצים עם `DEBUG=pw:webserver`, ומחפשים ` 429` בפלט.

**2026-10-12 - `PostgreSQL` נעצר אחרי הפעלה מחדש של המחשב בענן:** `service postgresql start`.

**2026-10-12 - בדיקת הריצה בגיטהאב:** `mcp__github__actions_list`, ואחר כך תזכורת לעצמי עם `send_later`, בעוד כשמונה דקות.

**2026-10-12 - בדיקת הכניסה ב-`actions.spec` מדולגת אחרי שעות הפתיחה.** זה מכוון.

**2026-10-16 - `Playwright` מקומית:** `PYTHON=$PWD/../backend/.venv/bin/python CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`, מתוך `frontend`.

**2026-10-16 - שעון מזויף ב-`vitest`:** `vi.useFakeTimers({ shouldAdvanceTime: true })`, ואז `act(() => vi.advanceTimersByTimeAsync(ms))`. פוקוס שנקבע בתוך `effect` מחכים לו עם `vi.waitFor`.

**2026-10-18 - פתיחת גיבוי אצל המשתמש:** בתיקייה `C:\Users\itayg\Projects\StudySpot-keys`, `Expand-Archive <zip> -DestinationPath .`, ואז `age -d -i studyspot-backup-key.txt -o studyspot.dump <file>.dump.age`. מדריך מלא ב-`docs/DEPLOY.md`.

**2026-10-18 - עדכון דף ההתקדמות בסוף גל:** הדף "התקדמות StudySpot", `https://claude.ai/artifact/YLL4rTzB18D4wH81dSpE9D`, מוצמד לצד של `claude.ai`.
1. מעדכנים את `knowledge/progress.json`: הגל הנוכחי, הצעד הבא, מה ממתין למשתמש, והצפי.
2. מריצים `python3 knowledge/progress_export.py <scratchpad>/progress`. נוצרים `waves.json` ו-`summary.json`.
3. מעלים כל קובץ עם `Artifact`, `asset: true`, וה-`url` של הדף.
4. ב-`ArtifactData`, `update` ל-`datasets/waves` ול-`datasets/summary`: ה-`url` החדש בתוך `source`, ו-`updated`.
- **בתוך הסשן יש גם תוסף:** `studyspot-progress`, עם שורת מצב והפקודה `/progress`. הוא חי רק בסשן שבו נבנה.

**2026-10-26 - `Playwright` מקומית, עדכני:** `export PATH=/home/user/studyspot/backend/.venv/bin:$PATH CHROMIUM_PATH=/opt/pw-browsers/chromium`, מתוך `frontend`. `/opt/pw-browsers/chromium` הוא קישור, ולכן `find` בלי `-L` לא מוצא אותו. אם השרת נופל ב-`Connection refused`: `service postgresql start`.

**2026-10-27 - סביבת בדיקות בענן, מאפס:** `uv venv /tmp/claude-0/venv && uv pip install -r backend/requirements-dev.lock && uv pip install --no-deps -e backend`. משתנים כמו ב-`.github/workflows/ci.yml` (`JWT_SECRET`, `CHECKIN_CODE_SECRET`, `DATABASE_URL`, `TEST_DATABASE_URL`). המסד: `service postgresql start` (נופל אחרי הפעלה מחדש של הסביבה), ובפעם הראשונה יוצרים משתמש `studyspot` עם סיסמה `studyspot` ושני מסדים, `studyspot` ו-`studyspot_test`, ואז `alembic upgrade head` ו-`python -m app.seed`. `Playwright`: `PYTHON=<venv>/bin/python CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.

**2026-10-27 - מצב `CI` בלי להציף את ההקשר:** `curl "https://api.github.com/repos/itayG11/studyspot/actions/runs?head_sha=<SHA מלא>"` ומסננים עם `python`. עם `SHA` קצר מתקבל ריק. הכלי `actions_list` של ה-`MCP` מתעלם מ-`per_page` ומחזיר עשרות ריצות. לוג של שלב שנכשל: `get_job_logs` עם `tail_lines`.

**2026-10-27 - נעילת פעולת `GitHub` לפי `SHA`:** `git ls-remote https://github.com/<repo>.git refs/tags/vN 'refs/tags/vN^{}'`, ולוקחים את הקומיט המקולף (`^{}`) כשהתגית מוערת. ה-`API` של מאגרים אחרים חסום בסשן. הפורמט: `uses: owner/repo@<sha> # vN`.

**2026-10-27 - עדכון נעילת תלויות עם `hash`:** `pip-compile --allow-unsafe --generate-hashes --output-file=requirements.lock --strip-extras --upgrade-package "anthropic==2.2.0" pyproject.toml`, ובנוסף עם `--extra=dev --output-file=requirements-dev.lock`. `--upgrade-package` מונע שדרוג של כל השאר.

**2026-10-27 - סרטון הדגמה:** הסקריפטים ב-`docs/demo-video/` (`record.mjs` מקליט עם `Playwright`, `assemble.py` חותך ומחבר). קול מ-`Higgsfield`: `elevenlabs_v4_turbo` לאנגלית, `elevenlabs_v4` לעברית, הקול `Holden` (`3c9d6053-6334-592c-8997-4e325286af3f`). עלות: 1.65 לאנגלית ו-2.3 לעברית לקליפ רציף של כ-38 שניות. **בודקים `get_cost` לפני**, וקליפ אחד לשפה במקום קליפ לכל סצנה (עלות מינימום 0.3 לקליפ). בקשות רבות ביחד מחזירות 429, ולא מחייבות: שולחים בקבוצות קטנות. גבולות משפטים: `ffmpeg -af silencedetect=noise=-32dB:d=0.28`. הורדת הקליפים דורשת להוסיף `d8j0ntlcm91z4.cloudfront.net` ל-`Allowed domains` בהגדרות הסביבה (תפריט הסביבה, `Edit`, `Network access`).

**2026-10-27 - `Lighthouse` מהענן:** בתיקיית סקרץ': `npm i lighthouse@12`, `CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`, `--chrome-flags="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY"`, `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. הציון קופץ בין ריצות על אותו דף, ולכן מריצים חמש פעמים.

**2026-10-27 - מדידת גובה כותרת לאורך הטעינה (לאיתור `CLS`):** `Playwright` עם חלון של 412 על 823, סקריפט שמתחיל ב-`addInitScript` ורושם את `offsetHeight` של `header` בכל פריים כשהוא משתנה.

**2026-10-27 - מדידת `TRUSTED_PROXY_HOPS`:** ראו `docs/DEPLOY.md`. הכפתור הוסר, ואפשר לשחזר אותו מהקומיט `1422100`.

**2026-10-27 - ביצועי `GitHub` מהסשן:** `api.github.com` נגיש לקריאה עם ההרשאה של הסשן, אבל יצירת `Release` אסורה. את ה-`Release` יוצר המשתמש בדף `Releases`, עם התיאור שאני מכין.

**2026-10-27 - מכשירים בענן ללא `ss`:** כדי לבדוק פורט תפוס משתמשים ב-`ps aux | grep` ולא ב-`ss`.

**2026-10-27 - `BrowserStack` מהענן:** משתנים `BROWSERSTACK_USERNAME` ו-`BROWSERSTACK_ACCESS_KEY` כמשתני סביבה רגילים (לא `Add secret`: `BrowserStack` צריך את הפרטים בכתובת החיבור, ולא בכותרת). מארחים: `www`, `hub`, `cdp`, `api`, `automate`, `hub-cloud` של `browserstack.com`. חיבור ישיר מ-`Playwright`: `chromium.connect('wss://cdp.browserstack.com/playwright?caps=' + encodeURIComponent(JSON))`, דפדפנים `chrome`, `edge`, `playwright-firefox`, `playwright-webkit`. **ה-`WebSocket` של `Playwright` לא עובר דרך ה-`proxy`:** שורה ב-`/etc/hosts` ושרת העברה קטן (`CONNECT` דרך `HTTPS_PROXY`) על פורט 443, ואחר כך להסיר. מכשירים אמיתיים רק דרך `browserstack-node-sdk` (`Android` עבד, `iPhone` נכשל עם `Internal error`, גם בדוגמה הרשמית). התיעוד: `WebFetch` לא עובר ב-`proxy`, אז `curl` ואז המרה לטקסט. הסקריפטים: `docs/browserstack/`.

**2026-10-27 - מאגר פרטי חדש:** המשתמש יוצר אותו בגיטהאב (ל-`create_repository` אין הרשאה, `403`). אחרי זה `add_repo` עם `access: push`, שכפול אחד, בדיקה ש-`private` נכון לפני כל העתקה, ו-`register_repo_root`.

**2026-10-27 - צילום פרופיל גיטהאב חי:** `Playwright` עם `proxy` של הסביבה. גיטהאב בלי העיצוב שלה (`githubassets` חסום), ולכן תצוגה נאמנה: להפיק את ה-`README` עם `marked`, ולהחליף את כתובות התמונות בכתובות ה-`camo` שנמצאות ב-`DOM` החי. אתרי סמלים חיצוניים (`skillicons`, `simpleicons`) חסומים מהסביבה.

**2026-10-27 - באנר ותמונת שיתוף מקומיים:** `HTML` עם גופנים מ-`node_modules/@fontsource`, וצילום ב-`Playwright` לגודל מדויק (1280x320 ו-1280x640). לתמונת שיתוף משתמשים בצילום עדכני של האתר, ולא בקובץ ישן.
