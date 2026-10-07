// The home page story: one pin, "your spot", travels through the campus.
//
//   opening   0.00-0.18  the campus model, the headline and the live number
//   dive      0.18-0.35  the camera zooms in on the building under the pin
//   rooms     0.35-0.85  four kinds of places, each in its own light
//   landing   0.85-1.00  the pin drops towards the search below
//
// The section is several screens tall and its stage stays pinned (sticky)
// while it scrolls. Motion's useScroll gives the progress 0..1, and
// useTransform maps it to each element's transform and opacity. These are
// written straight to the element's style: React does not re-render while
// scrolling. With "reduce motion" on, a still version is shown instead.

import { m, useMotionTemplate, useMotionValueEvent, useReducedMotionConfig, useScroll, useTransform, type MotionStyle, type MotionValue } from 'motion/react'
import { useRef, useState } from 'react'
import type { Building, Place, PlaceKind } from '../../api/types'
import { KIND_LABELS } from '../../i18n/labels'
import { campusGeometry } from '../../illustrations/campus'
import { CampusModel } from '../../illustrations/CampusModel'
import { Pin } from '../../illustrations/Pin'
import { SpaceScene } from '../../illustrations/SpaceScene'
import { Button } from '../../ui'
import { kindLine, pinBuilding } from './storyNumbers'
import styles from './story.module.css'

const ROOMS: { kind: PlaceKind; light: string; line: string }[] = [
  { kind: 'open_area', light: 'var(--light-sun)', line: 'שולחן ליד החלון, ואפשר לדבר.' },
  { kind: 'computer_lab', light: 'var(--light-screen)', line: 'תא שקט עם מחשב, בלי לחפש בין הקומות.' },
  { kind: 'group_room', light: 'var(--light-lamp)', line: 'חדר לכל הצוות, מוזמן מראש.' },
  { kind: 'library', light: 'var(--light-paper)', line: 'שקט של ספרייה, ליום ארוך של מבחנים.' },
]
const ROOMS_FROM = 0.35
const ROOM_SPAN = 0.125
const LANDING_FROM = 0.85

interface StoryProps {
  buildings: Building[]
  places: Place[]
  onToFinder: () => void
}

export function StoryScroller(props: StoryProps) {
  // Follows MotionConfig (src/design/MotionProvider.tsx), which follows the device.
  const reduce = useReducedMotionConfig()
  return reduce ? <StillStory {...props} /> : <ScrollStory {...props} />
}

function ScrollStory({ buildings, places, onToFinder }: StoryProps) {
  const section = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] })
  // One state change at each end of the opening, so the buttons there stop
  // taking clicks and focus once they have faded out.
  const [opening, setOpening] = useState(true)
  const [landing, setLanding] = useState(false)
  useMotionValueEvent(p, 'change', (v) => {
    setOpening(v < 0.15)
    setLanding(v >= LANDING_FROM)
  })

  const freeNow = buildings.reduce((sum, b) => sum + b.available, 0)
  const pinAt = pinBuilding(buildings)

  // The camera: zoom in on the pinned roof and bring it to the middle.
  const geometry = campusGeometry(buildings)
  const roof = geometry?.buildings.find((b) => b.code === pinAt)?.roof
  const origin = geometry && roof
    ? { x: ((roof[0] - geometry.bounds.x) / geometry.bounds.width) * 100, y: ((roof[1] - geometry.bounds.y) / geometry.bounds.height) * 100 }
    : { x: 50, y: 50 }
  const zoom = useTransform(p, [0.12, 0.33], [1, 3.2])
  const panX = useTransform(p, [0.12, 0.33], [0, 50 - origin.x])
  const panY = useTransform(p, [0.12, 0.33], [0, 50 - origin.y])
  const camera = useMotionTemplate`translate(${panX}%, ${panY}%) scale(${zoom})`
  const campusOpacity = useTransform(p, [0.29, 0.36], [1, 0])
  const ratio = geometry ? geometry.bounds.width / geometry.bounds.height : 1.4

  const headOpacity = useTransform(p, [0.06, 0.16], [1, 0])
  const headY = useTransform(p, [0.06, 0.16], [0, -48])
  const head = useMotionTemplate`translateY(${headY}px)`

  // The travelling pin, after the campus: centred where the camera left the
  // roof, bobbing over the rooms, then dropping down and shrinking.
  const pinOpacity = useTransform(p, [0.3, 0.34, 0.97, 1], [0, 1, 1, 0.9])
  const pinY = useTransform(p, [0.34, LANDING_FROM, 1], [0, 0, 38])
  const pinScale = useTransform(p, [LANDING_FROM, 1], [1, 0.55])
  const pinTransform = useMotionTemplate`translate(-50%, calc(-100% + ${pinY}vh)) scale(${pinScale})`

  const landingOpacity = useTransform(p, [0.88, 0.95], [0, 1])

  return (
    <section ref={section} className={styles.story} aria-label="סיפור: המקום שלך בקמפוס">
      <a href="#finder" className={styles.skip}>
        דלג לחיפוש
      </a>
      <div className={styles.stage}>
        <m.div className={styles.light} style={{ opacity: campusOpacity, background: 'linear-gradient(var(--sky), var(--stone-1) 75%)' }} />
        {ROOMS.map((room, i) => (
          <RoomLight key={room.kind} progress={p} index={i} color={room.light} />
        ))}

        <m.div className={styles.campus} style={{ opacity: campusOpacity }} aria-hidden={!opening}>
          <m.div
            className={styles.camera}
            style={{ transform: camera, transformOrigin: `${origin.x}% ${origin.y}%`, '--ratio': ratio } as MotionStyle}
          >
            <CampusModel buildings={buildings} pinAt={pinAt ?? undefined} />
          </m.div>
        </m.div>

        <m.div className={styles.opening} style={{ opacity: headOpacity, transform: head }} inert={!opening}>
          <p className={styles.eyebrow}>{buildings.length} בניינים · מתעדכן כל 30 שניות</p>
          <h1 className={styles.title}>יש לך מקום בקמפוס.</h1>
          <p className={styles.bigLine}>
            <span className={styles.number}>{freeNow}</span> מקומות פנויים עכשיו
          </p>
          <Button size="lg" onClick={onToFinder}>
            לחיפוש מקום
          </Button>
        </m.div>

        {ROOMS.map((room, i) => (
          <RoomChapter key={room.kind} progress={p} index={i} kind={room.kind} line={room.line} places={places} />
        ))}

        <m.div className={styles.pin} style={{ opacity: pinOpacity, transform: pinTransform }} aria-hidden="true">
          <Pin size={64} />
        </m.div>

        <m.p className={styles.landing} style={{ opacity: landingOpacity }} aria-hidden={!landing}>
          עכשיו בוחרים. החיפוש מחכה ממש כאן.
        </m.p>

        <div className={styles.stickyAction} inert={opening || landing}>
          <Button variant="secondary" size="sm" onClick={onToFinder}>
            לחיפוש
          </Button>
        </div>
      </div>
    </section>
  )
}

