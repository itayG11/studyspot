// "Someone stayed after their time" (wave 19): what is switched on, when the
// reports come, and the open ones to close. The institution reads places and
// times here, never people: nothing on this screen names the student who
// reported or the one who stayed (backend/app/overstay.py).

import { useState } from 'react'
import { getHeat, getOverstay, getReports, resolveReport, saveOverstay } from '../api/admin'
import type { Advice, HeatCell, OverstayPolicy, OverstaySettings, ReportItem } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { formatDay, formatTime } from '../logic/time'
import { ActionError, Button, ErrorState, Notice, PageLoading, Segmented } from '../ui'
import styles from './admin.module.css'

const LEVELS: { value: OverstayPolicy; label: string; says: string }[] = [
  { value: 'none', label: 'כבוי', says: 'הכול כבוי: אין סימון "אולי עדיין תפוס", אין הפסקות, אין תזכורת סיום ואין דיווחים.' },
  {
    value: 'reminders',
    label: 'תזכורות',
    says: 'פעילים: סימון "אולי עדיין תפוס" אחרי שהזמן נגמר, "יוצא להפסקה" ותזכורת לפני הסיום. הדיווחים כבויים.',
  },
  {
    value: 'reports',
    label: 'תזכורות ודיווחים',
    says: 'הכול פעיל, וסטודנט שמצא את המקום תפוס יכול לדווח בלחיצה ולקבל מקום אחר. כאן רואים כמה דיווחים היו, איפה ומתי, בלי שם של אף אחד.',
  },
]

