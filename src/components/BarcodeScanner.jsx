import { useEffect, useRef, useState } from 'react'
import { lookupByBarcode } from '../services/discogs.js'
import Icon from './Icon.jsx'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

/** Scan a record's barcode with the camera → look it up on Discogs → add it.
 *  Uses the native BarcodeDetector (iOS 17+/modern browsers); degrades to a
 *  clear message where unsupported. Older/used records often have no barcode. */
export default function BarcodeScanner({ onAdd, onClose, findDuplicate }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const lastRef = useRef('')
  const phaseRef = useRef('scanning')
  const findDupRef = useRef(findDuplicate)
  findDupRef.current = findDuplicate // keep current without restarting the camera effect
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window

  const [phase, setPhase] = useState('scanning') // scanning | looking | found | notfound | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(0)
  const [dup, setDup] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { phaseRef.current = phase }, [phase])

  // Camera lifecycle — runs ONCE per mount. Deliberately depends only on
  // `supported`, never on changing props, so adds/re-renders don't tear it down.
  useEffect(() => {
    if (!supported) {
      setError('Barcode scanning isn’t supported on this browser. You can still add records by hand.')
      return
    }
    let detector
    try { detector = new window.BarcodeDetector({ formats: FORMATS }) }
    catch { setError('Couldn’t start the barcode detector on this device.'); return }

    let cancelled = false
    let timer = 0

    const handle = async (code) => {
      setPhase('looking'); setError(''); setResult(null); setDup(null)
      try {
        const draft = await lookupByBarcode(code)
        if (cancelled) return
        if (!draft) { setPhase('notfound'); return }
        setResult(draft)
        setDup(findDupRef.current ? findDupRef.current(draft.album, draft.artist) : null)
        setPhase('found')
      } catch (e) {
        if (cancelled) return
        lastRef.current = '' // let the same barcode retry once the error clears
        setError(e.message || String(e))
        setPhase('error')
      }
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (v) { v.srcObject = stream; v.play().catch(() => {}) }
        timer = setInterval(async () => {
          if (phaseRef.current !== 'scanning') return
          const vid = videoRef.current
          if (!vid || vid.readyState < 2) return
          let codes
          try { codes = await detector.detect(vid) } catch { return }
          const code = codes?.[0]?.rawValue
          if (code && code !== lastRef.current) { lastRef.current = code; handle(code) }
        }, 450)
      })
      .catch(() => { if (!cancelled) setError('Camera access was blocked. Allow camera in your settings to scan.') })

    return () => {
      cancelled = true
      clearInterval(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [supported])

  const resume = () => { lastRef.current = ''; setResult(null); setError(''); setPhase('scanning') }

  const add = async () => {
    if (adding || !result) return
    setAdding(true)
    try { await onAdd(result); setAdded((n) => n + 1); resume() }
    catch (e) { setError(`Couldn’t add that: ${e.message || e}`); setPhase('error') }
    finally { setAdding(false) }
  }

  return (
    <div className="scanner">
      {supported && (
        <div className="scanner-stage">
          <video ref={videoRef} muted playsInline className="scanner-video" />
          <div className="scanner-reticle" aria-hidden />
        </div>
      )}
      <div role="status" aria-live="polite">
        {error && <p className="hint">{error}</p>}
        {supported && phase === 'scanning' && <p className="scanner-tip">Point the camera at the barcode on the record’s back cover.</p>}
        {phase === 'looking' && <p className="scanner-tip"><span className="spinner" /> Looking it up…</p>}
        {added > 0 && <p className="auth-msg">{added} record{added === 1 ? '' : 's'} added.</p>}
      </div>

      {phase === 'error' && (
        <div className="scanner-result">
          <button className="btn btn-ghost" onClick={resume}>Try again</button>
        </div>
      )}

      {phase === 'notfound' && (
        <div className="scanner-result">
          <p className="hint">No Discogs match for that barcode. Older or used records often have none — add it by hand instead.</p>
          <button className="btn btn-ghost" onClick={resume}>Scan another</button>
        </div>
      )}

      {phase === 'found' && result && (
        <div className="scanner-result">
          <div className="scanner-hit">
            {result.coverUrl ? <img src={result.coverUrl} alt="" /> : <div className="result-noart"><Icon name="disc" size={20} /></div>}
            <div className="scanner-hit-meta">
              <strong>{result.album || 'Unknown album'}</strong>
              <small>{[result.artist, result.year].filter(Boolean).join(' · ')}</small>
              {(result.label || result.catalogNo) && <small>{[result.label, result.catalogNo].filter(Boolean).join(' — ')}</small>}
            </div>
          </div>
          {dup && <p className="hint">⚠️ Already in your collection — adding makes a duplicate.</p>}
          <div className="scanner-actions">
            <button className="btn btn-primary" onClick={add} disabled={adding}>{adding ? 'Adding…' : 'Add to collection'}</button>
            <button className="btn btn-ghost" onClick={resume} disabled={adding}>Skip</button>
          </div>
        </div>
      )}

      <button className="btn btn-ghost scanner-done" onClick={onClose}>Done</button>
    </div>
  )
}
