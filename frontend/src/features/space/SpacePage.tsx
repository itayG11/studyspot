// One place: its picture grows out of the card that was clicked (the
// browser's View Transitions, named per place), then the facts, today's
// timeline, the seat map in a lab, and booking. On a wide screen booking
// sits beside the page; on a phone a button at the thumb opens a sheet.

import { ArrowRight, KeyRound, Star, Users, Volume1 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { getPlace } from '../../api/campus'
import type { Booking, PlaceDetail, Seat } from '../../api/types'
import { SeatGrid } from '../../components/SeatGrid'
import { REFRESH_INTERVAL_MS } from '../../config'
import { useApi } from '../../hooks/useApi'
import { useFavorites } from '../../hooks/useFavorites'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { AMENITY_LABELS, ATMOSPHERE_LABELS, floorLabel, KIND_LABELS, SUITED_LABELS } from '../../i18n/labels'
import { useInstitution } from '../../institution'
import { spaceStatus } from '../../logic/availability'
import { KIND_PHOTO } from '../../media/photos'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { Badge, Button, ButtonLink, ErrorState, LoadingRegion, Photo, Sheet, Skeleton, TALL_QUERY } from '../../ui'
import { BookingForm } from '../booking/BookingForm'
import { AMENITY_ICONS } from '../finder/amenityIcons'
import { AvailabilityTimeline } from './AvailabilityTimeline'
import { PlaceForecast } from './Forecast'
import { Timetable } from './Timetable'
import { artTransitionName } from './transition'
import { backToFinder } from './backLink'
import styles from './space.module.css'

export function SpacePage() {
  const { slug } = useInstitution()
  const { spaceId } = useParams()
  const id = Number(spaceId)
  const valid = Number.isInteger(id) && id > 0
  // An address like /spaces/abc is not sent to the server at all.
  const place = useApi(() => getPlace(id), valid ? `place-${id}` : null, REFRESH_INTERVAL_MS)

  if (!valid || place.error?.code === 'place_not_found') return <NotFoundPage />
  if (!place.data && place.error) return <ErrorState error={place.error} onRetry={place.reload} />
  if (!place.data) return <SpaceSkeleton id={id} />
  // An old link (/spaces/7), or one under another institution's address:
  // the same page at the place's own institution, whose hours and rules apply.
  if (place.data.institution_slug !== slug) {
    return <Navigate to={`/${place.data.institution_slug}/spaces/${id}`} replace />
  }
  return (
    <>
      {place.error && (
        <div className={styles.notice}>
          <ErrorState error={place.error} onRetry={place.reload} compact />
        </div>
      )}
      <SpaceView place={place.data} />
    </>
  )
}

function SpaceView({ place }: { place: PlaceDetail }) {
  const { slug, timezone, booking_rules: rules } = useInstitution()
  const { isFavorite, toggle } = useFavorites()
  const tall = useMediaQuery(TALL_QUERY)
  const [seatId, setSeatId] = useState<number | null>(null)
  const [sheet, setSheet] = useState(false)
  // On a phone the form (and its request for times) waits for the first
  // open of the sheet; after that it stays, so closing keeps the choices.
  const [sheetUsed, setSheetUsed] = useState(false)
  const back = backToFinder(useLocation().state, slug, place.building_code)
  const [booked, setBooked] = useState<Booking | null>(null)
  const seat: Seat | null = place.seats?.find((s) => s.id === seatId) ?? null
  const isLab = place.kind === 'computer_lab'
  const status = spaceStatus(place, timezone)
  const favorite = isFavorite(place.id)
  const canBook = place.bookable && (!isLab || seat !== null)
  const form = (
    <BookingForm key={seatId ?? 'room'} place={place} seat={seat} rules={rules} timeZone={timezone} booked={booked} onBooked={setBooked} />
  )

  return (
    <article className={styles.page}>
      <Link to={back} className={styles.back} viewTransition>
        <ArrowRight aria-hidden="true" /> חזרה לחיפוש
      </Link>

      <header className={styles.hero} style={{ viewTransitionName: artTransitionName(place.id) } as CSSProperties}>
        <Photo name={KIND_PHOTO[place.kind]} priority sizes="(max-width: 1200px) 100vw, 1200px" className={styles.heroPhoto} />
        <div className={styles.heroShade} />
        <div className={styles.heroText}>
          <span className={styles.kind}>{KIND_LABELS[place.kind]}</span>
          <h1 className={styles.title}>{place.name}</h1>
          <p className={styles.meta}>
            בניין {place.building_code} · {floorLabel(place.floor)}
            {place.location_note && ` · ${place.location_note}`}
          </p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <button
          type="button"
          className={styles.star}
          aria-pressed={favorite}
          aria-label={`מועדף: ${place.name}`}
          onClick={() => toggle(place.id)}
        >
          <Star aria-hidden="true" className={favorite ? styles.starOn : undefined} />
        </button>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="facts">
            <h2 id="facts" className={styles.h2}>
              מה יש כאן
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>
                  <Users aria-hidden="true" /> מקום ל
                </dt>
                <dd>
                  {place.capacity} {place.kind === 'computer_lab' ? 'תאים' : place.kind === 'group_room' ? 'אנשים' : 'מקומות'}
                </dd>
              </div>
              <div>
                <dt>
                  <Volume1 aria-hidden="true" /> אווירה
                </dt>
                <dd>{ATMOSPHERE_LABELS[place.atmosphere]}</dd>
              </div>
              <div>
                <dt>מתאים</dt>
                <dd>{SUITED_LABELS[place.suited_for]}</dd>
              </div>
            </dl>
            <ul className={styles.amenities} aria-label="ציוד">
              {place.amenities.map((amenity) => {
                const Icon = AMENITY_ICONS[amenity]
                return (
                  <li key={amenity}>
                    <Icon aria-hidden="true" /> {AMENITY_LABELS[amenity]}
                  </li>
                )
              })}
            </ul>
            {place.details_are_demo && <p className={styles.demo}>הציוד והאווירה הם נתוני דמו, ולא נבדקו במקום.</p>}
          </section>

          <section className={styles.card} aria-labelledby="today">
            <h2 id="today" className={styles.h2}>
              היום{seat && ` · תא ${seat.label}`}
            </h2>
            {isLab && !seat ? (
              <p className={styles.muted}>בחר תא במפה למטה, ותראה מתי הוא פנוי היום.</p>
            ) : (
              <AvailabilityTimeline place={place} seatId={seat?.id ?? null} rules={rules} timeZone={timezone} bookedId={booked?.id ?? null} />
            )}
          </section>
          {!place.bookable && tall && <WalkIn place={place} />}
          <PlaceForecast place={place} timeZone={timezone} />

          {place.seats && place.lab_rows && place.lab_cols && (
            <section className={styles.card} aria-labelledby="seats">
              <h2 id="seats" className={styles.h2}>
                מפת התאים
              </h2>
              <p className={styles.muted}>כדי להזמין מראש, בחר תא.</p>
              <SeatGrid
                seats={place.seats}
                rows={place.lab_rows}
                cols={place.lab_cols}
                placeOpen={place.is_open}
                timeZone={timezone}
                canSelect={() => true}
                selectedId={seatId}
                onSelect={(s) => {
                  setSeatId(s.id === seatId ? null : s.id)
                  setBooked(null)
                }}
              />
            </section>
          )}

          <section className={styles.card}>
            <Timetable place={place} timeZone={timezone} />
          </section>
        </div>

        {!place.bookable && !tall && <WalkIn place={place} className={styles.aside} />}
        {place.bookable && !tall && (
          <aside className={styles.aside} aria-labelledby="book">
            <h2 id="book" className={styles.h2}>
              הזמנה מראש
            </h2>
            {canBook ? form : <p className={styles.muted}>בחר תא במפת התאים, ואז זמן.</p>}
          </aside>
        )}
      </div>

      {place.bookable && tall && (
        <>
          <div className={styles.bookBar}>
            <Button size="lg" block disabled={!canBook} onClick={() => {
                setSheet(true)
                setSheetUsed(true)
              }}>
              {canBook ? (seat ? `להזמין את תא ${seat.label}` : 'להזמין') : 'בחר תא כדי להזמין'}
            </Button>
          </div>
          <Sheet open={sheet} onClose={() => setSheet(false)} title={`הזמנה · ${place.name}${seat ? `, תא ${seat.label}` : ''}`}>
            {sheetUsed && canBook && form}
          </Sheet>
        </>
      )}
    </article>
  )
}

function SpaceSkeleton({ id }: { id: number }) {
  return (
    <LoadingRegion label="טוען את המקום…">
      <div className={styles.page}>
        <div className={styles.hero} style={{ viewTransitionName: artTransitionName(id) } as CSSProperties}>
          <Skeleton height="100%" radius="0" />
        </div>
        <div className={styles.card}>
          <Skeleton width="30%" height="1.4em" />
          <Skeleton width="80%" />
          <Skeleton width="60%" />
        </div>
      </div>
    </LoadingRegion>
  )
}

// Open areas and libraries are not booked ahead: no numbered chairs, so
// whoever comes first sits. Said plainly where the booking panel would be,
// with what is free now and the three steps to get in.
function WalkIn({ place, className = styles.card }: { place: PlaceDetail; className?: string }) {
  return (
    <section className={className} aria-labelledby="walk-in">
      <h2 id="walk-in" className={styles.h2}>
        בלי הזמנה מראש
      </h2>
      <p className={styles.walkInNow}>
        {place.is_open ? `${place.available} מתוך ${place.capacity} מקומות פנויים עכשיו` : 'סגור עכשיו'}
      </p>
      <ol className={styles.walkInSteps}>
        <li>מגיעים למקום.</li>
        <li>סורקים את הקוד שעל השלט, במצלמה של הטלפון.</li>
        <li>לוחצים "אני כאן", והמקום שלך.</li>
      </ol>
      <p className={styles.muted}>אין כאן כיסאות ממוספרים, ולכן לא מזמינים מראש: מי שמגיע ראשון יושב.</p>
      <ButtonLink to="/scan" variant="secondary" icon={<KeyRound aria-hidden="true" />}>
        יש לי קוד להקליד
      </ButtonLink>
    </section>
  )
}
