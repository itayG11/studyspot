// The home-page hero: "landing on the campus".
//
// The section is taller than the window. While it scrolls, its inner frame
// stays pinned (position: sticky) and useScrollProgress writes 0..1 into
// --progress. hero.module.css turns that number into motion: the aerial
// photo zooms in and brightens, the headline lifts away, and the building
// signs appear one after another.

import { useRef } from 'react'
import type { Building } from '../api/types'
import { useScrollProgress } from '../hooks/useScrollProgress'
import { useInstitution } from '../institution'
import { AERIAL } from '../map/tiles'
import { HeroBackdrop } from './HeroBackdrop'
import { HeroContent } from './HeroContent'
import styles from './hero.module.css'

interface Props {
  buildings: Building[]
  onToMap: () => void
}

export function HomeHero({ buildings, onToMap }: Props) {
  const section = useRef<HTMLElement>(null)
  useScrollProgress(section)
  const institution = useInstitution()

  const freeNow = buildings.reduce((sum, b) => sum + b.available, 0)
  const openBuildings = buildings.filter((b) => b.capacity > 0).length

  return (
    <section ref={section} className={styles.hero} aria-label="פתיחה">
      <div className={styles.stage}>
        <HeroBackdrop buildings={buildings} />
        <div className={styles.shade} />
        <div className={styles.gridLines} />
        <HeroContent
          freeNow={freeNow}
          openBuildings={openBuildings}
          institutionName={institution.name}
          onToMap={onToMap}
        />
        <p className={styles.cue} aria-hidden="true">
          גלול כדי לנחות על הקמפוס
        </p>
        <p className={styles.landing} aria-hidden="true">
          {buildings.length} בניינים · {freeNow} מקומות פנויים · המפה החיה למטה
        </p>
        <p className={styles.credit} dir="ltr">
          {AERIAL.credit}
        </p>
      </div>
    </section>
  )
}
