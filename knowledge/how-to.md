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
