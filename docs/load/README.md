# בדיקת עומס מקומית

**רק על שרת מקומי, לא על האתר החי.** האתר החי שירות חינמי, ובדיקה כזו תאט אותו לאנשים אמיתיים ותפעיל התראות.

## הרצה
מתוך `backend`, עם אותם משתני סביבה כמו בבדיקות (`DATABASE_URL`, `JWT_SECRET`, `CHECKIN_CODE_SECRET`), מסד מקומי עם `alembic upgrade head` ו-`python -m app.seed`:

```bash
TRUSTED_PROXY_HOPS=1 DEMO_LOGIN_ENABLED=true FRONTEND_URL=http://localhost:5174 \
  python -m uvicorn app.main:app --port 8002 --log-level warning &
python ../docs/load/make_users.py 200 > /tmp/tokens.json
python ../docs/load/loadtest.py --base http://localhost:8002 --tokens /tmp/tokens.json \
  --levels 10,50,100,200 --ramp 10 --seconds 20
```

- `make_users.py` יוצר סטודנטים זמניים במסד המקומי, ומדפיס אסימוני גישה (תקפים דקות ספורות).
- `loadtest.py` מריץ מבקרים וירטואליים: כל אחד סטודנט אחר, עם כתובת משלו, שרשרת מסכי החיפוש, המקום, הזמינות והתחזית. בסוף: מרוץ הזמנות על אותו חדר, ובדיקת מגבלת קצב לכתובת אחת.
- הסקריפט מסרב לרוץ מול כתובת שמכילה `getstudyspot`.
