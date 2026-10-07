// The home page story, told with illustrative photos (docs/IMAGES.md).
//
//   opening  0.00-0.24  the campus photo grows from a framed card to the
//                       whole screen, the headline parts, and a panel with
//                       the live number rises. The pin lands on the campus.
//   rooms    0.24-0.92  four kinds of places. Each photo rises from below
//                       over the one before it, which steps back and dims.
//                       A slow zoom inside each photo; the pin lands on the
//                       free seat; a label and one live number.
//
// The section is several screens tall and its stage stays pinned (sticky).
// Motion's useScroll gives the progress 0..1 and useTransform maps it to
// each element. Values go straight to style: React does not re-render while
// scrolling. Only transform, opacity and one clip-path (the opening) move.
// With "reduce motion" on, a still version shows the same content.

import {
  m,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotionConfig,
  useScroll,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from 'motion/react'
import { memo, useRef, useState, type CSSProperties } from 'react'
import type { Building, Place, PlaceKind } from '../../api/types'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { KIND_LABELS } from '../../i18n/labels'
import { Pin } from '../../illustrations/Pin'
import { KIND_PHOTO, PHOTOS, type PhotoName } from '../../media/photos'
import { Button, Photo, TALL_QUERY } from '../../ui'
import { kindLine } from './storyNumbers'
import styles from './story.module.css'

const ROOMS: { kind: PlaceKind; line: string }[] = [
  { kind: 'open_area', line: 'שולחן באור השמש, ואפשר לדבר.' },
  { kind: 'computer_lab', line: 'תא שקט עם מחשב, בלי לחפש בין הקומות.' },
  { kind: 'group_room', line: 'חדר לכל הצוות, מוזמן מראש.' },
  { kind: 'library', line: 'שקט של ספרייה, ליום ארוך של מבחנים.' },
]
const ROOMS_FROM = 0.24
const ROOM_SPAN = 0.17
const ENTER = 0.06 // how long a photo takes to rise over the one before it

interface StoryProps {
  buildings: Building[]
  places: Place[]
  onToFinder: () => void
}

// memo: the finder below changes the address on each keystroke, which
// draws the page again; the story only changes when its data does.
export const StoryScroller = memo(function StoryScroller(props: StoryProps) {
  // Follows MotionConfig (src/design/MotionProvider.tsx), which follows the device.
  const reduce = useReducedMotionConfig()
  return reduce ? <StillStory {...props} /> : <ScrollStory {...props} />
})

function ScrollStory({ buildings, places, onToFinder }: StoryProps) {
  const section = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] })
  const tall = useMediaQuery(TALL_QUERY)
  // One state change when the opening is covered, so its buttons stop
  // taking clicks and keyboard focus once nobody can see them.
  const [opening, setOpening] = useState(true)
  // The rooms' photos wait for the first scroll: on a phone their downloads
  // would share the slow connection with the opening photo, the largest
  // thing on the first screen. The first room rises only at ROOMS_FROM.
  const [roomsNear, setRoomsNear] = useState(false)
  useMotionValueEvent(p, 'change', (v) => {
    setOpening(v < ROOMS_FROM + ENTER)
    if (v > 0.02) setRoomsNear(true)
  })

  const freeNow = buildings.reduce((sum, b) => sum + b.available, 0)

  // The opening photo grows out of a framed card (an inset clip that opens).
  const [insetY, insetX, radius] = tall ? [14, 7, 22] : [17, 23, 28]
  const clipY = useTransform(p, [0, 0.12], [insetY, 0])
  const clipX = useTransform(p, [0, 0.12], [insetX, 0])
  const clipR = useTransform(p, [0, 0.12], [radius, 0])
  const heroClip = useMotionTemplate`inset(${clipY}% ${clipX}% ${clipY}% ${clipX}% round ${clipR}px)`
  const heroZoom = useTransform(p, [0, 0.24], [1.18, 1.02])
  const heroScale = useMotionTemplate`scale(${heroZoom})`
  // The headline parts as the photo opens: each half moves to its side.
  const part = useTransform(p, [0.02, 0.11], [0, tall ? 20 : 28])
  const partOpacity = useTransform(p, [0.05, 0.11], [1, 0])
  const rightHalf = useMotionTemplate`translateX(${part}vw)`
  const leftHalf = useMotionTemplate`translateX(calc(-1 * ${part}vw))`
  // Rises with the open photo, and leaves as the first room rises over it.
  const panelOpacity = useTransform(p, [0.11, 0.16, ROOMS_FROM, ROOMS_FROM + 0.03], [0, 1, 1, 0])
  const panelY = useTransform(p, [0.11, 0.16], [28, 0])
  const panel = useMotionTemplate`translateY(${panelY}px)`
  const heroBack = useStepBack(p, ROOMS_FROM)

  return (
    <section ref={section} className={styles.story} aria-label="סיפור: המקום שלך בקמפוס">
      <a href="#finder" className={styles.skip}>
        דלג לחיפוש
      </a>
      <div className={styles.stage}>
        <m.div className={styles.layer} style={{ transform: heroBack.transform }}>
          <m.div className={styles.clip} style={{ clipPath: heroClip }}>
            <Scene name="hero" zoom={heroScale} pinProgress={p} pinFrom={0.13} priority />
          </m.div>
          <m.div className={styles.dim} style={{ opacity: heroBack.dim }} />
        </m.div>

        <h1 className={styles.title}>
          <m.span style={{ transform: rightHalf, opacity: partOpacity }}>יש לך</m.span>{' '}
          <m.span style={{ transform: leftHalf, opacity: partOpacity }}>מקום בקמפוס.</m.span>
        </h1>

        <m.div className={styles.panel} style={{ opacity: panelOpacity, transform: panel }} inert={!opening}>
          <p className={styles.eyebrow}>{buildings.length} בניינים · מתעדכן כל 30 שניות</p>
          <p className={styles.bigLine}>
            <span className={styles.number}>{freeNow}</span> מקומות פנויים עכשיו
          </p>
          <Button size="lg" onClick={onToFinder}>
            לחיפוש מקום
          </Button>
        </m.div>

        {ROOMS.map((room, i) => (
          <Room key={room.kind} progress={p} index={i} kind={room.kind} line={room.line} places={places} near={roomsNear} />
        ))}

        <span className={styles.simLabel}>הדמיה</span>

        <div className={styles.stickyAction} inert={opening}>
          <Button variant="secondary" size="sm" onClick={onToFinder}>
            לחיפוש
          </Button>
        </div>
      </div>
    </section>
  )
}

