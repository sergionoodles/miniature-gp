import type { PhotoLayer, RacePhotoHud, SceneCapture } from './racePhoto'

// Layout is in CSS pixels, matching the on-screen HUD, and scaled by the capture's pixel ratio.
const MARGIN = 18
const GAP = 8
const RADIUS = 5
const PANEL_FILL = '#111a22dc'
const PANEL_STROKE = '#dce4e536'
const TEXT = '#edf1f3'
const MUTED = '#b2bdc2'
const ACCENT = '#e10600'
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif"
const NARROW = "'Arial Narrow', 'Helvetica Neue', sans-serif"
const MONO = "'SFMono-Regular', Consolas, monospace"
const CHIP_HEIGHT = 32
const TOWER_WIDTH = 104
const TOWER_HEADER = 30
const TOWER_MAX_ROW = 20
const TITLE_SIZE = 44
const LONG_TITLE_SIZE = 36
const LONG_TITLE_LENGTH = 12
const MIN_TITLE_SIZE = 20
const TOAST_WIDTH = 260
const FOCUS_WIDTH = 258

type Box = { x: number; y: number; width: number; height: number }

export function drawRacePhoto(target: HTMLCanvasElement, capture: SceneCapture, hud: RacePhotoHud, layers: Set<PhotoLayer>) {
  target.width = capture.image.width
  target.height = capture.image.height
  const context = target.getContext('2d')
  if (!context) throw new Error('The photo canvas could not be drawn.')
  context.drawImage(capture.image, 0, 0)
  context.save()
  context.scale(capture.pixelRatio, capture.pixelRatio)
  const width = target.width / capture.pixelRatio
  const height = target.height / capture.pixelRatio
  const left = layers.has('order') ? drawRunningOrder(context, hud, height) + GAP * 1.5 : MARGIN
  let right = MARGIN
  let top = MARGIN
  if (layers.has('timing')) {
    const chip = drawTiming(context, hud, width - MARGIN, top)
    top += chip.height + GAP
    right = Math.max(right, width - chip.x)
  }
  if (layers.has('conditions')) {
    const chips = drawConditions(context, hud, width - MARGIN, top)
    top += chips.height + GAP
    right = Math.max(right, width - chips.x)
  }
  if (layers.has('notifications')) drawNotifications(context, hud, width - MARGIN, top)
  if (layers.has('title')) drawTitle(context, hud, left, width - right - GAP * 2 - left)
  if (layers.has('focus') && hud.focus) drawFocus(context, hud.focus, left, height - MARGIN)
  if (layers.has('branding')) drawBranding(context, width - MARGIN, height - MARGIN)
  context.restore()
}

function font(context: CanvasRenderingContext2D, value: string, letterSpacing = 0) {
  context.font = value
  context.letterSpacing = `${letterSpacing}px`
}

function panel(context: CanvasRenderingContext2D, { x, y, width, height }: Box) {
  context.beginPath()
  context.roundRect(x, y, width, height, RADIUS)
  context.fillStyle = PANEL_FILL
  context.fill()
  context.strokeStyle = PANEL_STROKE
  context.lineWidth = 1
  context.stroke()
}

function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, color: string) {
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.fillText(value, x, y)
}

function drawRunningOrder(context: CanvasRenderingContext2D, hud: RacePhotoHud, height: number) {
  const rowHeight = Math.min(TOWER_MAX_ROW, (height - MARGIN * 2 - TOWER_HEADER - GAP) / hud.order.length)
  const box = { x: MARGIN, y: MARGIN, width: TOWER_WIDTH, height: TOWER_HEADER + rowHeight * hud.order.length + GAP }
  panel(context, box)
  font(context, `500 8px ${MONO}`, 1.5)
  text(context, 'RUNNING ORDER', box.x + 12, box.y + TOWER_HEADER / 2 + 2, MUTED)
  hud.order.forEach((driver, index) => {
    const middle = box.y + TOWER_HEADER + rowHeight * (index + 0.5)
    font(context, `500 10px ${MONO}`)
    context.textAlign = 'right'
    text(context, driver.position === 99 ? '–' : String(driver.position), box.x + 28, middle, MUTED)
    context.textAlign = 'left'
    context.fillStyle = driver.color
    context.fillRect(box.x + 36, middle - rowHeight * 0.3, 3, rowHeight * 0.6)
    font(context, `700 11px ${SANS}`)
    text(context, driver.code, box.x + 47, middle, TEXT)
  })
  return box.x + box.width
}

