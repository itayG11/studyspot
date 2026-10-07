# התמונות באתר

## מאיפה הן הגיעו
- **כל התמונות באתר הן הדמיות.** הן נוצרו בבינה מלאכותית, ב-`ChatGPT`, לפי ההנחיה שבסוף הקובץ.
- **הן לא צילומים של בראודה.** האתר מסמן כל אחת מהן במילה "הדמיה".
- **המיקומים האמיתיים של הבניינים** מופיעים רק במפה שבחיפוש.
- **תאריך היצירה:** 7 באוקטובר 2026.
- **תנאי השימוש, נבדק ב-7 באוקטובר 2026 מתוך חיפוש:**
  - לפי תנאי `OpenAI`, התמונות שייכות למי שיצר אותן, ומותר להשתמש בהן גם באתר ציבורי.
  - אסור להציג אותן כאילו אדם צילם או צייר. לכן כל תמונה מסומנת "הדמיה".
  - את דף התנאים עצמו לא פתחתי. הפירוט ב-`docs/DEPLOY.md`.

## למה הדמיות ולא צילומים
- **אין לנו צילומים שמותר להשתמש בהם.** תמונות מגוגל ומאתרי חדשות מוגנות בזכויות יוצרים.
- **האיורים הקודמים נראו כמו משחק,** ולא כמו מקום אמיתי.
- **הדמיה מסומנת לא מטעה:** כתוב עליה שהיא הדמיה, והיא לא מציגה עובדות על הקמפוס.

## הקבצים
התמונות נמצאות ב-`frontend/public/images/`. כל תמונה שמורה בשני פורמטים:

| פורמט | למה |
|---|---|
| `AVIF` | הכי קטן. כל הדפדפנים החדשים תומכים בו |
| `WebP` | גיבוי לדפדפן ישן יותר |

| קובץ | רוחבים | שימוש |
|---|---|---|
| `{name}-800`, `{name}-1600` | 800 ו-1600 | מחשב, יחס 16:9 |
| `{name}-mobile-600`, `{name}-mobile-940` | 600 ו-940 | טלפון, יחס 9:16 |
| `{name}-card-640` | 640 | כרטיס בחיפוש, חיתוך ביחס 3:2 מצד שמאל של תמונת המחשב |

**השמות:** `hero`, `open-area`, `computer-lab`, `group-room`, `library`.

**איך כווצו:** עם `ffmpeg`. ל-`AVIF` המקודד הוא `libaom-av1`, ול-`WebP` המקודד הוא `libwebp`.

**הקבצים המקוריים** לא נשמרים בגיט, כי הם גדולים. מהם הופקו כל הגדלים.

## ההנחיה ששימשה ליצירה
```text
I am building a website that helps college students find a free place to study on campus.
Please create 10 photorealistic images for it. They will replace cartoon illustrations,
so they must look like real professional photographs, not 3D renders, not cartoons,
not isometric, not low-poly.

GLOBAL STYLE (apply to every image)
- Real architectural / interior photography, shot on a full-frame camera, 24-35mm lens.
- Setting: a modern college in northern Israel (Galilee). White and light-beige stone,
  glass, light wood, green Mediterranean hills and olive trees visible where there are windows.
- Light: soft, natural, late-morning or late-afternoon. Calm, premium, optimistic mood.
- Colour grade: natural and warm, slightly soft. No heavy filters, no HDR look.
- All 10 images must feel like one photo series: same season, same style, same light quality.
- NO people at all. NO logos, NO signs, NO readable text anywhere (screens show soft blurred
  content only). NO watermarks.
- This is an invented, illustrative campus. Do not copy any real college's buildings or branding.

COMPOSITION RULES (very important, text will be placed on top of the images)
- Wide images (16:9): keep the main subject in the LEFT 55% of the frame.
  The RIGHT 40% must be calm and simple (wall, sky, soft shadow) so white Hebrew text can sit there.
- Tall images (9:16): keep the main subject in the TOP 60%.
  The BOTTOM 35% must be calm and simple so text can sit there.
- In every room image (images 3-10), include ONE clearly visible empty seat or free desk,
  near the centre of the subject area, as if it is waiting for the viewer. A map pin
  will be placed on it later, so keep it unobstructed.
- Leave a little empty margin on all edges (nothing important touching the frame).

THE IMAGES
1. hero-desktop (16:9): Drone photo, high angle, of a modern college campus on a gentle
   green hillside in the Galilee. Several 2-4 storey buildings of white stone and glass
   connected by paths, lawns and olive trees, hills fading into soft haze behind.
   Morning light, long soft shadows.
2. hero-mobile (9:16): The same campus and the same light, framed vertically,
   buildings in the top part, calm lawn and paths at the bottom.
3. open-area-desktop (16:9): A bright open study atrium with a double-height glass wall,
   sunlight falling across the floor. Long wooden tables and a few bright red chairs as the
   only strong colour accent. Plants. Feeling: social, sunny, you may talk here.
4. open-area-mobile (9:16): The same space, vertical framing.
5. computer-lab-desktop (16:9): A calm computer lab. Rows of light oak desks with slim
   monitors glowing soft blue, dark ergonomic chairs neatly pushed in, one chair pulled out
   at a free station. Cooler light from the screens mixed with daylight from a side window.
6. computer-lab-mobile (9:16): The same lab, vertical framing.
7. group-room-desktop (16:9): A small glass-walled group study room for 6-8 people.
   One large wooden table, chairs around it, a clean whiteboard on the wall (no writing),
   a wall screen that is switched off, a warm pendant lamp glowing above the table.
   Cosy, focused team atmosphere.
8. group-room-mobile (9:16): The same room, vertical framing.
9. library-desktop (16:9): A quiet modern library reading hall. Tall wooden bookshelves,
   soft daylight through a large window, a reading table with a small warm desk lamp,
   one empty chair. Feeling: silent, deep focus, exam season.
10. library-mobile (9:16): The same library, vertical framing.

OUTPUT
- Highest resolution available, at least 2400 px on the long side.
- PNG or high-quality JPG.
- Name each file exactly as above, for example: hero-desktop.png, library-mobile.png.
```
