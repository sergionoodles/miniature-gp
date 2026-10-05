import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RaceStartLights, START_LIGHT_COUNT } from './RaceStartLights'

it('illuminates five red lights cumulatively from left to right', () => {
  for (let countdown = START_LIGHT_COUNT; countdown > 0; countdown -= 1) {
    const markup = renderToStaticMarkup(<RaceStartLights countdown={countdown} />)
    const lights = [...markup.matchAll(/<i(?: class="([^"]+)")?><\/i>/g)]
    const illuminatedLights = START_LIGHT_COUNT + 1 - countdown

    expect(lights).toHaveLength(5)
    expect(lights.map((light) => light[1] === 'illuminated')).toEqual(
      Array.from({ length: 5 }, (_, index) => index < illuminatedLights),
    )
    expect(markup).toContain(`aria-label="${illuminatedLights} of 5 red lights on"`)
  }
})