function drawTitle(context: CanvasRenderingContext2D, hud: RacePhotoHud, x: number, availableWidth: number) {
  const paddingX = 14
  const kicker = `${hud.countryCode} / ${hud.year}`
  const subtitle = `${hud.grandPrix} · ${hud.dateLabel}`
  const location = hud.location.toUpperCase()
  const preferredSize = hud.location.length > LONG_TITLE_LENGTH ? LONG_TITLE_SIZE : TITLE_SIZE
  font(context, `300 ${preferredSize}px ${NARROW}`, 3)
  const titleSize = Math.max(MIN_TITLE_SIZE, Math.min(preferredSize, preferredSize * (availableWidth - paddingX * 2) / context.measureText(location).width))
  font(context, `300 ${titleSize}px ${NARROW}`, 3)
  const titleWidth = context.measureText(location).width
  font(context, `11px ${SANS}`)
  const subtitleWidth = context.measureText(subtitle).width
  const paddingY = 12
  const lineGap = 9
  const titleTop = MARGIN + paddingY + 9 + lineGap
  const subtitleTop = titleTop + titleSize * 1.12 + lineGap
  const box = { x, y: MARGIN, width: Math.max(titleWidth, subtitleWidth) + paddingX * 2, height: subtitleTop + 11 + paddingY - MARGIN }
  panel(context, box)
  font(context, `9px ${MONO}`, 1.5)
  text(context, kicker, x + paddingX, MARGIN + paddingY + 4.5, TEXT)
  font(context, `300 ${titleSize}px ${NARROW}`, 3)
  text(context, location, x + paddingX, titleTop + titleSize * 0.56, TEXT)
  font(context, `11px ${SANS}`)
  text(context, subtitle, x + paddingX, subtitleTop + 5.5, MUTED)
}

function chip(context: CanvasRenderingContext2D, rightEdge: number, y: number, parts: { value: string; font: string; color: string; gap?: number }[]) {
  const paddingX = 11
  const widths = parts.map((part) => {
    font(context, part.font)
    return context.measureText(part.value).width
  })
  const width = widths.reduce((total, partWidth, index) => total + partWidth + (index ? parts[index].gap ?? 7 : 0), 0) + paddingX * 2
  const box = { x: rightEdge - width, y, width, height: CHIP_HEIGHT }
  panel(context, box)
  let cursor = box.x + paddingX
  parts.forEach((part, index) => {
    cursor += index ? part.gap ?? 7 : 0
    font(context, part.font)
    text(context, part.value, cursor, y + CHIP_HEIGHT / 2, part.color)
    cursor += widths[index]
  })
  return box
}

function drawTiming(context: CanvasRenderingContext2D, hud: RacePhotoHud, rightEdge: number, y: number) {
  return chip(context, rightEdge, y, [
    { value: `LAP ${hud.lap}/${hud.totalLaps}`, font: `700 10px ${SANS}`, color: TEXT },
    { value: hud.clock, font: `500 11px ${MONO}`, color: MUTED, gap: 10 },
  ])
}

function drawConditions(context: CanvasRenderingContext2D, hud: RacePhotoHud, rightEdge: number, y: number) {
  const weather = chip(context, rightEdge, y, [
    { value: hud.weather.symbol, font: `16px ${SANS}`, color: TEXT },
    { value: hud.weather.label, font: `600 10px ${SANS}`, color: TEXT },
    ...hud.weather.details ? [{ value: hud.weather.details, font: `600 10px ${SANS}`, color: MUTED, gap: 10 }] : [],
  ])
  const status = chip(context, weather.x - GAP, y, [{ value: `●  ${hud.status}`, font: `600 10px ${SANS}`, color: TEXT }])
  return { x: status.x, height: CHIP_HEIGHT }
}

function drawNotifications(context: CanvasRenderingContext2D, hud: RacePhotoHud, rightEdge: number, top: number) {
  const height = 46
  hud.notifications.forEach((notice, index) => {
    const box = { x: rightEdge - TOAST_WIDTH, y: top + index * (height + 7), width: TOAST_WIDTH, height }
    panel(context, box)
    font(context, `700 12px ${SANS}`)
    const headline = notice.drivers
      ? [{ value: notice.drivers[0].name, color: notice.drivers[0].color }, { value: 'passed', color: TEXT }, { value: notice.drivers[1].name, color: notice.drivers[1].color }]
      : [{ value: notice.title, color: TEXT }]
    let cursor = box.x + 13
    headline.forEach((part) => {
      text(context, part.value, cursor, box.y + 16, part.color)
      cursor += context.measureText(`${part.value} `).width
    })
    font(context, `10px ${SANS}`)
    text(context, notice.detail, box.x + 13, box.y + 32, MUTED)
  })
}

function drawFocus(context: CanvasRenderingContext2D, focus: NonNullable<RacePhotoHud['focus']>, x: number, bottom: number) {
  const box = { x, y: bottom - 76, width: FOCUS_WIDTH, height: 76 }
  panel(context, box)
  font(context, `500 9px ${MONO}`, 1.5)
  text(context, 'DRIVER IN FOCUS', x + 14, box.y + 18, MUTED)
  font(context, `700 14px ${SANS}`)
  text(context, focus.name, x + 14, box.y + 38, TEXT)
  font(context, `10px ${MONO}`)
  context.textAlign = 'right'
  text(context, `#${focus.number}`, x + FOCUS_WIDTH - 14, box.y + 38, MUTED)
  context.textAlign = 'left'
  font(context, `10px ${SANS}`)
  text(context, `${focus.team} · P${focus.position === 99 ? '–' : focus.position} · Lap ${focus.lap}`, x + 14, box.y + 58, MUTED)
}

function drawBranding(context: CanvasRenderingContext2D, rightEdge: number, bottom: number) {
  const label = 'MINIATURE GP'
  font(context, `650 11px ${SANS}`, 1.4)
  const width = context.measureText(label).width + 36
  const box = { x: rightEdge - width, y: bottom - 28, width, height: 28 }
  panel(context, box)
  context.fillStyle = ACCENT
  context.fillRect(box.x + 11, box.y + 10, 8, 8)
  text(context, label, box.x + 26, box.y + 14.5, TEXT)
}