// Once the next photo starts to rise, this one steps back and darkens.
function useStepBack(progress: MotionValue<number>, from: number) {
  const scale = useTransform(progress, [from, from + ENTER], [1, 0.92])
  const dim = useTransform(progress, [from, from + ENTER], [0, 0.55])
  return { transform: useMotionTemplate`scale(${scale})`, dim }
}

function Room({ progress, index, kind, line, places, near }: { progress: MotionValue<number>; index: number; kind: PlaceKind; line: string; places: Place[]; near: boolean }) {
  const from = ROOMS_FROM + index * ROOM_SPAN
  const rise = useTransform(progress, [from, from + ENTER], [100, 0])
  const back = useStepBack(progress, from + ROOM_SPAN)
  const layer = useMotionTemplate`translateY(${rise}%) ${back.transform}`
  const zoomValue = useTransform(progress, [from, from + ROOM_SPAN + ENTER], [1.12, 1])
  const zoom = useMotionTemplate`scale(${zoomValue})`
  const textOpacity = useTransform(progress, [from + 0.035, from + 0.08], [0, 1])
  const textY = useTransform(progress, [from + 0.035, from + 0.08], [24, 0])
  const text = useMotionTemplate`translateY(${textY}px)`
  const { count, text: unit } = kindLine(places, kind)

  return (
    // Above the opening's panel (z-index 6), each room above the one before.
    <m.div className={styles.layer} style={{ transform: layer, zIndex: 7 + index }}>
      <Scene name={KIND_PHOTO[kind]} zoom={zoom} pinProgress={progress} pinFrom={from + ENTER} load={near} />
      <div className={styles.shade} />
      <m.div className={styles.roomText} style={{ opacity: textOpacity, transform: text }}>
        <h2 className={styles.eyebrowLight}>{KIND_LABELS[kind]}</h2>
        <p className={styles.bigLine}>
          <span className={styles.number}>{count}</span> {unit}
        </p>
        <p className={styles.lineText}>{line}</p>
      </m.div>
      <m.div className={styles.dim} style={{ opacity: back.dim }} />
    </m.div>
  )
}

