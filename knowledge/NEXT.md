# הסשן הבא מתחיל כאן

**קרא רק את זה, ואת `TODO.md`.** כל השאר רק כשצריך.

- **המצב:**
  - **גלים 1 עד 12:** גמורים ומוזגו ל-`main`, כולל הבדיקות באתר החי.
  - **גל 12:** יומן מנוי, itayG11/studyspot#9. הקוד ב-`backend/app/calendar_feed.py`, `app/ics.py` ו-`frontend/src/me/CalendarFeed.tsx`.
- **ענף העבודה:** `claude/serene-turing-xdaak1`. `Render` מעלה ממנו לאתר החי.
- **קודם:**
  1. **הענף כבר מעודכן ל-`main`.** בסוף כל גל, אחרי מיזוג: `git merge --ff-only origin/main`, ודוחפים.
  2. **`Search Console`, מ-20.10:** ב"מפות אתר", המצב של `sitemap.xml` אמור להיות "הצלחה", עם 7 דפים. ב-19.10 היה "לא ניתן היה לאחזר", לפני שגוגל קרא אותו. אם עדיין כך: "בדיקת כתובת אתר" על `https://getstudyspot.me/sitemap.xml`.
- **גלים 1 עד 13 גמורים.** גל 13, מסך ליד הדלת עם קוד שמתחלף כל דקה: itayG11/studyspot#10. הקוד ב-`backend/app/screens.py`, `app/codes.py` ו-`frontend/src/screen/ScreenPage.tsx`.
- **ממתין למשתמש:** בדיקת המסך באתר החי, כשמקום פתוח. הרשימה ב-`TODO.md`.
- **הבא:** גל 14, "אני לומד כאן" ו-`API` למוסדות, לפי `docs/ROADMAP.md`. מתחילים בתוכנית, במצב תכנון.

- **"גל גמור":** הרשימה ב-`CLAUDE.md`, תחת `When a wave is done`.
- **דף ההתקדמות:** מעדכנים בסוף כל גל, לפי `knowledge/how-to.md`.
- **כללים:**
  - עברית, מימין לשמאל;
  - צעד אחד בכל הודעה;
  - פלט בדיקות מקוצר;
  - `set -o pipefail` לפני דחיפה;
  - שומרים בגיט לפני סוכן סקירה;
  - `service postgresql start` אם המסד לא עונה.
