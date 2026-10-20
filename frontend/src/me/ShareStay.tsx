// "I'm studying here": a button that makes a link to this stay and opens the
// phone's share menu (WhatsApp, Telegram...). The link stops working by itself
// when the stay ends (backend app/shares.py). The name is off unless chosen.

import { Share2 } from 'lucide-react'
import { useId, useState } from 'react'
import { makeShare, type StayKind } from '../api/share'
import { useAction } from '../hooks/useAction'
import { ActionError, Button, useToast } from '../ui'
import styles from './me.module.css'

export function ShareStay({ kind, id, placeName }: { kind: StayKind; id: number; placeName: string }) {
  const [open, setOpen] = useState(false)
  const [showName, setShowName] = useState(false)
  const [manual, setManual] = useState<string | null>(null) // copying blocked: shown to copy by hand
  const action = useAction()
  const toast = useToast()
  const panel = useId()

  async function share() {
    const { url } = await makeShare(kind, id, showName)
    const text = `אני לומד/ת ב${placeName}. הקישור יפסיק לעבוד כשאצא.`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'אני לומד/ת כאן', text, url })
        setOpen(false)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return // closed the menu
        // No share menu after all (a desktop browser): copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('הקישור הועתק. הוא יפסיק לעבוד כשהשהות תיגמר.', 'success')
      setOpen(false)
    } catch {
      setManual(url)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<Share2 aria-hidden="true" />}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((was) => !was)}
      >
        לשתף
      </Button>
      {open && (
        <div id={panel} role="group" aria-label="שיתוף המקום" className={styles.sharePanel}>
          <label className={styles.shareName}>
            <input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} />
            להציג את השם שלי
          </label>
          <Button size="sm" busy={action.busy} onClick={() => void action.run(share)}>
            ליצור קישור ולשתף
          </Button>
          {manual && (
            <input className={styles.shareUrl} readOnly value={manual} aria-label="הקישור לשיתוף" onFocus={(event) => event.target.select()} />
          )}
          <ActionError action={action} />
        </div>
      )}
    </>
  )
}
