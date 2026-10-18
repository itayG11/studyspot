import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Look {
  variant?: Variant
  size?: Size
  icon?: ReactNode // drawn before the text, which in Hebrew is on the right
  block?: boolean // full width
}

function lookClass({ variant = 'primary', size = 'md', block = false }: Look, extra?: string): string {
  return [styles.button, styles[variant], styles[size], block && styles.block, extra].filter(Boolean).join(' ')
}

type ButtonProps = Look & ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; ref?: Ref<HTMLButtonElement> }

// busy: the action is on its way. The button stays focusable (aria-disabled,
// not disabled), so a screen reader does not lose its place, but clicks and
// Enter in a form are ignored until it finishes.
export function Button({ variant, size, icon, block, busy = false, className, children, onClick, type = 'button', ...rest }: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }
  return (
    <button
      type={type}
      className={lookClass({ variant, size, block }, className)}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...rest}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  )
}

// A link that looks like a button: for moving to another page.
export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: Look & LinkProps) {
  return (
    <Link className={lookClass({ variant, size, block }, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  )
}

// A link to another site that looks like a button. It opens in a new tab;
// noopener keeps that tab from reaching back into this page.
export function ExternalButtonLink({ variant, size, icon, block, className, children, ...rest }: Look & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={lookClass({ variant, size, block }, className)} target="_blank" rel="noopener noreferrer" {...rest}>
      {icon}
      <span>{children}</span>
    </a>
  )
}
