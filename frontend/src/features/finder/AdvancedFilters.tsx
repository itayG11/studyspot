// The expanded filters: building, group size and equipment, behind one
// button so the quick chips stay the first thing on the page. Opening it is
// a reveal from the top (clip-path and opacity, no layout animation); with
// "reduce motion" it only fades. Every choice is in the address, like the
// chips, so a shared link opens with the same panel and results.

import { AnimatePresence, m, useReducedMotionConfig } from 'motion/react'
import { SlidersHorizontal } from 'lucide-react'
import type { Building } from '../../api/types'
import { ENTER, EXIT } from '../../design/motion'
import { AMENITIES, AMENITY_LABELS } from '../../i18n/labels'
import { advancedCount, PEOPLE_OPTIONS, toggleAmenity, type Filters } from '../../logic/filters'
import { Chip } from '../../ui'
import styles from './finder.module.css'

interface AdvancedFiltersProps {
  open: boolean
  onToggle: () => void
  filters: Filters
  buildings: Building[] | null
  update: (next: Filters) => void
}

export function AdvancedFiltersButton({ open, onToggle, filters }: Pick<AdvancedFiltersProps, 'open' | 'onToggle' | 'filters'>) {
  const count = advancedCount(filters)
  return (
    <button type="button" className={styles.moreToggle} aria-expanded={open} aria-controls="advanced-filters" onClick={onToggle}>
      <SlidersHorizontal aria-hidden="true" />
      סינון מורחב
      {count > 0 && (
        <span className={styles.moreCount} aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  )
}

export function AdvancedFilters({ open, filters, buildings, update }: Omit<AdvancedFiltersProps, 'onToggle'>) {
  const reduce = useReducedMotionConfig()
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }
  const shown = reduce ? { opacity: 1 } : { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          id="advanced-filters"
          role="group"
          aria-label="סינון מורחב"
          className={styles.advanced}
          initial={hidden}
          animate={shown}
          exit={{ ...hidden, transition: EXIT }}
          transition={ENTER}
        >
          <label className={styles.field}>
            <span>בניין</span>
            <select value={filters.building ?? ''} onChange={(e) => update({ ...filters, building: e.target.value || null })}>
              <option value="">כל הבניינים</option>
              {/* A link to a building not on the list (renamed, removed): shown, so the empty list has a reason. */}
              {filters.building && !(buildings ?? []).some((b) => b.code === filters.building) && (
                <option value={filters.building}>בניין {filters.building}</option>
              )}
              {(buildings ?? []).map((b) => (
                <option key={b.code} value={b.code}>
                  בניין {b.code}
                  {b.name ? ` · ${b.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>כמה אנשים</span>
            <select
              value={filters.people ?? ''}
              onChange={(e) => update({ ...filters, people: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">לא משנה</option>
              {PEOPLE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  לפחות {n}
                </option>
              ))}
            </select>
          </label>
          <fieldset className={styles.amenityField}>
            <legend>ציוד</legend>
            <div className={styles.amenityChips}>
              {AMENITIES.map((amenity) => (
                <Chip key={amenity} selected={filters.amenities.includes(amenity)} onClick={() => update(toggleAmenity(filters, amenity))}>
                  {AMENITY_LABELS[amenity]}
                </Chip>
              ))}
            </div>
          </fieldset>
        </m.div>
      )}
    </AnimatePresence>
  )
}
