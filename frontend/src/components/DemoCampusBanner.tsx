// For a real person whose account landed in the demo campus: a Google
// account of no institution joins it (app/accounts.py). There anyone may
// sign in as its admin, and it starts over each day (app/campus_admin.py),
// so they should know where they are. The shared demo users know already:
// they pressed "sign in as a demo student". The privacy page says more.

import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useInstitution } from '../institution'
import styles from './Layout.module.css'

export function DemoCampusBanner() {
  const { user } = useAuth()
  const here = useInstitution()
  if (!user || user.is_demo || user.institution_slug !== here.slug || !here.live_simulated) return null
  return (
    <div className={styles.visitingBanner} role="note" aria-label="קמפוס ההדגמה">
      <strong>זה קמפוס ההדגמה.</strong> כל אחד יכול לנסות בו גם את דף הניהול, וכל יום הוא חוזר להתחלה. החשבון שלך,
      וההזמנות למקומות הקבועים, נשמרים. <Link to="/privacy">מה זה אומר</Link>
    </div>
  )
}
