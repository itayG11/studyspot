// A QR code as an image address, made in the browser by the qrcode
// library: the code never goes to an outside service. SVG keeps it sharp
// when the sign is printed large.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function useQrImage(text: string): string | null {
  const [image, setImage] = useState<{ text: string; src: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }).then((svg) => {
      if (!cancelled) setImage({ text, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` })
    })
    return () => {
      cancelled = true
    }
  }, [text])
  return image?.text === text ? image.src : null
}
