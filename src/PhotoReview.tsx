import { useLayoutEffect, useRef, useState } from 'react'
import { availablePhotoLayers, defaultPhotoLayers, photoFileName, type PhotoLayer, type RacePhotoHud, type SceneCapture } from './racePhoto'
import { drawRacePhoto } from './racePhotoDrawing'

// The print leaves the stage once the shutter has closed and reopened (see .shutter-blade in styles.css).
const SHUTTER_MS = 300
const FLIGHT_MS = 620
const FLIGHT_EASING = 'cubic-bezier(.2, .75, .15, 1)'
const FLIGHT_TILT_DEGREES = -2.5
const PHOTO_TYPE = 'image/png'

type Props = { capture: SceneCapture; hud: RacePhotoHud; onClose: () => void }

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The photo could not be encoded.')), PHOTO_TYPE)
})
const canCopyImages = typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'

export function PhotoReview({ capture, hud, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layers, setLayers] = useState(() => defaultPhotoLayers(hud))
  const [message, setMessage] = useState<string | null>(null)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (canvas) drawRacePhoto(canvas, capture, hud, layers)
  }, [capture, hud, layers])

  // The print starts exactly over the stage it was taken from, then flies into the review slot.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const frame = frameRef.current
    if (!dialog || !frame) return
    if (!dialog.open) dialog.showModal()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => dialog.close()
    const slot = frame.getBoundingClientRect()
    const { bounds } = capture
    const flight = frame.animate([
      { transform: `translate(${bounds.left + bounds.width / 2 - slot.left - slot.width / 2}px, ${bounds.top + bounds.height / 2 - slot.top - slot.height / 2}px) scale(${bounds.width / slot.width}, ${bounds.height / slot.height}) rotate(0deg)` },
      { transform: `translate(0, 0) scale(1, 1) rotate(${FLIGHT_TILT_DEGREES}deg)`, offset: 0.7 },
      { transform: 'translate(0, 0) scale(1, 1) rotate(0deg)' },
    ], { duration: FLIGHT_MS, delay: SHUTTER_MS, easing: FLIGHT_EASING, fill: 'backwards' })
    return () => {
      flight.cancel()
      dialog.close()
    }
  }, [capture])

  const toggleLayer = (layer: PhotoLayer) => setLayers((current) => {
    const next = new Set(current)
    if (!next.delete(layer)) next.add(layer)
    return next
  })

  const download = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const url = URL.createObjectURL(await canvasBlob(canvas))
      const link = document.createElement('a')
      link.href = url
      link.download = photoFileName(hud)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url))
      setMessage('Photo saved')
    } catch (cause) {
      console.error('Photo download failed:', cause)
      setMessage('The photo could not be saved.')
    }
  }

  const copy = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      // Safari only accepts clipboard writes that start inside the click, so the blob is passed as a promise.
      await navigator.clipboard.write([new ClipboardItem({ [PHOTO_TYPE]: canvasBlob(canvas) })])
      setMessage('Copied to clipboard')
    } catch (cause) {
      console.error('Photo copy failed:', cause)
      setMessage('Copy failed. Try downloading the photo instead.')
    }
  }

  return <dialog className="photo-review" ref={dialogRef} aria-labelledby="photo-review-title" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="photo-frame" ref={frameRef} style={{ '--photo-ratio': capture.image.width / capture.image.height } as React.CSSProperties}>
      <canvas ref={canvasRef} role="img" aria-label={`Race photo of ${hud.location}, lap ${hud.lap}`} />
      <span className="shutter-blade top" aria-hidden="true" />
      <span className="shutter-blade bottom" aria-hidden="true" />
      <span className="shutter-flash" aria-hidden="true" />
    </div>
    <div className="photo-panel">
      <div className="photo-panel-heading">
        <div>
          <span className="section-eyebrow">PHOTO · LAP {hud.lap}/{hud.totalLaps} · {hud.clock}</span>
          <h2 id="photo-review-title">Race photo</h2>
        </div>
        <button type="button" className="photo-close" aria-label="Close photo" onClick={onClose}>×</button>
      </div>
      <fieldset className="photo-layers">
        <legend>Include in photo</legend>
        {availablePhotoLayers(hud).map((layer) => <label key={layer.id}>
          <input type="checkbox" checked={layers.has(layer.id)} onChange={() => toggleLayer(layer.id)} />
          <span>{layer.label}</span>
        </label>)}
      </fieldset>
      <div className="photo-actions">
        <button type="button" className="photo-primary" onClick={download} autoFocus>Download PNG</button>
        {canCopyImages && <button type="button" onClick={copy}>Copy image</button>}
      </div>
      <p className="photo-message" role="status" aria-live="polite">{message}</p>
    </div>
  </dialog>
}
