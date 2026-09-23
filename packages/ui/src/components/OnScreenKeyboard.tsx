import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Keyboard from 'react-simple-keyboard'
import 'react-simple-keyboard/build/css/index.css'

type Focusable = HTMLInputElement | HTMLTextAreaElement

type LayoutName = 'default' | 'shift' | 'numbers' | 'symbols' | 'numeric'

// Input types the keyboard stays out of: toggles and pickers have their own
// touch UI, and date/time inputs reject free-form text — writing "1" into a
// `type="time"` field just empties it.
const SKIP_TYPES = new Set([
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'hidden',
  'color',
  'range',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
])

const isFocusable = (el: Element | null): el is Focusable => {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  return !SKIP_TYPES.has((el as HTMLInputElement).type)
}

const isEditable = (el: Focusable) => !el.disabled && !el.readOnly

const isNumeric = (el: Focusable) =>
  (el instanceof HTMLInputElement && el.type === 'number') ||
  ['numeric', 'decimal', 'tel'].includes(el.inputMode)

/** Start in shift for an empty plain-text field (a name, a chore, a town),
 * like a phone keyboard does — unless the field opts out. */
const wantsCapital = (el: Focusable) => {
  if (el.value !== '') return false
  if (el instanceof HTMLInputElement && el.type !== 'text' && el.type !== 'search') return false
  const cap = el.getAttribute('autocapitalize')
  return cap !== 'off' && cap !== 'none'
}

const initialLayout = (el: Focusable): LayoutName =>
  isNumeric(el) ? 'numeric' : wantsCapital(el) ? 'shift' : 'default'

const writeValue = (el: Focusable, next: string) => {
  // Use the proto-level setter so React's controlled input tracker fires onChange.
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Number, email and some other input types don't expose a caret at all
 * (`selectionStart` is null and `setSelectionRange` throws), so edits there
 * always happen at the end. */
const hasCaret = (el: Focusable) => {
  try {
    return el.selectionStart !== null
  } catch {
    return false
  }
}

const setCaret = (el: Focusable, pos: number) => {
  if (!hasCaret(el) || document.activeElement !== el) return
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    // Input type changed under us; nothing to restore.
  }
}

const fieldLabel = (el: Focusable): string => {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria
  const label = el.labels?.[0]?.textContent?.trim()
  if (label) return label
  return el.placeholder
}

/** Text fields reachable with the keyboard's "next" key: later fields in the
 * same section or dialog, skipping anything hidden or disabled. */
const nextField = (el: Focusable): Focusable | null => {
  const scope = el.closest('section, [role="dialog"], dialog') ?? document
  const fields = Array.from(scope.querySelectorAll('input, textarea')).filter(
    (f): f is Focusable => isFocusable(f) && isEditable(f) && f.getClientRects().length > 0,
  )
  const i = fields.indexOf(el)
  return i >= 0 ? (fields[i + 1] ?? null) : null
}

const layouts: Record<LayoutName, string[]> = {
  default: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    'q w e r t y u i o p',
    'a s d f g h j k l {enter}',
    '{shift} z x c v b n m , . -',
    '{numbers} @ {space} _ {hide}',
  ],
  shift: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    'Q W E R T Y U I O P',
    'A S D F G H J K L {enter}',
    '{shift} Z X C V B N M ! ? -',
    '{numbers} @ {space} _ {hide}',
  ],
  numbers: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    '- / : ; ( ) $ & @ "',
    "{symbols} . , ? ! ' # % {enter}",
    '{abc} {space} {hide}',
  ],
  symbols: [
    '[ ] { } # % ^ * + = {bksp}',
    '_ \\ | ~ < > € £ ¥ •',
    "{numbers} . , ? ! ' ` {enter}",
    '{abc} {space} {hide}',
  ],
  numeric: ['1 2 3 {bksp}', '4 5 6 -', '7 8 9 .', '{hide} 0 {enter}'],
}

const baseDisplay = {
  '{bksp}': '⌫',
  '{shift}': '⇧',
  '{space}': 'space',
  '{hide}': '⌄',
  '{numbers}': '123',
  '{symbols}': '#+=',
  '{abc}': 'abc',
}

type EnterAction = 'newline' | 'go' | 'next' | 'done'

const enterAction = (el: Focusable): EnterAction => {
  if (el.tagName === 'TEXTAREA') return 'newline'
  if (el.form) return 'go'
  return nextField(el) ? 'next' : 'done'
}

const enterLabel: Record<EnterAction, string> = {
  newline: '↵',
  go: 'go',
  next: 'next',
  done: 'done',
}

/** Double-tapping shift within this window turns on caps lock. */
const CAPS_LOCK_MS = 400

export interface OnScreenKeyboardProps {
  /** Force enable/disable. If undefined, auto-detects touch devices. */
  enabled?: boolean
}

