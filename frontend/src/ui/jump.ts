// Scroll to a section of the page and give it the focus (ui/JumpTo).

export function jumpTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}