// Python's numbering: Monday is 0.
const DAYS = ['שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'ראשון']
const TOP_TIMES = 10

const hour = (h: number) => `${String(h).padStart(2, '0')}:00`

function adviceText(a: Advice): string {
  return a.kind === 'shorten_booking'
    ? 'אפשר לקצר את משך ההזמנה המרבי שלו, או להוסיף שלט "הזמן נגמר?" ליד הדלת.'
    : 'אפשר להוסיף שלט "הזמן נגמר?" במקום, או לשבץ מתנדב בשעות האלה.'
}

export function Overstay() {
  const { slug, timezone } = useInstitution()
  const settings = useApi(() => getOverstay(slug), `overstay-${slug}`)
  const reports = useApi(() => getReports(slug, 'open'), `overstay-open-${slug}`)
  const heat = useApi(() => getHeat(slug, 30), `overstay-heat-${slug}`)
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />
  if (!settings.data) return <PageLoading />
  const now = settings.data
  const reload = () => {
    settings.reload()
    reports.reload()
    heat.reload()
  }
  return (
    <div className={styles.setup}>
      <h2 className={styles.formTitle}>שוהים אחרי הזמן</h2>
      <p className={styles.lead}>
        מי שהזמן שלו נגמר לא תמיד קם, ואין לנו חיישן בכיסא. כאן בוחרים כמה מזה פעיל אצלכם, ורואים איפה ומתי זה קורה. מטפלים
        במקום, לא באדם: שום מסך כאן לא מציג שם.
      </p>
      <Settings data={now} onSaved={reload} />
      <Times cells={heat.data?.cells ?? null} days={heat.data?.days ?? 30} />
      <Advices advice={heat.data?.recommendations ?? []} />
      {now.policy === 'reports' ? (
        <Open items={reports.data} onChanged={reload} timezone={timezone} />
      ) : (
        <Notice>הדיווחים כבויים. כדי שסטודנטים יוכלו לדווח, בחרו "תזכורות ודיווחים".</Notice>
      )}
    </div>
  )
}

function Settings({ data, onSaved }: { data: OverstaySettings; onSaved: () => void }) {
  const { slug } = useInstitution()
  const action = useAction()
  const [grace, setGrace] = useState(String(data.grace_minutes))
  const [rest, setRest] = useState(String(data.break_minutes))
  const level = LEVELS.find((l) => l.value === data.policy) ?? LEVELS[1]
  return (
    <section className={styles.form} aria-labelledby="overstay-settings">
      <h3 id="overstay-settings" className={styles.formTitle}>
        מה פעיל
      </h3>
      {data.locked && <Notice>בקמפוס ההדגמה אי אפשר לשנות את ההגדרות. הדיווחים למטה הם דוגמה.</Notice>}
      <Segmented
        label="מה פעיל"
        value={data.policy}
        disabled={data.locked}
        options={LEVELS.map((l) => ({ value: l.value, label: l.label }))}
        onChange={(policy) => void action.run(async () => { await saveOverstay(slug, { policy }); onSaved() })}
      />
      <p className={styles.lead}>{level.says}</p>
      <form
        className={styles.inline}
        onSubmit={(event) => {
          event.preventDefault()
          void action.run(async () => {
            await saveOverstay(slug, { grace_minutes: Number(grace), break_minutes: Number(rest) })
            onSaved()
          })
        }}
      >
        <label className={styles.label}>
          דקות חסד (0 עד 15)
          <input className={styles.field} type="number" min={0} max={15} value={grace} disabled={data.locked} onChange={(e) => setGrace(e.target.value)} />
        </label>
        <label className={styles.label}>
          דקות הפסקה (0 עד 60)
          <input className={styles.field} type="number" min={0} max={60} value={rest} disabled={data.locked} onChange={(e) => setRest(e.target.value)} />
        </label>
        <Button type="submit" busy={action.busy} disabled={data.locked}>
          לשמור
        </Button>
      </form>
      <ActionError action={action} />
    </section>
  )
}

function Times({ cells, days }: { cells: HeatCell[] | null; days: number }) {
  if (cells === null) return null
  const top = [...cells].sort((a, b) => b.count - a.count || a.weekday - b.weekday || a.hour - b.hour).slice(0, TOP_TIMES)
  const most = top[0]?.count ?? 1
  return (
    <section className={styles.form} aria-labelledby="overstay-times">
      <h3 id="overstay-times" className={styles.formTitle}>
        מתי זה קורה
      </h3>
      {top.length === 0 ? (
        <p className={styles.lead}>אין עדיין דיווחים ב-{days} הימים האחרונים.</p>
      ) : (
        <table className={styles.table} aria-label="הזמנים עם הכי הרבה דיווחים">
          <thead>
            <tr>
              <th scope="col">מקום</th>
              <th scope="col">יום</th>
              <th scope="col">שעה</th>
              <th scope="col">דיווחים</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c) => (
              <tr key={`${c.place_id}-${c.weekday}-${c.hour}`}>
                <th scope="row">{c.place_name}</th>
                <td>{DAYS[c.weekday]}</td>
                <td>{hour(c.hour)}</td>
                <td>
                  <span className={styles.bar} style={{ inlineSize: `${Math.max(8, (c.count / most) * 100)}%` }} aria-hidden="true" />
                  <span className={styles.count}>{c.count}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Advices({ advice }: { advice: Advice[] }) {
  if (advice.length === 0) return null
  return (
    <section className={styles.form} aria-labelledby="overstay-advice">
      <h3 id="overstay-advice" className={styles.formTitle}>
        מה אפשר לעשות
      </h3>
      <ul aria-label="מה אפשר לעשות" className={styles.list}>
        {advice.map((a) => (
          <li key={a.place_id}>
            {a.place_name}: {a.count} דיווחים בשבוע. {adviceText(a)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Open({ items, onChanged, timezone }: { items: ReportItem[] | null; onChanged: () => void; timezone: string }) {
  const action = useAction()
  if (items === null) return null
  return (
    <section className={styles.form} aria-labelledby="overstay-open">
      <h3 id="overstay-open" className={styles.formTitle}>
        דיווחים פתוחים
      </h3>
      {items.length === 0 ? (
        <p className={styles.lead}>אין דיווחים פתוחים.</p>
      ) : (
        <ul aria-label="דיווחים פתוחים" className={styles.list}>
          {items.map((r) => (
            <li key={r.id} className={styles.reportRow}>
              <span>
                {r.place_name}
                {r.seat_label && `, תא ${r.seat_label}`} · בניין {r.building_code} · {formatDay(r.created_at, timezone)}{' '}
                {formatTime(r.created_at, timezone)}
              </span>
              <span className={styles.inline}>
                <Button size="sm" busy={action.busy} onClick={() => void action.run(async () => { await resolveReport(r.id, 'handled'); onChanged() })}>
                  טופל
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  busy={action.busy}
                  onClick={() => void action.run(async () => { await resolveReport(r.id, 'nobody_there'); onChanged() })}
                >
                  לא היה אף אחד
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ActionError action={action} />
    </section>
  )
}
