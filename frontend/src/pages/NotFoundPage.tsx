import { MapPinOff } from 'lucide-react'
import { ButtonLink, EmptyState } from '../ui'

export function NotFoundPage() {
  return (
    <EmptyState icon={<MapPinOff />} title="הדף לא נמצא" action={<ButtonLink to="/">לחיפוש מקום</ButtonLink>}>
      אולי הקישור ישן, או שהמקום כבר לא קיים.
    </EmptyState>
  )
}
