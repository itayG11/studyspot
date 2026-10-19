// What the site is built from, and under which license: the fonts, the
// icons, the map, and the libraries it runs on (versions in package.json
// and pyproject.toml).

import styles from './pages.module.css'

const PARTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'גופנים',
    items: [['Frank Ruhl Libre', 'OFL-1.1'], ['IBM Plex Sans Hebrew', 'OFL-1.1'], ['IBM Plex Mono', 'OFL-1.1']],
  },
  { group: 'סמלים', items: [['Lucide', 'ISC']] },
  {
    group: 'מפה',
    items: [['Leaflet', 'BSD-2-Clause'], ['React Leaflet', 'Hippocratic-2.1'], ['OpenStreetMap, נתוני המפה', 'ODbL'], ['OpenRouteService, זמני הליכה', 'תנאי השימוש של HeiGIT']],
  },
  {
    group: 'האתר',
    items: [['React', 'MIT'], ['React Router', 'MIT'], ['Motion', 'MIT'], ['qrcode', 'MIT']],
  },
  {
    group: 'השרת',
    items: [
      ['FastAPI', 'MIT'], ['Uvicorn', 'BSD-3-Clause'], ['SQLAlchemy', 'MIT'], ['Alembic', 'MIT'],
      ['psycopg', 'LGPL-3.0'], ['PostgreSQL', 'PostgreSQL License'], ['pydantic-settings', 'MIT'], ['PyJWT', 'MIT'],
      ['HTTPX', 'BSD-3-Clause'], ['openpyxl', 'MIT'], ['defusedxml', 'PSF'], ['Anthropic SDK', 'MIT'],
      ['http-ece', 'MIT'], ['py-vapid', 'MPL-2.0'], ['argon2-cffi', 'MIT'],
      ['רשימת הסיסמאות הנפוצות, SecLists', 'MIT'],
    ],
  },
]

export function LicensesPage() {
  return (
    <article className={styles.privacy}>
      <h1>רישיונות</h1>
      <p>האתר בנוי על קוד פתוח. תודה לכל מי שכתב אותו. אלה החלקים העיקריים, והרישיון של כל אחד:</p>
      {PARTS.map(({ group, items }) => (
        <section key={group}>
          <h2>{group}</h2>
          <ul>
            {items.map(([name, license]) => (
              <li key={name}>
                <bdi>{name}</bdi>: <bdi>{license}</bdi>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p>התמונות באתר הן הדמיות שנוצרו בבינה מלאכותית, ולא צילומים של מקום אמיתי.</p>
    </article>
  )
}
