// Setting up a new institution, in four steps: its details, who signs in,
// buildings and places, then signs and opening it to the public list.
// The server checks every change; on the shared demo campus it refuses them,
// and this tab only shows the steps.

import { useId, useState, type FormEvent } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { addLoginRule, getSetup, removeLoginRule, updateInstitution } from '../api/admin'
import type { LoginRule, Setup as SetupData } from '../api/types'
import { useAction } from '../hooks/useAction'
import { useApi, type ApiState } from '../hooks/useApi'
import { useInstitution } from '../institution'
import { Button, ErrorState, Notice, PageLoading } from '../ui'
import styles from './admin.module.css'

type Go = (tab: 'adding' | 'placing' | 'signs') => void

// The admin page loads the setup (it picks the first tab by it) and passes it.
// oxlint-disable-next-line react/only-export-components
export function useSetup(): ApiState<SetupData> {
  const { slug } = useInstitution()
  return useApi(() => getSetup(slug), `admin-setup-${slug}`)
}

export function Setup({ setup, onGo }: { setup: ApiState<SetupData>; onGo: Go }) {
  if (!setup.data && setup.error) return <ErrorState error={setup.error} onRetry={setup.reload} />
  if (!setup.data) return <PageLoading />
  const data = setup.data
  const steps = [
    { title: 'פרטי המוסד', done: data.name.trim() !== '' },
    { title: 'מי נכנס', done: data.rules.length > 0 },
    { title: 'בניינים ומקומות', done: data.located_buildings > 0 && data.places > 0 },
    { title: 'שלטים ופתיחה', done: data.is_active },
  ]
  return (
    <div className={styles.setup}>
      {data.locked && (
        <Notice>בקמפוס ההדגמה אי אפשר לשנות את פרטי המוסד ואת כללי הכניסה. כאן רואים את הצעדים, כמו שמוסד חדש רואה אותם.</Notice>
      )}
      <ol className={styles.steps} aria-label="צעדי ההקמה">
        {steps.map((step, index) => (
          <li key={step.title} className={styles.step}>
            {step.done ? <CheckCircle2 aria-hidden="true" className={styles.stepDone} /> : <Circle aria-hidden="true" />}
            <span>
              {index + 1}. {step.title}
            </span>
            {step.done && <span className={styles.doneTag}>גמור</span>}
          </li>
        ))}
      </ol>
      <DetailsStep data={data} onSaved={setup.reload} />
      <RulesStep data={data} onSaved={setup.reload} />
      <section className={styles.form} aria-labelledby="setup-campus">
        <h2 id="setup-campus" className={styles.formTitle}>
          3. בניינים ומקומות
        </h2>
        <p className={styles.lead}>
          {data.buildings} בניינים, {data.located_buildings} מהם על המפה, ו-{data.places} מקומות.
        </p>
        <div className={styles.toolbar}>
          <Button variant="secondary" size="sm" onClick={() => onGo('adding')}>
            להוספת בניינים ומקומות
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onGo('placing')}>
            למיקום בניינים על המפה
          </Button>
        </div>
      </section>
      <OpenStep data={data} onSaved={setup.reload} onGo={onGo} />
    </div>
  )
}

function DetailsStep({ data, onSaved }: { data: SetupData; onSaved: () => void }) {
  const id = useId()
  const [name, setName] = useState(data.name)
  const action = useAction()
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    if (await action.run(() => updateInstitution(data.slug, { name: name.trim() }))) {
      setSaved(true)
      onSaved()
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.formTitle}>
        1. פרטי המוסד
      </h2>
      <label className={styles.label} htmlFor={`${id}-name`}>
        שם המוסד, כפי שהסטודנטים רואים אותו
      </label>
      <input
        id={`${id}-name`}
        className={styles.field}
        required
        maxLength={200}
        disabled={data.locked}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <p className={styles.lead}>
        הכתובת באתר: <span dir="ltr">/{data.slug}</span>. אזור הזמן: <span dir="ltr">{data.timezone}</span>.
      </p>
      <Button type="submit" size="sm" busy={action.busy} disabled={data.locked}>
        שמירה
      </Button>
      <div role="status">{saved && <Notice tone="success">נשמר.</Notice>}</div>
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </form>
  )
}