// A photo that covers the stage, in a box with the photo's own shape, so
// the pin can stand on a point of the picture (percentages of it) and
// zoom with it.
function Scene({ name, zoom, pinProgress, pinFrom, priority = false, load = true }: { name: PhotoName; zoom: MotionValue<string>; pinProgress: MotionValue<number>; pinFrom: number; priority?: boolean; load?: boolean }) {
  const { wide, tall } = PHOTOS[name].pin
  const spot = { '--wx': `${wide.x}%`, '--wy': `${wide.y}%`, '--tx': `${tall.x}%`, '--ty': `${tall.y}%` } as CSSProperties
  return (
    <m.div className={styles.cover} style={{ transform: zoom, ...spot } as MotionStyle}>
      {/* The "illustration" mark is on the stage, not here: this box is cropped. */}
      {load && <Photo name={name} priority={priority} label={false} className={styles.fill} />}
      <LandingPin progress={pinProgress} from={pinFrom} />
    </m.div>
  )
}

// "Your spot": drops onto the point and settles.
function LandingPin({ progress, from }: { progress: MotionValue<number>; from: number }) {
  const opacity = useTransform(progress, [from, from + 0.025], [0, 1])
  const drop = useTransform(progress, [from, from + 0.04], [-60, 0])
  const transform = useMotionTemplate`translateY(${drop}px)`
  return (
    <m.div className={styles.pin} style={{ opacity, transform }} aria-hidden="true">
      <Pin size={52} />
    </m.div>
  )
}

// "Reduce motion": the same story, still. The campus, then the four places.
function StillStory({ buildings, places, onToFinder }: StoryProps) {
  const freeNow = buildings.reduce((sum, b) => sum + b.available, 0)
  return (
    <section className={styles.still} aria-label="סיפור: המקום שלך בקמפוס">
      <div className={styles.stillHero}>
        <Photo name="hero" priority className={styles.fill} />
        <div className={styles.shade} />
        <div className={styles.stillHead}>
          <p className={styles.eyebrowLight}>{buildings.length} בניינים · מתעדכן כל 30 שניות</p>
          <h1 className={styles.stillTitle}>יש לך מקום בקמפוס.</h1>
          <p className={styles.bigLine}>
            <span className={styles.number}>{freeNow}</span> מקומות פנויים עכשיו
          </p>
          <Button size="lg" onClick={onToFinder}>
            לחיפוש מקום
          </Button>
        </div>
      </div>
      <ul className={styles.stillRooms}>
        {ROOMS.map(({ kind, line }) => {
          const { count, text } = kindLine(places, kind)
          return (
            <li key={kind}>
              <Photo name={KIND_PHOTO[kind]} variant="card" className={styles.stillPhoto} />
              <h2 className={styles.eyebrow}>{KIND_LABELS[kind]}</h2>
              <p className={styles.bigLineSmall}>
                <span className={styles.number}>{count}</span> {text}
              </p>
              <p className={styles.lineDark}>{line}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Before the live data arrives: the story's first frame, so nothing jumps
// when it appears. The photo starts loading at once.
export function StoryPlaceholder() {
  return (
    // As tall as the story that replaces it, so the finder below does not
    // move when the data arrives (no layout shift, also for a shared link
    // that opens straight on the finder).
    <section className={`${styles.story} ${styles.placeholder}`} aria-busy="true" aria-label="סיפור: המקום שלך בקמפוס">
      <div className={styles.stage}>
        <div className={styles.placeholderFrame}>
          <Photo name="hero" priority className={styles.fill} />
        </div>
        <h1 className={styles.title}>
          <span>יש לך</span> <span>מקום בקמפוס.</span>
        </h1>
      </div>
    </section>
  )
}
