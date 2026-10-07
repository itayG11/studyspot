// The printed check-in code: "p<place>.v<version>.<signature>".
//
// Only the server can tell whether a code is genuine (it holds the signing
// key). The site reads the place number just to show which place the code
// belongs to before the student confirms.

const CODE = /^p([1-9][0-9]{0,9})\.v[1-9][0-9]{0,5}\.[A-Za-z0-9_-]{43}$/

export function cleanCode(text: string): string {
  return text.trim()
}

export function placeIdFromCode(text: string): number | null {
  const match = CODE.exec(cleanCode(text))
  return match ? Number(match[1]) : null
}

// The QR code on the sign holds this address, so the phone's own camera
// opens the site straight on the check-in page.
export function scanUrl(siteOrigin: string, code: string): string {
  return `${siteOrigin}/scan?c=${encodeURIComponent(code)}`
}
