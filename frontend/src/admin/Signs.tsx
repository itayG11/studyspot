// The signs to print and hang at each place: the place's name and a QR code
// that opens /scan on the site. Revoking a code (for example after a photo
// of the sign was shared) makes every printed copy useless.

import { useState } from 'react'
import { getCodes, revokeCode } from '../api/admin'
import type { PlaceCode } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { SITE_URL } from '../config'
import { scanUrl } from '../logic/codes'
import { Printer } from 'lucide-react'
import { Link } from 'react-router'
import { Button, ConfirmButton, ErrorState, Notice, PageLoading } from '../ui'
import styles from './admin.module.css'
import { ScreenControls } from './ScreenControls'
import { useQrImage } from './useQrImage'
import { useInstitution } from '../institution'

export function Signs() {
  const { slug } = useInstitution()
  const codes = useApi(() => getCodes(slug), `admin-codes-${slug}`)
  // Codes replaced on this visit, by place, shown instead of the old ones.
  const [replaced, setReplaced] = useState<Record<number, PlaceCode>>({})
  // A place switched to a screen or back (wave 13): the same code, not a fresh one.
  const [updated, setUpdated] = useState<Record<number, PlaceCode>>({})

  if (codes.error) return <ErrorState error={codes.error} onRetry={codes.reload} />
  if (!codes.data) return <PageLoading />
  if (codes.data.length === 0) {
    return (
      <Notice>
        השלטים נוצרים לבד: לכל מקום שמוסיפים יש שלט עם קוד משלו. עוד אין מקומות, אז מוסיפים אותם <Link to="?tab=adding">בלשונית "הוספה"</Link>, והשלטים
        יופיעו כאן.
      </Notice>
    )
  }

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.lead}>שלט אחד לכל מקום. בהדפסה כל שלט יוצא בעמוד משלו.</p>
        <Button icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
          להדפיס את כל השלטים
        </Button>
      </div>
      <ul className={styles.signs}>
        {codes.data.map((original) => {
          const fresh = replaced[original.place_id]
          const code = updated[original.place_id] ?? fresh ?? original
          return (
            <Sign
              key={original.place_id}
              code={code}
              fresh={fresh !== undefined}
              onReplaced={(next) => {
                setUpdated(({ [next.place_id]: _, ...rest }) => rest)
                setReplaced((all) => ({ ...all, [next.place_id]: next }))
              }}
              onUpdated={(next) => setUpdated((all) => ({ ...all, [next.place_id]: next }))}
            />
          )
        })}
      </ul>
    </>
  )
}

function Sign({
  code,
  fresh,
  onReplaced,
  onUpdated,
}: {
  code: PlaceCode
  fresh: boolean
  onReplaced: (next: PlaceCode) => void
  onUpdated: (next: PlaceCode) => void
}) {
  const onScreen = code.check_in_mode === 'screen'
  const qr = useQrImage(scanUrl(SITE_URL, code.code))
  const action = useAction()
  const name = `${code.place_name}, בניין ${code.building_code}`

  return (
    // A place on a screen has no sign to print: its printed code no longer works.
    <li className={[styles.sign, fresh && styles.fresh, onScreen && styles.onScreen].filter(Boolean).join(' ')} aria-label={name}>
      <div className={styles.signHead}>
        <span className={styles.building}>{code.building_code}</span>
        <h2 className={styles.signName}>{code.place_name}</h2>
      </div>
      {onScreen ? (
        <p className={styles.signCall}>נכנסים עם הקוד שעל המסך ליד הדלת</p>
      ) : (
        <>
          {qr ? <img className={styles.qr} src={qr} alt={`קוד QR לכניסה ל${code.place_name}`} /> : <div className={styles.qr} />}
          <p className={styles.signCall}>סרקו כדי להיכנס</p>
        </>
      )}
      <span className={styles.signBrand}>StudySpot · בניין {code.building_code}</span>
      {fresh && (
        <span role="status" className={`${styles.screenOnly} ${styles.freshNote}`}>
          {onScreen ? 'קוד חדש. המסך עובר אליו לבד, ואין מה להדפיס.' : 'קוד חדש. השלט הישן כבר לא עובד, צריך להדפיס את זה.'}
        </span>
      )}
      <div className={styles.signActions}>
        <ConfirmButton
          label="לבטל את הקוד"
          confirmLabel="כן, קוד חדש"
          size="sm"
          busy={action.busy}
          onConfirm={() =>
            void action.run(async () => {
              onReplaced(await revokeCode(code.place_id))
            })
          }
        />
      </div>
      {action.error && (
        <Notice tone="error" className={styles.screenOnly}>
          {action.error}
        </Notice>
      )}
      <ScreenControls code={code} onChanged={onUpdated} />
    </li>
  )
}
