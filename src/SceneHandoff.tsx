import { useLayoutEffect, useRef } from 'react'

type Props = {
  image: HTMLCanvasElement
  isFading: boolean
  onFaded: () => void
}

// The old scene's last frame, held over the canvas while the new scene builds, then faded out.
// The layout effect puts it in place before the browser paints the emptied canvas container.
export function SceneHandoff({ image, isFading, onFaded }: Props) {
  const holderRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    holder.replaceChildren(image)
    return () => holder.replaceChildren()
  }, [image])

  return <div ref={holderRef} className={isFading ? 'scene-handoff is-fading' : 'scene-handoff'} aria-hidden="true" onTransitionEnd={onFaded} />
}
