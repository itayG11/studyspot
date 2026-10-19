// For an institution's developers (wave 14.2): how to read the institution's
// places and live occupancy with its key. The full description, generated
// from the server's code, is in /api/v1/openapi.json (backend app/api/v1.py).

import { apiAddress } from '../logic/apiUrl'
import styles from './pages.module.css'

const ENDPOINTS: [string, string][] = [
  ['GET /v1/institution', 'המוסד: שם, אזור זמן, וכמה בניינים ומקומות יש בו'],
  ['GET /v1/buildings', 'הבניינים, המיקום שלהם, וכמה פנוי בהם עכשיו'],
  ['GET /v1/places', 'המקומות, עם תפוסה חיה, ואם הם פתוחים. אפשר לסנן לפי בניין או סוג'],
  ['GET /v1/places/{id}', 'מקום אחד'],
  ['GET /v1/places/{id}/forecast', 'צפי עומס ליום בשבוע, ברבעי שעה, ומה היה היום עד עכשיו'],
]

export function DevelopersPage() {
  const api = apiAddress()
  return (
    <article className={styles.privacy}>
      <h1>למפתחים: ה-API של StudySpot</h1>
      <p>
        מוסד יכול לקרוא את הבניינים, המקומות והתפוסה החיה שלו, ולהציג אותם במערכות שלו: באתר המוסד, במסך בלובי, או
        באפליקציה. רק קריאה, ובלי שום מידע אישי: לא שמות, ולא מי נמצא איפה.
      </p>

      <h2>מפתח</h2>
      <p>
        מנהל המוסד יוצר מפתח בדף הניהול, בלשונית "חיבורים". המפתח מוצג פעם אחת. הוא פותח רק את המוסד שלו, ואפשר לבטל
        אותו בכל רגע. שולחים אותו בכל בקשה, בכותרת:
      </p>
      <pre className={styles.code} dir="ltr">
        Authorization: Bearer ss_live_...
      </pre>

      <h2>דוגמה</h2>
      <pre className={styles.code} dir="ltr">{`curl -H "Authorization: Bearer $STUDYSPOT_KEY" \\
  "${api}/v1/places?building=L"`}</pre>

      <h2>הנקודות</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">מה מקבלים</th>
            <th scope="col">כתובת</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map(([path, what]) => (
            <tr key={path}>
              <td>{what}</td>
              <td dir="ltr">
                <code>{path}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>כללים</h2>
      <ul>
        <li>
          <strong>גרסה:</strong> הכול תחת <code dir="ltr">/v1</code>. תשובה של גרסה 1 רק מקבלת שדות חדשים, ואף פעם לא
          מאבדת שדה. שינוי שובר יהיה <code dir="ltr">/v2</code>.
        </li>
        <li>
          <strong>מגבלה:</strong> 120 בקשות בדקה לכל מפתח. מעבר לזה התשובה היא 429, עם הכותרת{' '}
          <code dir="ltr">Retry-After</code>.
        </li>
        <li>
          <strong>שעות:</strong> שעה ביום, כמו בצפי, היא בשעון המקומי של המוסד. רגע מסוים, כמו "פנוי מ", כולל אזור זמן.
        </li>
        <li>
          <strong>שגיאות:</strong> בלי מפתח, או עם מפתח שבוטל: 401. מקום של מוסד אחר: 404, כמו מקום שלא קיים.
        </li>
      </ul>

      <h2>התיאור המלא</h2>
      <p>
        התיאור בפורמט OpenAPI, שנוצר מהקוד של השרת:{' '}
        <a href={`${api}/v1/openapi.json`} dir="ltr">
          /api/v1/openapi.json
        </a>
        . אפשר לפתוח אותו בכלים כמו Swagger Editor או Postman.
      </p>
    </article>
  )
}