function RulesStep({ data, onSaved }: { data: SetupData; onSaved: () => void }) {
  const id = useId()
  const [domain, setDomain] = useState('')
  const [tenant, setTenant] = useState('')
  const action = useAction()

  async function add(provider: LoginRule['provider'], value: string, clear: () => void) {
    if (await action.run(() => addLoginRule(data.slug, provider, value.trim()))) {
      clear()
      onSaved()
    }
  }

  async function remove(rule: LoginRule) {
    if (await action.run(() => removeLoginRule(rule.id))) onSaved()
  }

  const tenants = data.rules.filter((r) => r.provider === 'microsoft')
  return (
    <section className={styles.form} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.formTitle}>
        2. מי נכנס
      </h2>
      <p className={styles.lead}>
        סטודנט עם מייל בסיומת של המוסד מקבל קוד כניסה למייל. ארגון מיקרוסופט של המוסד מכניס את כל החשבונות שלו.
      </p>
      {data.rules.length > 0 && (
        <ul className={styles.rules} aria-label="כללי הכניסה">
          {data.rules.map((rule) => (
            <li key={rule.id}>
              <span>{rule.provider === 'email' ? 'סיומת מייל' : 'ארגון מיקרוסופט'}</span>{' '}
              <span dir="ltr">{rule.value}</span>{' '}
              <Button variant="ghost" size="sm" disabled={data.locked} onClick={() => void remove(rule)}>
                הסרה
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label className={styles.label} htmlFor={`${id}-domain`}>
        סיומת המייל של הסטודנטים
      </label>
      <input
        id={`${id}-domain`}
        className={styles.field}
        dir="ltr"
        placeholder="college.ac.il"
        maxLength={255}
        disabled={data.locked}
        value={domain}
        onChange={(event) => setDomain(event.target.value)}
      />
      <Button
        size="sm"
        disabled={data.locked || domain.trim() === ''}
        busy={action.busy}
        onClick={() => void add('email', domain, () => setDomain(''))}
      >
        הוספת סיומת
      </Button>
      <label className={styles.label} htmlFor={`${id}-tenant`}>
        מזהה הארגון של המוסד אצל מיקרוסופט, אם יש. מקבלים אותו ממנהל המחשוב
      </label>
      <input
        id={`${id}-tenant`}
        className={styles.field}
        dir="ltr"
        placeholder="00000000-0000-0000-0000-000000000000"
        maxLength={36}
        disabled={data.locked}
        value={tenant}
        onChange={(event) => setTenant(event.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={data.locked || tenant.trim() === ''}
        busy={action.busy}
        onClick={() => void add('microsoft', tenant, () => setTenant(''))}
      >
        הוספת ארגון מיקרוסופט
      </Button>
      {data.microsoft_client_id &&
        tenants.map((rule) => (
          <Notice key={rule.id}>
            מנהל המחשוב של המוסד צריך לאשר את האתר פעם אחת, בשם כל הארגון. העבר לו את{' '}
            <a
              href={`https://login.microsoftonline.com/${rule.value}/adminconsent?client_id=${data.microsoft_client_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              קישור האישור
            </a>
            .
          </Notice>
        ))}
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </section>
  )
}

function OpenStep({ data, onSaved, onGo }: { data: SetupData; onSaved: () => void; onGo: Go }) {
  const action = useAction()
  async function toggle() {
    if (await action.run(() => updateInstitution(data.slug, { is_active: !data.is_active }))) onSaved()
  }
  return (
    <section className={styles.form} aria-labelledby="setup-open">
      <h2 id="setup-open" className={styles.formTitle}>
        4. שלטים ופתיחה
      </h2>
      <p className={styles.lead}>
        מדפיסים את השלטים ותולים אותם. אחר כך מפעילים את המוסד, והוא מופיע ברשימת המוסדות באתר.
      </p>
      <div className={styles.toolbar}>
        <Button variant="secondary" size="sm" onClick={() => onGo('signs')}>
          לשלטים
        </Button>
        <Button size="sm" busy={action.busy} disabled={data.locked} onClick={() => void toggle()}>
          {data.is_active ? 'להסתיר את המוסד' : 'להפעיל את המוסד'}
        </Button>
      </div>
      <div role="status">
        {data.is_active && <Notice tone="success">המוסד פעיל, ומופיע ברשימת המוסדות.</Notice>}
      </div>
      {action.error && <Notice tone="error">{action.error}</Notice>}
    </section>
  )
}
