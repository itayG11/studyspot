// The occupancy widget, in the "Connections" tab (wave 14.4): the admin picks
// a building and a look, copies the iframe code into the institution's own
// site, and sees it live here first. The page is /embed/<slug> (src/embed/).

import { Copy } from 'lucide-react'
import { useState } from 'react'
import { getBuildings } from '../api/campus'
import { SITE_URL } from '../config'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { embedAddress, type Theme } from '../logic/embed'
import { Button, Segmented } from '../ui'
import styles from './admin.module.css'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'auto', label: 'לפי המכשיר' },
  { value: 'light', label: 'בהיר' },
  { value: 'dark', label: 'כהה' },
]

export function EmbedCode() {
  const { slug } = useInstitution()
  const buildings = useApi(() => getBuildings(slug), `buildings-${slug}`)
  const [building, setBuilding] = useState('')
  const [theme, setTheme] = useState<Theme>('auto')
  const [copied, setCopied] = useState(false)
  const address = embedAddress(SITE_URL, slug, building, theme)
  const code = `<iframe src="${address}" title="מקומות פנויים ללמידה" width="360" height="420" style="border:0" loading="lazy"></iframe>`

  return (
    <section className={styles.form} aria-labelledby="embed-title">
      <h2 id="embed-title" className={styles.formTitle}>
        וידג'ט לאתר של המוסד
      </h2>
      <p className={styles.screenNote}>
        תפוסה חיה, שמתעדכנת כל דקה, בתוך האתר של המוסד. רק קריאה, בלי כניסה ובלי מפתח. מדביקים את הקוד בדף.
      </p>
      <label className={styles.label} htmlFor="embed-building">
        בניין
      </label>
      <select
        id="embed-building"
        className={styles.field}
        value={building}
        onChange={(event) => {
          setBuilding(event.target.value)
          setCopied(false)
        }}
      >
        <option value="">כל הבניינים</option>
        {buildings.data?.map((b) => (
          <option key={b.id} value={b.code}>
            {b.name ? `${b.name}, ${b.code}` : b.code}
          </option>
        ))}
      </select>
      <Segmented
        label="מראה"
        options={THEMES}
        value={theme}
        onChange={(next) => {
          setTheme(next)
          setCopied(false)
        }}
      />
      <code className={styles.screenAddress}>{code}</code>
      <Button
        size="sm"
        variant="secondary"
        icon={<Copy aria-hidden="true" />}
        onClick={() =>
          void navigator.clipboard.writeText(code).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? 'הועתק' : 'להעתיק את הקוד'}
      </Button>
      <iframe className={styles.embedPreview} src={address} title="תצוגה מקדימה של הווידג'ט" loading="lazy" />
    </section>
  )
}
