import { MapPinOff } from 'lucide-react'
import { useInstitution } from '../institution'
import { ButtonLink, EmptyState } from '../ui'

export function NotFoundPage() {
  const { slug } = useInstitution() // back to the search of the institution being viewed
  return (
    <EmptyState icon={<MapPinOff />} title="הדף לא נמצא" action={<ButtonLink to={`/${slug}`}>לחיפוש מקום</ButtonLink>}>
      אולי הקישור ישן, או שהמקום כבר לא קיים.
    </EmptyState>
  )
}
