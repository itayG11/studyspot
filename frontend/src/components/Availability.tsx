export function OpenBadge({ isOpen }: { isOpen: boolean }) {
  return <span className={isOpen ? 'badge badge-open' : 'badge badge-closed'}>{isOpen ? 'פתוח עכשיו' : 'סגור עכשיו'}</span>
}
