# 14. סרטוני `YouTube` להעמקה

- **מה זה:** סרטונים קצרים עד בינוניים שמסבירים את הנושאים של הפרויקט מקצה לקצה. כל נושא מקושר לפרק שבו הוא מופיע.
- **איך נבחרו:** חיפוש ביום 1.11.2026, לפי התאמה לנושא ולכותרת. **לא ראיתי את הסרטונים עצמם.**
- **מה לא אומת (חשוב):** מהסביבה שבה עבדתי לא הייתה גישה ל-`YouTube`, ולכן **לא אומתו מספר צפיות, ביקורות, שם הערוץ ותאריך העלאה.** את זה צריך לבדוק בעצמך לפני שמשקיעים זמן: להעדיף סרטון מ-2022 ואילך, עם הרבה צפיות ותגובות חיוביות. מה שהסרטון עצמו אומר בכותרת, נרשם כך.
- **איך לקרוא:** "מה לבדוק" אומר מה למצוא בסרטון כדי להתאים אותו לפרויקט.
- **אם הסרטון לא טוב:** בחירה אחרת מהרשימה בנושא, או חיפוש עם אותה כותרת ממוינת לפי צפיות.

## הזמנה כפולה ומקביליות (פרק 7)
| סרטון | קישור | מה לבדוק |
|---|---|---|
| How to Avoid Double Booking and Race Conditions in Online Web Applications | https://www.youtube.com/watch?v=_95dCYv2Xv4 | התאמה ישירה לבעיה שלי: איך הם מונעים הזמנה כפולה, והאם הפתרון בקוד או במסד |
| Exclusion operators - EXPLAINING PostgreSQL | https://www.youtube.com/watch?v=M58MR1vqnAk | הדוגמה בתיאור היא חדר שמוזמן פעמיים, כמו אצלי. זה בדיוק `EXCLUDE` |
| PostgreSQL Range Type. Learn how to Query and store range data | https://www.youtube.com/watch?v=a2R9Vqd4x6o | רקע לטווחי זמן, שעליהם אילוץ ה-`EXCLUDE` נבנה |
| Race Conditions Explained With An Example | https://www.youtube.com/watch?v=K1aoimUYTK8 | הסבר כללי על `race condition` לפני הפרויקט |

## תכנון מערכת הזמנות (פרק 4, ושאלות תכנון)
| סרטון | קישור | מה לבדוק |
|---|---|---|
| System Design Interview: Design Ticketmaster (Hello Interview) | https://www.youtube.com/watch?v=fhdPyoO6aXI | איך מראיין מצפה שתתכנן הזמנת מושבים. השווה: מה אני עושה אחרת |
| Design Ticketmaster: Seat Holds + Redis | https://www.youtube.com/watch?v=Klw5A71gav0 | "החזקת מושב" לזמן קצר. השווה לשחרור הזמנה שלא הגיעו אליה |
| Ticketmaster - System Design Interview Question | https://www.youtube.com/watch?v=_1AF8eZI0RA | גרסה נוספת, לצפייה השוואתית |

## כניסה ואבטחה (פרק 6, 13)
| סרטון | קישור | מה לבדוק |
|---|---|---|
| PKCE explained - Proof Key for Code Exchange for OAuth2 | https://www.youtube.com/watch?v=nzayiUAXMqc | מה `PKCE` מונע, בשפה פשוטה |
| OAuth 2.0 + PKCE Explained: Authentication, Tokens & Security | https://www.youtube.com/watch?v=gEIfV3ZSt-8 | זרימה שלמה כולל אסימונים. התאמה לכניסה עם גוגל |
| OAuth 2.0 Authorization Code Flow with PKCE: Complete Implementation Guide | https://www.youtube.com/watch?v=7JlIQ6Wwu4k | פירוט מימוש |
| What are JWT Access token & Refresh token and why we need them? | https://www.youtube.com/watch?v=ahDQI7msr0A | למה אסימון גישה קצר ואסימון חידוש נפרד |
| Why HttpOnly Cookies Are SAFER Than Local Storage! | https://www.youtube.com/watch?v=ROg1p0UZL0M | למה החידוש שלי בעוגייה `HttpOnly` |
| JWT Token Rotation and Refresh Tokens Securely | https://www.youtube.com/watch?v=uV3ntFQ9mus | חידוש אסימונים בצורה בטוחה |
| OWASP Top 10: Cross-Site Scripting (XSS) | https://www.youtube.com/watch?v=6ZiDyRgtMvA | מה זה `XSS`, ולמה `CSP` שלי מגבילה סקריפטים |
| Security: The Hacker's Guide to XSS Injection | https://www.youtube.com/watch?v=Rxr2XkGPIcI | דוגמאות להתקפה |