export const OnScreenKeyboard = ({ enabled }: OnScreenKeyboardProps) => {
  const [focused, setFocused] = useState<Focusable | null>(null)
  const [layout, setLayout] = useState<LayoutName>('default')
  const [capsLock, setCapsLock] = useState(false)
  // Re-render the preview when the field's value or caret changes.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const lastShiftAt = useRef(0)
  // A `type="number"` input throws away anything that isn't a complete
  // number, so "-" or "5." would vanish as they're typed. Keep what the user
  // actually typed here, and only trust it while the input still shows the
  // value we last wrote (so outside changes win).
  const numberDraft = useRef<{ el: Focusable; text: string; shown: string } | null>(null)

  // Resolution order for whether the keyboard is active:
  //   1. Explicit `enabled` prop (overrides everything)
  //   2. ?keyboard=1 in the URL (force on — for kiosks where auto-detect fails)
  //   3. ?keyboard=0 in the URL (force off — for desktop dev)
  //   4. (pointer: coarse) media query — auto-detect touch devices
  // (4) is unreliable in cage/wlroots Chromium on the Pi, hence (2). It also
  // matches any phone, where the device's own keyboard is better than ours —
  // so the admin SPA passes an explicit `enabled` (see admin/src/App.tsx) and
  // only the kiosk relies on (2)-(4). Because (1) wins, the admin reads the
  // ?keyboard param itself and applies the same 1/0 meanings before falling
  // back to its own localhost check.
  const detected = (() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const param = params.get('keyboard')
    if (param === '1' || param === 'true') return true
    if (param === '0' || param === 'false') return false
    return window.matchMedia?.('(pointer: coarse)').matches ?? false
  })()
  const active = enabled ?? detected

  const readValue = useCallback((el: Focusable) => {
    const d = numberDraft.current
    return d && d.el === el && el.value === d.shown ? d.text : el.value
  }, [])

  const setValue = useCallback((el: Focusable, next: string, caret: number) => {
    writeValue(el, next)
    numberDraft.current =
      el instanceof HTMLInputElement && el.type === 'number'
        ? { el, text: next, shown: el.value }
        : null
    requestAnimationFrame(() => {
      setCaret(el, caret)
      refresh()
    })
  }, [])

  useEffect(() => {
    if (!active) return

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      // Ignore focus shifts that came from the keyboard itself.
      if (overlayRef.current?.contains(t)) return
      if (isFocusable(t) && isEditable(t)) {
        setFocused(t)
        setLayout(initialLayout(t))
        setCapsLock(false)
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
    // taps "elsewhere" on the dashboard. Listens in the capture phase: a key
    // press re-renders the keys (shift, 123, …) before a bubbling listener
    // would run, detaching the tapped key so it no longer looks like it was
    // inside the keyboard.
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
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [active, focused])

  // Keep the preview in step with edits that don't come from our keys — a
  // physical keyboard, a tap that moves the caret, a form that clears itself.
  useEffect(() => {
    if (!focused) return
    const onChange = () => refresh()
    focused.addEventListener('input', onChange)
    document.addEventListener('selectionchange', onChange)
    return () => {
      focused.removeEventListener('input', onChange)
      document.removeEventListener('selectionchange', onChange)
    }
  }, [focused])

  // The keyboard sits over the bottom of the screen; if it landed on top of
  // the field being typed into, bring the field into view where the layout
  // can scroll. (Where it can't — a widget pinned to the bottom of the kiosk
  // grid — the preview line above the keys still shows what's being typed.)
  useEffect(() => {
    if (!focused) return
    const id = requestAnimationFrame(() => {
      const kb = overlayRef.current?.getBoundingClientRect()
      const field = focused.getBoundingClientRect()
      if (kb && field.bottom > kb.top) focused.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [focused])

  const insert = useCallback(
    (el: Focusable, text: string) => {
      const current = readValue(el)
      const caret = hasCaret(el)
      const start = caret ? (el.selectionStart ?? current.length) : current.length
      const end = caret ? (el.selectionEnd ?? current.length) : current.length
      const maxLength = el.maxLength
      const room =
        maxLength >= 0 ? maxLength - (current.length - (end - start)) : Number.POSITIVE_INFINITY
      if (room <= 0) return
      const chunk = text.slice(0, room)
      setValue(el, current.slice(0, start) + chunk + current.slice(end), start + chunk.length)
    },
    [readValue, setValue],
  )

  const backspace = useCallback(
    (el: Focusable) => {
      const current = readValue(el)
      const caret = hasCaret(el)
      const start = caret ? (el.selectionStart ?? current.length) : current.length
      const end = caret ? (el.selectionEnd ?? current.length) : current.length
      if (start === 0 && end === 0) return
      const cutFrom = start === end ? Math.max(0, start - 1) : start
      setValue(el, current.slice(0, cutFrom) + current.slice(end), cutFrom)
    },
    [readValue, setValue],
  )

  const enter = useCallback(
    (el: Focusable) => {
      const action = enterAction(el)
      if (action === 'newline') {
        insert(el, '\n')
        return
      }
      // Let the page react as if Enter was pressed on a real keyboard (e.g. a
      // number field committing its value). A synthetic event has no default
      // action, so form submission and moving on are done by hand below.
      const handled = !el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      )
      if (action === 'go') {
        // Stay in the field so several items can be added in a row; the form
        // usually clears it, which the input listener picks up.
        if (!handled) el.form?.requestSubmit()
        requestAnimationFrame(() => {
          if (document.activeElement === el) setLayout(initialLayout(el))
          refresh()
        })
        return
      }
      const next = action === 'next' ? nextField(el) : null
      if (next) {
        next.focus()
        return
      }
      el.blur()
      setFocused(null)
    },
    [insert],
  )

  const onKeyPress = useCallback(
    (button: string) => {
      if (!focused) return
      switch (button) {
        case '{shift}': {
          const now = Date.now()
          if (capsLock) {
            setCapsLock(false)
            setLayout('default')
          } else if (layout === 'shift' && now - lastShiftAt.current < CAPS_LOCK_MS) {
            setCapsLock(true)
          } else {
            setLayout(layout === 'shift' ? 'default' : 'shift')
          }
          lastShiftAt.current = now
          return
        }
        case '{numbers}':
          setLayout('numbers')
          return
        case '{symbols}':
          setLayout('symbols')
          return
        case '{abc}':
          setLayout('default')
          setCapsLock(false)
          return
        case '{hide}':
          focused.blur()
          setFocused(null)
          return
        case '{enter}':
          enter(focused)
          return
        case '{bksp}':
          backspace(focused)
          return
      }

      insert(focused, button === '{space}' ? ' ' : button)

      // One-shot shift: drop back to lower case after a capital, unless locked.
      if (layout === 'shift' && !capsLock && /^[A-Z]$/.test(button)) setLayout('default')
    },
    [focused, layout, capsLock, enter, backspace, insert],
  )

  if (!active || !focused) return null

  const label = fieldLabel(focused)
  const value = readValue(focused)
  const masked =
    focused instanceof HTMLInputElement && focused.type === 'password'
      ? '•'.repeat(value.length)
      : value
  const caretAt = hasCaret(focused) ? (focused.selectionEnd ?? value.length) : value.length
  // One line, ending near the caret, so long notes still show where you are.
  const oneLine = (s: string) => s.replace(/\n/g, ' ⏎ ')
  const before = oneLine(masked.slice(0, caretAt))
  const after = oneLine(masked.slice(caretAt))
  const numeric = layout === 'numeric'

  return (
    <div
      ref={overlayRef}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-300 bg-white p-2 shadow-lg"
      // Prevent the input from blurring when the user taps a key.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className={`mx-auto mb-2 ${numeric ? 'max-w-sm' : ''}`}>
        {label ? (
          <div className="truncate px-1 text-xs font-semibold text-[var(--text-dim)]">{label}</div>
        ) : null}
        <div className="osk-preview flex min-h-10 items-center overflow-hidden whitespace-pre rounded-lg bg-gray-100 px-3 text-lg">
          <span className="min-w-0 shrink overflow-hidden text-ellipsis [direction:rtl]">
            <bdi>{before}</bdi>
          </span>
          <span className="osk-caret" aria-hidden />
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis">{after}</span>
        </div>
      </div>
      <div className={`mx-auto ${numeric ? 'max-w-sm' : ''}`}>
        <Keyboard
          layoutName={layout}
          layout={layouts}
          display={{ ...baseDisplay, '{enter}': enterLabel[enterAction(focused)] }}
          onKeyPress={onKeyPress}
          physicalKeyboardHighlight={false}
          preventMouseDownDefault
          buttonTheme={[
            {
              class: 'osk-action',
              buttons: '{bksp} {shift} {hide} {numbers} {symbols} {abc}',
            },
            { class: 'osk-enter', buttons: '{enter}' },
            { class: 'osk-space', buttons: '{space}' },
            ...(layout === 'shift'
              ? [{ class: capsLock ? 'osk-locked' : 'osk-on', buttons: '{shift}' }]
              : []),
          ]}
        />
      </div>
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
        .react-simple-keyboard .osk-enter {
          background: var(--accent);
          color: #fff;
          font-size: 14px;
          min-width: 12%;
        }
        .react-simple-keyboard .osk-on {
          background: #fff;
          border-color: var(--accent);
          color: var(--accent);
        }
        .react-simple-keyboard .osk-locked {
          background: var(--accent);
          color: #fff;
          text-decoration: underline;
        }
        .react-simple-keyboard .osk-space {
          min-width: 40%;
        }
        .osk-caret {
          flex: none;
          width: 2px;
          height: 1.25em;
          background: var(--accent);
          animation: osk-blink 1s steps(1) infinite;
        }
        @keyframes osk-blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
