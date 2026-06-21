import { useState } from 'react'
import Icon from './Icon.jsx'

const STEPS = [
  { icon: 'disc', title: 'Welcome to SPUN', text: 'Your record collection — beautiful, browsable, and in your pocket.' },
  { icon: 'download', title: 'Add your records', text: 'Search to auto-fill cover art and details, paste a whole list at once, or pull your entire collection straight from Discogs.' },
  { icon: 'coverflow', title: 'Browse your way', text: 'Flip through Cover Flow, scan the grid, or skim the list — and search or filter by genre, decade, and crate.' },
  { icon: 'headphones', title: 'Log every spin', text: 'Tap “I spun this” when you play a record. SPUN tracks your streaks, most-played, and a Wrapped-style listening recap.' },
  { icon: 'heart', title: 'Wishlist, rarity & value', text: 'Keep a hunt list, tag records into crates, and see pressing details, rarity, and estimated value from Discogs.' },
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