// A full-stage wash in a room's light, there only during its chapter.
function RoomLight({ progress, index, color }: { progress: MotionValue<number>; index: number; color: string }) {
  const opacity = useChapterOpacity(progress, index)
  return <m.div className={styles.light} style={{ opacity, background: `radial-gradient(120% 90% at 30% 40%, color-mix(in srgb, ${color} 55%, var(--stone-1)), var(--stone-1) 70%)` }} />
}

function RoomChapter({ progress, index, kind, line, places }: { progress: MotionValue<number>; index: number; kind: PlaceKind; line: string; places: Place[] }) {
  const from = ROOMS_FROM + index * ROOM_SPAN
  const to = from + ROOM_SPAN
  const opacity = useChapterOpacity(progress, index)
  // Depth: the whole scene drifts up slowly, its furniture a little faster.
  const drift = useTransform(progress, [from, to], [24, -24])
  const scale = useTransform(progress, [from, to], [0.96, 1.03])
  const sceneTransform = useMotionTemplate`translateY(${drift}px) scale(${scale})`
  const depth = useTransform(progress, [from, to], [10, -10])
  const textY = useTransform(progress, [from, to], [20, -20])
  const textTransform = useMotionTemplate`translateY(${textY}px)`
  const { count, text } = kindLine(places, kind)
  const [active, setActive] = useState(false)
  useMotionValueEvent(progress, 'change', (v) => setActive(v >= from && v < to))

  return (
    <div className={styles.chapter} aria-hidden={!active}>
      <m.div className={styles.scene} // A CSS variable for the furniture layer inside the scene (story.module.css).
        style={{ opacity, transform: sceneTransform, '--depth': depth } as MotionStyle}>
        <SpaceScene kind={kind} decorative />
      </m.div>
      <m.div className={styles.chapterText} style={{ opacity, transform: textTransform }}>
        <p className={styles.eyebrow}>{KIND_LABELS[kind]}</p>
        <p className={styles.bigLine}>
          <span className={styles.number}>{count}</span> {text}
        </p>
        <p className={styles.lineText}>{line}</p>
      </m.div>
    </div>
  )
}

function useChapterOpacity(progress: MotionValue<number>, index: number): MotionValue<number> {
  const from = ROOMS_FROM + index * ROOM_SPAN
  const to = from + ROOM_SPAN
  const fadeOut = index === ROOMS.length - 1 ? [to + 0.02, to + 0.06] : [to - 0.015, to + 0.015]
  return useTransform(progress, [from - 0.015, from + 0.015, fadeOut[0], fadeOut[1]], [0, 1, 1, 0])
}

// "Reduce motion": the same story, still. The campus, then the four rooms.
function StillStory({ buildings, places, onToFinder }: StoryProps) {
  const freeNow = buildings.reduce((sum, b) => sum + b.available, 0)
  return (
    <section className={styles.still} aria-label="סיפור: המקום שלך בקמפוס">
      <div className={styles.stillHead}>
        <p className={styles.eyebrow}>{buildings.length} בניינים · מתעדכן כל 30 שניות</p>
        <h1 className={styles.title}>יש לך מקום בקמפוס.</h1>
        <p className={styles.bigLine}>
          <span className={styles.number}>{freeNow}</span> מקומות פנויים עכשיו
        </p>
        <Button size="lg" onClick={onToFinder}>
          לחיפוש מקום
        </Button>
      </div>
      <div className={styles.stillCampus}>
        <CampusModel buildings={buildings} pinAt={pinBuilding(buildings) ?? undefined} />
      </div>
      <ul className={styles.stillRooms}>
        {ROOMS.map(({ kind, line }) => {
          const { count, text } = kindLine(places, kind)
          return (
            <li key={kind}>
              <SpaceScene kind={kind} decorative />
              <p className={styles.eyebrow}>{KIND_LABELS[kind]}</p>
              <p className={styles.bigLineSmall}>
                <span className={styles.number}>{count}</span> {text}
              </p>
              <p className={styles.lineText}>{line}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
