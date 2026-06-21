import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Bottom sheet on mobile, centered panel on wider screens. Modal: traps focus,
 *  moves focus in on open, returns it to the opener on close, Escape to dismiss. */
export default function Sheet({ title, onClose, children, footer, wide = false }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose // always current without re-subscribing the effect

  useEffect(() => {
    const opener = document.activeElement
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    const focusables = () => (panel ? [...panel.querySelectorAll(FOCUSABLE)] : [])
    const raf = requestAnimationFrame(() => { (focusables()[0] || panel)?.focus() })

    const onKey = (e) => {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (opener && typeof opener.focus === 'function') opener.focus() // return focus to the trigger
    }
  }, [])

  return (
    <div className="sheet-backdrop" onMouseDown={() => onCloseRef.current()}>
      <div
        ref={panelRef}
        className={`sheet ${wide ? 'sheet-wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={() => onCloseRef.current()} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  )
}
