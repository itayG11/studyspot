// A living style guide: every building block in every state, on one page.
// Only in development (`npm run dev`, address /design); not in the built site.

import { Monitor, Plug, Search, Sun, Users, Volume1 } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../api/client'
import { Badge, Button, Chip, EmptyState, ErrorState, LoadingRegion, SearchField, Sheet, Skeleton, useToast } from '../ui'
import styles from './Showcase.module.css'

const SWATCHES = [
  ['--stone-0', 'משטח מורם'],
  ['--stone-1', 'דף'],
  ['--stone-2', 'משטח שקוע'],
  ['--ink', 'דיו'],
  ['--ink-2', 'טקסט משני'],
  ['--free', 'פנוי'],
  ['--busy', 'מתמלא'],
  ['--full', 'מלא'],
  ['--accent', 'הדגשה'],
  ['--light-sun', 'שמש'],
  ['--light-screen', 'מסכים'],
  ['--light-lamp', 'מנורה'],
] as const

export function Showcase() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Set<string>>(new Set(['free']))
  const [sheet, setSheet] = useState(false)
  const toast = useToast()
  const toggle = (key: string) =>
    setFilters((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>מערכת העיצוב</p>
        <h1 className={styles.hero}>יש לך מקום בקמפוס.</h1>
        <p className={styles.lead}>אור יום בגליל: אבן לבנה, דיו כחול-לילה, צללים רכים וארוכים.</p>
      </header>

      <section>
        <h2 className={styles.h2}>צבעים</h2>
        <ul className={styles.swatches}>
          {SWATCHES.map(([token, name]) => (
            <li key={token}>
              <span className={styles.swatch} style={{ background: `var(${token})` }} />
              <span>{name}</span>
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.h2}>טיפוגרפיה</h2>
        <p className={styles.display}>ספרייה מרכזית</p>
        <p className={styles.number}>
          312 <span>מקומות פנויים עכשיו</span>
        </p>
        <p>טקסט רץ ב-IBM Plex Sans Hebrew, קריא גם בגודל קטן ובטלפון.</p>
      </section>

      <section className={styles.row}>
        <h2 className={styles.h2}>כפתורים</h2>
        <Button>להזמין</Button>
        <Button variant="secondary">פרטים</Button>
        <Button variant="ghost">ביטול</Button>
        <Button variant="danger">ביטול ההזמנה</Button>
        <Button busy>שומר</Button>
        <Button disabled>לא זמין</Button>
        <Button size="sm" variant="secondary">
          קטן
        </Button>
        <Button size="lg">גדול</Button>
      </section>

      <section className={styles.stack}>
        <h2 className={styles.h2}>חיפוש וסינון</h2>
        <SearchField label="חיפוש מקום" value={query} onChange={setQuery} placeholder="חפש מקום, בניין או ציוד" />
        <div className={styles.row}>
          <Chip selected={filters.has('free')} onClick={() => toggle('free')} count={6}>
            פנוי עכשיו
          </Chip>
          <Chip selected={filters.has('quiet')} onClick={() => toggle('quiet')} icon={<Volume1 aria-hidden="true" />}>
            שקט
          </Chip>
          <Chip selected={filters.has('group')} onClick={() => toggle('group')} icon={<Users aria-hidden="true" />}>
            לקבוצה
          </Chip>
          <Chip selected={filters.has('pc')} onClick={() => toggle('pc')} icon={<Monitor aria-hidden="true" />}>
            עם מחשבים
          </Chip>
          <Chip selected={filters.has('plug')} onClick={() => toggle('plug')} icon={<Plug aria-hidden="true" />}>
            שקעים
          </Chip>
          <Chip selected={filters.has('sun')} onClick={() => toggle('sun')} icon={<Sun aria-hidden="true" />}>
            אור יום
          </Chip>
        </div>
      </section>

      <section className={styles.row}>
        <h2 className={styles.h2}>תפוסה</h2>
        <Badge tone="free">פנוי · 38 מתוך 50</Badge>
        <Badge tone="filling">מתמלא</Badge>
        <Badge tone="full">מלא</Badge>
        <Badge tone="closed">סגור</Badge>
      </section>

      <section className={styles.row}>
        <h2 className={styles.h2}>גיליון והודעות</h2>
        <Button variant="secondary" onClick={() => setSheet(true)}>
          פתיחת גיליון
        </Button>
        <Button variant="secondary" onClick={() => toast('ההזמנה נשמרה', 'success')}>
          הודעת הצלחה
        </Button>
        <Button variant="secondary" onClick={() => toast('השעה נתפסה בינתיים', 'error')}>
          הודעת שגיאה
        </Button>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="הזמנת חדר EM107">
          <p>יום רביעי, 13:30 עד 15:00.</p>
          <Button block onClick={() => setSheet(false)}>
            אישור ההזמנה
          </Button>
        </Sheet>
      </section>

      <section>
        <h2 className={styles.h2}>טעינה</h2>
        <LoadingRegion>
          <div className={styles.cards}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.card}>
                <Skeleton height="120px" radius="var(--r-md)" />
                <Skeleton width="60%" height="1.2em" />
                <Skeleton width="40%" />
              </div>
            ))}
          </div>
        </LoadingRegion>
      </section>

      <section className={styles.cards}>
        <EmptyState
          icon={<Search />}
          title="אין מקום שמתאים לכל הסינונים"
          action={<Button variant="secondary">ניקוי הסינון</Button>}
        >
          נסה להסיר את "שקט" או את "פנוי עכשיו".
        </EmptyState>
        <ErrorState error={new ApiError(0, 'network_error')} onRetry={() => {}} />
        <ErrorState error={new ApiError(500, 'unknown_error')} onRetry={() => {}} compact />
      </section>
    </div>
  )
}
