// "I'm studying here" (share/SharePage.tsx).

// "בספרייה", but "ב-M206": Hebrew joins the letter, anything else takes a hyphen.
export function inPlace(name: string): string {
  return /^[\u0590-\u05FF]/.test(name) ? `ב${name}` : `ב-${name}`
}
