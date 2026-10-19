// The password rules, shown ticking while the user types. The server checks
// the same rules, and also refuses common passwords (app/passwords.py): it
// has the final word, this only saves a round trip.

export const MIN_PASSWORD = 10
export const MAX_PASSWORD = 128

export interface PasswordRule {
  key: 'length' | 'upper' | 'lower' | 'digit' | 'symbol'
  label: string
  met: boolean
}

// \p{Lu} and \p{Ll}: upper and lower case in any script. Hebrew has no case,
// so its letters count as lower case, as on the server.
const UPPER = /\p{Lu}/u
const LOWER = /[\p{Ll}\p{Lo}]/u
const DIGIT = /\p{Nd}/u
const SYMBOL = /[^\p{L}\p{N}]/u

export function passwordRules(password: string): PasswordRule[] {
  const length = [...password].length
  return [
    { key: 'length', label: `לפחות ${MIN_PASSWORD} תווים`, met: length >= MIN_PASSWORD && length <= MAX_PASSWORD },
    { key: 'upper', label: 'אות גדולה באנגלית', met: UPPER.test(password) },
    { key: 'lower', label: 'אות קטנה', met: LOWER.test(password) },
    { key: 'digit', label: 'ספרה', met: DIGIT.test(password) },
    { key: 'symbol', label: 'סימן, למשל ! או -', met: SYMBOL.test(password) },
  ]
}

export function passwordReady(password: string): boolean {
  return passwordRules(password).every((rule) => rule.met)
}
