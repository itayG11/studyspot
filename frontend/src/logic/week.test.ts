import { describe, expect, it } from 'vitest'
import type { ClassSlot } from '../api/types'
import { classPlace, courseTone, dayLayout, hourRange, pickedTime } from './week'

const slot = (id: number, weekday: number, starts: string, ends: string, title: string | null = null): ClassSlot => ({
  id, weekday, starts: `${starts}:00`, ends: `${ends}:00`, building_code: 'M', place_text: null, title,
})

describe('hourRange', () => {
  it('is 08:00 to 20:00, or wider for an early or late class', () => {
    expect(hourRange([])).toEqual({ from: 8, to: 20 })
    expect(hourRange([slot(1, 6, '07:30', '09:00'), slot(2, 0, '19:00', '21:10')])).toEqual({ from: 7, to: 22 })
  })
})

describe('dayLayout', () => {
  const range = { from: 8, to: 20 } // 720 minutes

  it('places each class by its times, in percent of the day shown', () => {
    const [block] = dayLayout([slot(1, 6, '08:30', '10:30')], range).blocks
    expect(block.top).toBeCloseTo((30 / 720) * 100)
    expect(block.height).toBeCloseTo((120 / 720) * 100)
  })

  it('a break of half an hour or more between two classes is a gap; a shorter one is not', () => {
    const { gaps } = dayLayout([slot(1, 6, '08:30', '10:30'), slot(2, 6, '10:50', '12:00'), slot(3, 6, '12:50', '14:00')], range)
    expect(gaps.map((g) => [g.starts, g.ends, g.minutes])).toEqual([['12:00', '12:50', 50]])
  })

  it('back-to-back classes leave no gap, and order does not matter', () => {
    const { blocks, gaps } = dayLayout([slot(2, 6, '10:30', '12:20'), slot(1, 6, '08:30', '10:30')], range)
    expect(blocks.map((b) => b.slot.id)).toEqual([1, 2])
    expect(gaps).toEqual([])
  })
})

describe('courseTone', () => {
  it('the same course always gets the same tone, one of six', () => {
    const a = courseTone(slot(1, 6, '08:30', '10:00', 'מבני נתונים'))
    expect(courseTone(slot(9, 2, '12:00', '13:00', 'מבני נתונים'))).toBe(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(6)
  })
})

describe('pickedTime', () => {
  it('a click on the day turns into the half hour it falls in', () => {
    expect(pickedTime(0.5, { from: 8, to: 20 })).toBe('14:00') // the middle of 08:00–20:00
    expect(pickedTime(0.52, { from: 8, to: 20 })).toBe('14:00')
    expect(pickedTime(0.99, { from: 8, to: 20 })).toBe('19:30')
  })
})

describe('classPlace', () => {
  it('is the building, or the place in the student\'s words', () => {
    expect(classPlace(slot(1, 6, '08:00', '09:00'))).toBe('M')
    expect(classPlace({ ...slot(1, 6, '08:00', '09:00'), building_code: null, place_text: 'אולם ספורט' })).toBe('אולם ספורט')
  })
})
