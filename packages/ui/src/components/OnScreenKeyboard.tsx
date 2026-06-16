import { useCallback, useEffect, useRef, useState } from 'react'
import Keyboard from 'react-simple-keyboard'
import 'react-simple-keyboard/build/css/index.css'

type Focusable = HTMLInputElement | HTMLTextAreaElement

const isFocusable = (el: Element | null): el is Focusable => {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  const input = el as HTMLInputElement
  // Skip checkboxes, radios, file pickers, etc. — keyboard makes no sense there.
  const skip = new Set(['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'color', 'range'])
  return !skip.has(input.type)
}

const writeValue = (el: Focusable, next: string) => {
  // Use the proto-level setter so React's controlled input tracker fires onChange.
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const layouts = {
  default: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    'q w e r t y u i o p',
    'a s d f g h j k l',
    '{shift} z x c v b n m , .',
    '{numbers} {space} {done}',
  ],
  shift: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    'Q W E R T Y U I O P',
    'A S D F G H J K L',
    '{shift} Z X C V B N M ! ?',
    '{numbers} {space} {done}',
  ],
  numbers: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    '- / : ; ( ) $ & @ "',
    "{shift} . , ? ! ' # %",
    '{abc} {space} {done}',
  ],
}

const display = {
  '{bksp}': '⌫',
  '{shift}': '⇧',
  '{space}': '␣ space',
  '{done}': 'done',
  '{numbers}': '123',
  '{abc}': 'abc',
}

export interface OnScreenKeyboardProps {
  /** Force enable/disable. If undefined, auto-detects touch devices. */
  enabled?: boolean
}

export const OnScreenKeyboard = ({ enabled }: OnScreenKeyboardProps) => {
  const [focused, setFocused] = useState<Focusable | null>(null)
  const [layout, setLayout] = useState<'default' | 'shift' | 'numbers'>('default')
  const overlayRef = useRef<HTMLDivElement>(null)

  // Default: show on coarse-pointer / touch devices unless explicitly disabled.
  const auto = (() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(pointer: coarse)').matches ?? false
  })()
  const active = enabled ?? auto

  useEffect(() => {
    if (!active) return

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      // Ignore focus shifts that came from the keyboard itself.
      if (overlayRef.current?.contains(t)) return
      if (isFocusable(t)) {
        setFocused(t)
        setLayout('default')
      }
    }

    const onFocusOut = (e: FocusEvent) => {
      // If focus is moving into the keyboard, ignore.
      const next = e.relatedTarget as Element | null
      if (overlayRef.current?.contains(next)) return
      setFocused(null)
    }

    // Hide keyboard on pointer-down outside both the focused input and the
    // keyboard itself. Prevents the keyboard sticking around when the user
    // taps "elsewhere" on the dashboard.
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t) return
      if (overlayRef.current?.contains(t)) return
      if (focused && t === focused) return
      if (focused && (focused.contains(t) as boolean)) return
      setFocused(null)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [active, focused])

  const onKeyPress = useCallback(
    (button: string) => {
      if (!focused) return
      if (button === '{shift}') {
        setLayout((l) => (l === 'shift' ? 'default' : 'shift'))
        return
      }
      if (button === '{numbers}') {
        setLayout('numbers')
        return
      }
      if (button === '{abc}') {
        setLayout('default')
        return
      }
      if (button === '{done}') {
        focused.blur()
        setFocused(null)
        return
      }

      const current = focused.value
      const start = focused.selectionStart ?? current.length
      const end = focused.selectionEnd ?? current.length

      if (button === '{bksp}') {
        if (start === 0 && end === 0) return
        const cutFrom = start === end ? Math.max(0, start - 1) : start
        const next = current.slice(0, cutFrom) + current.slice(end)
        writeValue(focused, next)
        // Restore cursor to the new position.
        requestAnimationFrame(() => focused.setSelectionRange(cutFrom, cutFrom))
        return
      }

      const insert = button === '{space}' ? ' ' : button
      const next = current.slice(0, start) + insert + current.slice(end)
      writeValue(focused, next)
      const cursor = start + insert.length
      requestAnimationFrame(() => focused.setSelectionRange(cursor, cursor))

      // Auto-release shift after one capital letter (sticky-shift like iOS).
      if (layout === 'shift' && /^[A-Z]$/.test(insert)) setLayout('default')
    },
    [focused, layout],
  )

  if (!active || !focused) return null

  return (
    <div
      ref={overlayRef}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-300 bg-white p-2 shadow-lg"
      // Prevent the input from blurring when the user taps a key.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <Keyboard
        layoutName={layout}
        layout={layouts}
        display={display}
        onKeyPress={onKeyPress}
        physicalKeyboardHighlight={false}
        preventMouseDownDefault
        buttonTheme={[
          {
            class: 'osk-action',
            buttons: '{bksp} {shift} {done} {numbers} {abc}',
          },
          { class: 'osk-space', buttons: '{space}' },
        ]}
      />
      <style>{`
        .react-simple-keyboard {
          background: transparent;
          padding: 0;
          font-family: var(--font-family-sans);
        }
        .react-simple-keyboard .hg-button {
          height: 56px;
          font-size: 18px;
          font-weight: 600;
          border-radius: 10px;
          border: 1px solid #d1d5db;
          background: #f9fafb;
          color: var(--text);
          box-shadow: 0 1px 0 #e5e7eb;
        }
        .react-simple-keyboard .hg-button:active {
          background: var(--accent);
          color: #fff;
        }
        .react-simple-keyboard .osk-action {
          background: #e5e7eb;
          font-size: 14px;
        }
        .react-simple-keyboard .osk-space {
          min-width: 40%;
        }
      `}</style>
    </div>
  )
}
