import { photoSources, PHOTOS, type PhotoName } from '../media/photos'
import styles from './Photo.module.css'

// The breakpoint where pages switch to the tall (phone) picture.
export const TALL_QUERY = '(max-width: 760px)'

interface PhotoProps {
  name: PhotoName
  // scene: fills its box, wide on a computer and tall on a phone.
  // card: the small 3:2 crop.
  variant?: 'scene' | 'card'
  // Decorative next to text that already says it (a card): alt="".
  decorative?: boolean
  priority?: boolean // the first picture on the page: fetched first
  sizes?: string
  label?: boolean // the "illustration" mark
  className?: string
}

// One illustrative photo, in the smallest file the browser can use: AVIF
// where supported, WebP otherwise, at the width the screen needs.
export function Photo({ name, variant = 'scene', decorative = false, priority = false, sizes = '100vw', label = true, className }: PhotoProps) {
  const src = photoSources(name)
  const alt = decorative ? '' : PHOTOS[name].alt
  return (
    <div className={[styles.photo, className].filter(Boolean).join(' ')}>
      <picture>
        {variant === 'card' ? (
          <>
            <source type="image/avif" srcSet={src.card.avif} />
            <source type="image/webp" srcSet={src.card.webp} />
          </>
        ) : (
          <>
            <source media={TALL_QUERY} type="image/avif" srcSet={src.tall.avif} sizes={sizes} />
            <source media={TALL_QUERY} type="image/webp" srcSet={src.tall.webp} sizes={sizes} />
            <source type="image/avif" srcSet={src.wide.avif} sizes={sizes} />
            <source type="image/webp" srcSet={src.wide.webp} sizes={sizes} />
          </>
        )}
        <img
          className={styles.img}
          src={variant === 'card' ? src.card.webp : src.fallback}
          alt={alt}
          width={variant === 'card' ? 640 : 1600}
          height={variant === 'card' ? 427 : 900}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </picture>
      {label && (
        <span className={styles.label} aria-hidden={decorative || undefined}>
          הדמיה
        </span>
      )}
    </div>
  )
}
