# הסשן הבא מתחיל כאן

**קרא רק את זה, ואת `TODO.md`.** כל השאר רק כשצריך.

- **המצב, 26.10 בערב:**
  - **גלים 1 עד 15 גמורים,** והכול מוזג ל-`main`. הגל האחרון: itayG11/studyspot#18 ו-itayG11/studyspot#19.
  - **גל 15:** דוח הראיון, `README`, חבילת ההכנה ב-`docs/interview/`, ותרגול באתר החי. 14 הממצאים מהתרגול תוקנו. הסיכום: `knowledge/sessions/2026-10-26-wave-15.md`.
  - **בטסטים:** `pytest` 1359, `vitest` 581, `Playwright` 42, ובשלושה מכשירים 39.
- **ענף העבודה:** `claude/serene-turing-xdaak1`. `Render` מעלה ממנו לאתר החי. אחרי כל מיזוג: `git fetch origin main && git checkout -B claude/serene-turing-xdaak1 origin/main`.
- **הגישה לאתר החי:** `getstudyspot.me` פתוח ברשת של הסביבה. `Playwright` צריך `proxy: { server: process.env.HTTPS_PROXY }` ו-`NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. הסביבה יוצאת דרך כמה כתובות, ולכן בדיקת מגבלת קצב לפי כתובת לא תעבוד מכאן.
- **הכלים לשימוש חוזר:** `backend/tests/test_access_matrix.py`, `backend/tests/test_demo_admin_privacy.py` ו-`frontend/e2e/sweep.spec.ts`, שרץ עם `-c playwright.edge.config.ts`.
- **הבא: גל 16, לפי `docs/ROADMAP.md`, 16.1 עד 16.4.** מתחילים בתוכנית, במצב תכנון.
  - **16.1:** ביקורת סופית: סוכנים, `Lighthouse`, שלושה מכשירים, והאתר החי.
  - **16.2:** סרטון הדגמה.
  - **16.3:** לומדים את דוח הראיון ביחד, סעיף אחרי סעיף.
  - **16.4:** דף הגיטהאב: ה-`README`, וקובצי העבודה מחוץ למאגר הציבורי.
- **הוחלט ב-25.10:** אין גלריה, 5.7 בוטל. ההתראה ב-`Anthropic Console` כבר קיימת אצל המשתמש.
- **ממתין למשתמש:** הרשימה ב-`TODO.md`. **המשתמש ביקש ש-Claude יזכיר לו:** בתחילת כל סשן, להזכיר בשורה אחת את המשימות שלו שהגיע זמנן. `DMARC` ב-30.10 כבר ביומן שלו.

- **"גל גמור":** הרשימה ב-`CLAUDE.md`, תחת `When a wave is done`.
- **דף ההתקדמות:** מעדכנים בסוף כל גל, לפי `knowledge/how-to.md`.
- **כללים:**
  - עברית, מימין לשמאל;
  - צעד אחד בכל הודעה;
  - פלט בדיקות מקוצר;
  - `set -o pipefail` לפני דחיפה;
  - שומרים בגיט לפני סוכן סקירה;
  - `service postgresql start` אם המסד לא עונה.