**לא נמצא ב-`YouTube`:** הסבר על הוכחת עבודה (`proof of work`) ועל `Content Security Policy`. לחיפוש בעצמך: "hashcash proof of work explained" ו-"Content Security Policy explained". קריאה במקום: מסמכי `MDN` על `CSP`.

## מגבלות קצב ועומס (פרק 8, 13)
| סרטון | קישור | מה לבדוק |
|---|---|---|
| System Design Interview: Rate Limiting Algorithms That Get You Hired | https://www.youtube.com/watch?v=cs_orOjuaPM | `Token Bucket`, `Leaky Bucket`, חלון קבוע וחלון נע |
| Rate Limiter: System Design Interview Question | https://www.youtube.com/watch?v=1kFS3FTceq4 | מגבלה מבוזרת, ושאלות המשך |
| How Rate Limiting Works | https://www.youtube.com/watch?v=oMWWlQfnMlQ | הסבר קצר לפני העומק |

## שרת: `FastAPI`, `SQLAlchemy`, בדיקות (פרקים 4, 8)
| סרטון | קישור | מה לבדוק |
|---|---|---|
| Building a REST API with FastAPI, Async SQLAlchemy, and PostgreSQL | https://www.youtube.com/watch?v=nC9ob8xM3AM | `SQLAlchemy 2` ו-`PostgreSQL`, כמו אצלי. לבדוק אם התאריך עדכני |
| Create A REST API with FastAPI, SQLAlchemy and PostgreSQL | https://m.youtube.com/watch?v=2g1ZjA6zHRo | בנייה צעד אחרי צעד, עם חלוקה לפרקים |
| Python FastAPI Tutorial (Part 17): Testing the API - Pytest, Fixtures, and Mocking | https://www.youtube.com/watch?v=SO7m7nod0ts | בדיקות לשרת עם `fixtures` |
| Overriding Dependencies During Testing FastAPI Application | https://www.youtube.com/watch?v=Qtn_mQeW7hc | איך מחליפים תלות (כמו מסד או שעה) בבדיקה |
| Efficient FastAPI testing with pytest, dependency injection and snapshots | https://www.youtube.com/watch?v=fLwJducgCmg | הרצאה מכנס. לפי התיאור: `PyCon Italia 2025` |

## אתר: `React` ובדיקות דפדפן (פרקים 3, 8)
| סרטון | קישור | מה לבדוק |
|---|---|---|
| ALL React Hooks Explained in 12 Minutes | https://www.youtube.com/watch?v=LOH1l-MP_9k | סקירה מהירה. לפי הרשומה: אפריל 2024 |
| useEffect React Hook Tutorial (2024) - What YOU need to know | https://www.youtube.com/watch?v=vpPkUr86IG8 | רק `useEffect`, שמבלבל מתחילים |
| Introduction to Playwright for End-to-End Testing with Debbie O'Brien | https://www.youtube.com/watch?v=lCb9JoZFpHI | פתיחה ל-`Playwright`, שבו אני משתמש |
| Awesome Web Testing with Playwright ft Andrew (Pandy) Knight | https://www.youtube.com/watch?v=OCGef6H09fI | איך `Playwright` משתלב בפירמידת הבדיקות |

## איך להשתמש בזה לפני ראיון
1. **לפני התרגול:** לצפות בסרטון אחד על `race condition` והזמנה כפולה, ובסרטון אחד על `PKCE`. אלה שני נושאים שמראיינים אוהבים.
2. **אחרי הסרטון:** לענות בקול על שאלה 7 ושאלה 13 מ-`13-mock-interview.md`, בלי להסתכל.
3. **לא לצפות בהכול.** עדיף שלושה סרטונים שהבנת מעשרה שרק ראית.
