import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'

const KEY = 'spun-install-dismissed'

// iOS Safari can't fire beforeinstallprompt, so we show a manual hint —
// only on an iOS Safari tab that isn't already installed, and only once.
function shouldShow() {
  if (typeof navigator === 'undefined') return false
  if (localStorage.getItem(KEY)) return false
  const ua = navigator.userAgent || ''
  const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!iOS) return false
  if (/crios|fxios|edgios/i.test(ua)) return false // non-Safari iOS browsers can't add to Home Screen
  const installed = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return !installed
}

export default function InstallHint() {
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(shouldShow()) }, [])

  if (!show) return null
  const dismiss = () => { localStorage.setItem(KEY, '1'); setShow(false) }

  return (
    <div className="install-hint" role="note">
      <Icon name="disc" size={20} />
      <span>Add <strong>SPUN</strong> to your Home Screen — tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>
      <button className="install-hint-close" onClick={dismiss} aria-label="Dismiss">
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
