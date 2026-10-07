import styles from './PageLoading.module.css'

// A whole page that is still on its way: a few quiet lines, said once.
export function PageLoading({ label = 'טוען…' }: { label?: string }) {
  return (
    <p className={styles.loading} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </p>
  )
}
