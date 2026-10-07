// The signs to print and hang at each place: the place's name and a QR code
// that opens /scan on the site. Revoking a code (for example after a photo
// of the sign was shared) makes every printed copy useless.

import { useState } from 'react'
import { getCodes, revokeCode } from '../api/admin'
import type { PlaceCode } from '../api/types'
import { ConfirmButton } from '../components/ConfirmButton'
import { LoadError } from '../components/LoadError'
import { BuildingTile } from '../components/ui/BuildingTile'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { scanUrl } from '../logic/codes'
import styles from './admin.module.css'
import { useQrImage } from './useQrImage'

export function Signs() {
  const codes = useApi(getCodes, 'admin-codes')
  // Codes replaced on this visit, by place, shown instead of the old ones.
  const [replaced, setReplaced] = useState<Record<number, PlaceCode>>({})

  if (codes.error) return <LoadError error={codes.error} onRetry={codes.reload} />
  if (!codes.data) return <p className="page-message">טוען…</p>

  return (
    <>
      <div className={styles.toolbar}>
        <p className="hint">
          שלט אחד לכל מקום. בהדפסה כל שלט יוצא בעמוד משלו.
        </p>
        <button type="button" className="button" onClick={() => window.print()}>
          להדפיס את כל השלטים
        </button>
      </div>
      <ul className={styles.signs}>
        {codes.data.map((original) => {
          const code = replaced[original.place_id] ?? original
          return (
            <Sign
              key={original.place_id}
              code={code}
              fresh={code !== original}
              onReplaced={(next) => setReplaced((all) => ({ ...all, [next.place_id]: next }))}
            />
          )
        })}
      </ul>
    </>
  )
}

function Sign({ code, fresh, onReplaced }: { code: PlaceCode; fresh: boolean; onReplaced: (next: PlaceCode) => void }) {
  const qr = useQrImage(scanUrl(window.location.origin, code.code))
  const action = useAction()
  const name = `${code.place_name}, בניין ${code.building_code}`

  return (
    <li className={fresh ? `${styles.sign} ${styles.fresh}` : styles.sign} aria-label={name}>
      <div className={styles.signHead}>
        <BuildingTile code={code.building_code} level="low" />
        <h2 className={styles.signName}>{code.place_name}</h2>
      </div>
      {qr ? <img className={styles.qr} src={qr} alt={`קוד QR לכניסה ל${code.place_name}`} /> : <div className={styles.qr} />}
      <p className={styles.signCall}>סרקו כדי להיכנס</p>
      <span className={styles.signBrand}>StudySpot · בניין {code.building_code}</span>
      {fresh && <span role="status">קוד חדש. השלט הישן כבר לא עובד, צריך להדפיס את זה.</span>}
      <div className={styles.signActions}>
        <ConfirmButton
          label="לבטל את הקוד"
          confirmLabel="כן, קוד חדש"
          disabled={action.busy}
          onConfirm={() =>
            void action.run(async () => {
              onReplaced(await revokeCode(code.place_id))
            })
          }
        />
      </div>
      {action.error && <p className="error" role="alert">{action.error}</p>}
    </li>
  )
}
