import { TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { reportError } from '../logic/errorReport'
import { Button, EmptyState } from '../ui'

// A page that crashed while drawing, or whose code could not load (a visitor
// who stayed open across a new version of the site). It stands on its own:
// the crash may be in the very parts the other pages lean on.
export function RouteErrorPage() {
  const error = useRouteError()
  useEffect(() => reportError(error), [error])
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="משהו השתבש"
      action={<Button onClick={() => window.location.reload()}>לטעון את הדף מחדש</Button>}
    >
      אפשר לנסות לטעון את הדף מחדש. אם זה חוזר, נשמח אם תספרו לנו.
    </EmptyState>
  )
}
