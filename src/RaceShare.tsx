import { useRef, useState } from 'react'
import { racePath } from './raceRoutes'

type Props = { year: number; race: { circuit: string; location: string } }

export function RaceShare({ year, race }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const replayUrl = new URL(racePath(year, race), window.location.origin).href
  const embedUrl = new URL(racePath(year, race, true), window.location.origin).href

  const openDialog = () => {
    setMessage(null)
    dialogRef.current?.showModal()
  }

  const copyLink = async (url: string, confirmation: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setMessage(confirmation)
    } catch {
      setMessage('Could not copy. Select the link and copy it manually.')
    }
  }

  return <>
    <button type="button" className="race-share-button" aria-label="Share race" aria-haspopup="dialog" title="Share race" onClick={openDialog}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
    </button>
    <dialog className="race-share-dialog" ref={dialogRef} aria-labelledby="race-share-title" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close() }}>
      <div className="race-share-content">
        <div className="race-share-heading">
          <div>
            <h2 id="race-share-title">Share race</h2>
            <p>{race.location} {year}</p>
          </div>
          <button type="button" className="race-share-close" aria-label="Close share" onClick={() => dialogRef.current?.close()}>×</button>
        </div>
        <div className="race-share-option">
          <label htmlFor="race-share-url">Replay URL</label>
          <input id="race-share-url" type="url" value={replayUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={() => copyLink(replayUrl, 'URL copied to clipboard.')}>Copy URL</button>
        </div>
        <div className="race-share-option">
          <label htmlFor="race-share-embed">Embed link</label>
          <p id="race-share-embed-description">Share this link on X.com to embed the replay.</p>
          <input id="race-share-embed" type="url" value={embedUrl} readOnly aria-describedby="race-share-embed-description" onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={() => copyLink(embedUrl, 'Embed link copied to clipboard.')}>Copy embed link</button>
        </div>
        <p className="race-share-message" role="status">{message}</p>
      </div>
    </dialog>
  </>
}
