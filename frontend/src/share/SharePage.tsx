// What a friend sees when they open an "I'm studying here" link: where, and
// until when. Once the stay is over the server answers 404 and this page
// says the link has ended (backend app/shares.py). The address after /s/ is
// the signed link itself; the chat preview comes from the server (app/site.py).

import { Clock, MapPin, MapPinOff } from 'lucide-react'
import { useParams } from 'react-router'
import { getShare } from '../api/share'
import { useApi } from '../hooks/useApi'
import { inPlace } from '../logic/share'
import { formatTime } from '../logic/time'
import { ButtonLink, EmptyState, ErrorState, PageLoading } from '../ui'
import styles from './share.module.css'

export function SharePage() {
  const { token = '' } = useParams()
  const state = useApi(() => getShare(token), `share-${token}`, 60_000)

  if (state.error?.status === 404 || (!state.data && state.error?.status === 422)) {
    return (
      <EmptyState icon={<MapPinOff />} title="הקישור כבר לא פעיל" action={<ButtonLink to="/">לחיפוש מקום</ButtonLink>}>
        השהות הזו הסתיימה. אפשר לראות מה פנוי עכשיו בקמפוס.
      </EmptyState>
    )
  }
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />
  if (!state.data) return <PageLoading />

  const stay = state.data
  const who = stay.name ?? 'מישהו ששלח לך את הקישור'
  const until = formatTime(stay.until, stay.timezone)
  const building = stay.building_name ? `${stay.building_name}, ${stay.building_code}` : stay.building_code
  return (
    <section className={styles.card} aria-labelledby="share-title">
      <p className={styles.who}>{who}</p>
      <h1 id="share-title" className={styles.title}>
        {stay.here_now ? 'לומד/ת עכשיו ' : 'ילמד/תלמד '}
        {inPlace(stay.place_name)}
      </h1>
      <ul className={styles.facts}>
        <li>
          <MapPin aria-hidden="true" /> בניין {building}
        </li>
        <li>
          <Clock aria-hidden="true" />
          <span className={styles.num}>
            {stay.here_now ? `עד ${until}` : `מ-${formatTime(stay.starts_at, stay.timezone)} עד ${until}`}
          </span>
        </li>
      </ul>
      <ButtonLink to={`/${stay.slug}/spaces/${stay.place_id}`}>לדף המקום, עם הדרך לשם</ButtonLink>
      <p className={styles.note}>הקישור יפסיק לעבוד לבד, כשהשהות תיגמר.</p>
    </section>
  )
}
