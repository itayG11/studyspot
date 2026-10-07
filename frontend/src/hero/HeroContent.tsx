// The words on the home-page hero: the question, the live answer, and the
// two ways onward. Kept apart from the map backdrop so it can be tested.

import { Link } from 'react-router'
import { Count } from '../components/ui/Count'
import styles from './hero.module.css'

interface Props {
  freeNow: number
  openBuildings: number
  institutionName: string
  onToMap: () => void
}

export function HeroContent({ freeNow, openBuildings, institutionName, onToMap }: Props) {
  return (
    <div className={styles.content}>
      <p className={styles.kicker}>{institutionName} · עכשיו, בזמן אמת</p>
      <h1 className={styles.title}>
        <span>איפה יש</span>{' '}
        <span className={styles.titleAccent}>מקום עכשיו?</span>
      </h1>
      <p className={styles.answer}>
        <Count value={freeNow} className={styles.answerNumber} />
        <span>מקומות פנויים עכשיו ב-{openBuildings} בניינים</span>
      </p>
      <div className={styles.actions}>
        <button type="button" className="button" onClick={onToMap}>
          למפה החיה
        </button>
        <Link to="/places" className={`button ${styles.ghost}`} viewTransition>
          כל המקומות
        </Link>
      </div>
    </div>
  )
}
