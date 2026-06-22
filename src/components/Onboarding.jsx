import { useState } from 'react'
import Icon from './Icon.jsx'

const STEPS = [
  { icon: 'sparkle', title: 'Welcome to SPUN', text: 'The app that hands you a record you forgot you own — and gets it back on the turntable.' },
  { icon: 'download', title: 'Add your records', text: 'Pull your whole collection from Discogs in one paste, dictate a list, scan a barcode, or add one at a time — covers and details auto-fill.' },
  { icon: 'disc', title: 'Play something tonight', text: 'SPUN resurfaces records you haven’t spun in ages. Tap “I spun this” to play one — your streaks and a Wrapped-style recap build from there.' },
  { icon: 'users', title: 'Share the crate', text: 'Add friends by @username, see what they’re spinning, and post a Wrapped card to the group chat.' },
  { icon: 'heart', title: 'Make it yours', text: 'Keep a wishlist, tag records into crates, and tap any record for its tracklist, credits, and pressing.' },
]

/** First-run welcome tour. Re-openable from the menu. */
export default function Onboarding({ onClose }) {
  const [i, setI] = useState(0)
  const last = i === STEPS.length - 1
  const step = STEPS[i]

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to SPUN">
      <div className="onboarding-card">
        <button className="onboarding-skip" onClick={onClose}>Skip</button>
        <div className="onboarding-icon"><Icon name={step.icon} size={34} /></div>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <div className="onboarding-dots" aria-hidden>
          {STEPS.map((_, n) => <span key={n} className={n === i ? 'on' : ''} />)}
        </div>
        <div className="onboarding-actions">
          {i > 0 && <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
