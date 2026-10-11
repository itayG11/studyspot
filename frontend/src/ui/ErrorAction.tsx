// The way out of an error, when it has one: "sign in", "scan the code".

import { Link, useInRouterContext, useLocation } from 'react-router'
import { errorLink } from '../i18n/errors'
import styles from './Notice.module.css'

export function ErrorAction({ code }: { code: string | null }) {
  // The states are drawn outside a router too (their own tests): no link then.
  const inRouter = useInRouterContext()
  if (!code || !inRouter) return null
  return <ErrorLink code={code} />
}

function ErrorLink({ code }: { code: string }) {
  const { pathname } = useLocation()
  const link = errorLink(code, pathname)
  if (!link) return null
  return (
    <Link to={link.to} className={styles.action}>
      {link.label}
    </Link>
  )
}
