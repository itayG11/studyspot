# 3. העמודים, ומה יש בכל אחד

- **המקור לרשימה:** `frontend/src/router.tsx`. כל עמוד כאן הוא נתיב שם. **[מתועד]**
- **איך נבדק:** `frontend/e2e/sweep.spec.ts` עובר על 25 עמודים, כאורח, סטודנט ומנהל, בשלושה מכשירים. **[מתועד]** `A-1` ב-`docs/testing/TEST_PLAN.md`

## המצבים, משותפים לכל העמודים
| מצב | מה רואים | הקוד |
|---|---|---|
| טעינה | "טוען…", או שלד אפור בצורת התוכן | **[מתועד]** `frontend/src/ui/PageLoading.tsx`, `frontend/src/ui/Skeleton.tsx` |
| ריק | כותרת, הסבר, ופעולה הבאה. למשל "אין הזמנות", עם "למצוא מקום" | **[מתועד]** `EmptyState` ב-`frontend/src/ui/States.tsx` |
| שגיאה | הודעה בעברית לפי קוד השגיאה, וכפתור "לנסות שוב" | **[מתועד]** `ErrorState` ב-`frontend/src/ui/States.tsx`, והתרגום ב-`frontend/src/i18n/errors.ts` |
| אין רשת | שגיאת `network_error`, והטופס קורא מחדש את הזמנים, כי ייתכן שהבקשה הגיעה | **[מתועד]** `frontend/src/features/booking/BookingForm.tsx` |
| עמוד לא קיים | "לא נמצא", בתוך המסגרת של האתר | **[מתועד]** `frontend/src/pages/NotFoundPage.tsx` |

- **מושג, `lazy loading`:** כל עמוד נטען רק כשנכנסים אליו, כדי שהקובץ הראשון יהיה קטן. בקוד, הפונקציה `page` ב-`router.tsx`. **[מתועד]**

## עמודי סטודנט ואורח
| כתובת | מי | מה מוצג | פעולות | הקובץ |
|---|---|---|---|---|
| `/<מוסד>` | כולם | מפה צבעונית לפי תפוסה, חיפוש וסינון, כרטיסי מקומות, ועומס הקמפוס היום | חיפוש, סינון, "איפה ללמוד עכשיו" | `frontend/src/pages/HomePage.tsx` |
| `/<מוסד>/spaces/<מספר>` | כולם | פרטים, שעות, גרף עומס חי ורגיל, ומפת תאים בחוות מחשבים | הזמנה, רק למחובר מהמוסד | `frontend/src/features/space/SpacePage.tsx` |
| `/scan` | מחובר | תוצאת הסריקה: נכנסת, או למה לא | כניסה ויציאה | `frontend/src/scan/ScanPage.tsx` |
| `/me` | מחובר | הזמנות, כניסה פעילה, רשימת המתנה, מערכת שעות, "בין שיעורים", יומן, התראות, סיסמה | ביטול, הארכה, ייבוא מערכת, מחיקת חשבון | `frontend/src/me/MyPage.tsx` |
| `/s/<אסימון>` | כל מי שקיבל קישור | "אני לומד כאן": איפה, ועד מתי | אין | `frontend/src/share/SharePage.tsx` |
| `/login` | אורח | גוגל, מיקרוסופט, קוד למייל, סיסמה, וכניסת הדגמה | כניסה | `frontend/src/pages/LoginPage.tsx` |
| `/institutions` | כולם | כל המוסדות באתר | מעבר למוסד | `frontend/src/pages/InstitutionsPage.tsx` |

## עמודי ניהול
| כתובת | מי | מה מוצג | הקובץ |
|---|---|---|---|
| `/<מוסד>/admin` | מנהל המוסד, או מנהל המערכת | חמש לשוניות: הקמה, שלטים להדפסה, מיקום בניינים, הוספה, וחיבורים | `frontend/src/admin/AdminPage.tsx` |
| `/system` | מנהל המערכת בלבד | מוסד חדש, הזמנה למנהל, כללי כניסה לאישור, וכל המוסדות | `frontend/src/system/SystemPage.tsx` |
| `/invite` | מי שקיבל קישור הזמנה | הצטרפות כמנהל מוסד | `frontend/src/pages/InvitePage.tsx` |
| `/screen` | מסך ליד הדלת, בלי התחברות | קוד שמתחלף כל דקה, ומקומות פנויים | `frontend/src/screen/ScreenPage.tsx` |

- **ההרשאה באתר:** `RequireAuth`, `RequireAdmin` ו-`RequireSystemAdmin` ב-`frontend/src/auth/guards.tsx`. **[מתועד]**
- **חשוב לראיון:** הבדיקה באתר היא רק נוחות, כדי להציג "אין גישה". ההגנה האמיתית בשרת, בכל נתיב. **[מתועד]** `backend/tests/test_access_matrix.py`

## לשוניות ניהול המוסד
| לשונית | מה עושים בה | הקובץ |
|---|---|---|
| הקמה | כללי כניסה, אימות סיומת ב-`DNS`, ומה חסר כדי להתחיל | `frontend/src/admin/Setup.tsx`, `frontend/src/admin/DomainProof.tsx` |
| שלטים להדפסה | שלט `QR` לכל מקום, או מסך ליד הדלת | `frontend/src/admin/Signs.tsx`, `frontend/src/admin/ScreenControls.tsx` |
| מיקום בניינים | לחיצה על המפה | `frontend/src/admin/Placer.tsx` |
| הוספה | בניין ומקום ביד, או טבלה מאקסל | `frontend/src/admin/Adder.tsx`, `frontend/src/admin/BulkImport.tsx` |
| חיבורים | ווידג'ט, מפתחות `API` ו-`webhooks` | `frontend/src/admin/Connections.tsx`, `frontend/src/admin/Webhooks.tsx` |

## עמודי מידע
| כתובת | מה | הקובץ |
|---|---|---|
| `/privacy` | מה נשמר, למה, ואצל מי. כולל קמפוס ההדגמה | `frontend/src/pages/PrivacyPage.tsx` |
| `/terms` | תנאי שימוש | `frontend/src/pages/TermsPage.tsx` |
| `/accessibility` | הצהרת נגישות | `frontend/src/pages/AccessibilityPage.tsx` |
| `/developers` | ה-`API` למוסדות, בקצרה | `frontend/src/pages/DevelopersPage.tsx` |
| `/licenses` | רישיונות של הספריות | `frontend/src/pages/LicensesPage.tsx` |
| `/unsubscribe` | הסרה ממיילים, בקישור חתום | `frontend/src/pages/UnsubscribePage.tsx` |
