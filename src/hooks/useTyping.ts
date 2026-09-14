import { useEffect, useState } from 'react'

/** Inputs that take a tap rather than typing, so focusing one opens no keyboard. */
const NOT_TEXT = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']

function typingInto(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true
  return el.tagName === 'INPUT' && !NOT_TEXT.includes((el as HTMLInputElement).type)
}

/**
 * Whether a text field has focus — on a phone, whether the keyboard is up.
 *
 * Controls floating at the foot of the screen use it to step aside, so they
 * never sit on top of the box being typed in.
 */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(() => typeof document !== 'undefined' && typingInto(document.activeElement))

  useEffect(() => {
    const update = () => setTyping(typingInto(document.activeElement))
    // Focus moving from one field to the next passes through the page for a
    // moment; checking a tick later keeps controls from flickering in between.
    const later = () => window.setTimeout(update, 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', later)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', later)
    }
  }, [])

  return typing
}
