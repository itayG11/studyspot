// "Quick: where to study now?": two questions in a sheet, and up to three
// places free right now, each with the reasons it was picked. For the
// student between two classes with the phone in hand (logic/quick.ts).

import { Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Place } from '../../api/types'
import { useInstitution } from '../../institution'
import { quickPicks, type Need, type Who } from '../../logic/quick'
import { Segmented, Sheet } from '../../ui'
import styles from './finder.module.css'

export function QuickFinder({ places }: { places: Place[] | null }) {
  const { slug } = useInstitution()
  const [open, setOpen] = useState(false)
  const [who, setWho] = useState<Who>('solo')
  const [need, setNeed] = useState<Need>('quiet')
  const picks = places ? quickPicks(places, { who, need }) : []
  return (
    <>
      <button type="button" className={styles.quickButton} onClick={() => setOpen(true)} disabled={!places}>
        <Zap aria-hidden="true" />
        מהיר: איפה ללמוד עכשיו?
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="איפה ללמוד עכשיו?">
        <div className={styles.quickQuestions}>
          <Segmented
            label="לבד או בקבוצה"
            value={who}
            onChange={setWho}
            options={[
              { value: 'solo', label: 'לבד' },
              { value: 'group', label: 'קבוצה' },
            ]}
          />
          <Segmented
            label="מה צריך"
            value={need}
            onChange={setNeed}
            options={[
              { value: 'quiet', label: 'שקט' },
              { value: 'talk', label: 'לדבר' },
              { value: 'computer', label: 'מחשב' },
            ]}
          />
        </div>
        {/* A screen reader hears the new answer when a choice changes it. */}
        <div aria-live="polite">
          {picks.length === 0 ? (
            <p className={styles.quickEmpty}>אין עכשיו מקום פנוי שמתאים לשתי התשובות.</p>
          ) : (
            <ol className={styles.quickList} aria-label="הצעות">
              {picks.map(({ place, reasons }) => (
                <li key={place.id} className={styles.quickPick}>
                  <Link to={`/${slug}/spaces/${place.id}`} className={styles.quickName} onClick={() => setOpen(false)}>
                    {place.name}
                  </Link>
                  <span className={styles.quickWhere}>בניין {place.building_code}</span>
                  <span className={styles.quickWhy}>{reasons.join(' · ')}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Sheet>
    </>
  )
}
