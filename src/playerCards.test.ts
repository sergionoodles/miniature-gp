import { expect, it } from 'vitest'
import { createPlayerPages } from '../scripts/playerCards.mjs'

const template = `<!doctype html><html><head><title>Miniature GP</title>
<meta name="twitter:card" content="summary_large_image" />
<meta property="og:title" content="Old title" />
<meta name="description" content="Old description" />
<script type="module" src="/assets/main-hash.js"></script>
<link rel="stylesheet" href="/assets/main-hash.css" /></head>
<body><div id="root"></div></body></html>`
const seasons = [
  { year: 2025, races: [{ circuit: 'Monza', grandPrix: 'Italian Grand Prix', location: 'Monza' }] },
  { year: 2024, races: [{ circuit: 'Monte Carlo', grandPrix: 'Monaco Grand Prix', location: 'Monaco' }] },
]

it('generates one crawlable static player page for each specific race', () => {
  const pages = createPlayerPages(template, seasons, { twitterSite: '@example' })
  expect(pages.map((page) => page.fileName)).toEqual(['embed/2025/monza/index.html', 'embed/2024/monte-carlo/index.html'])
  const html = pages[0].source
  expect(html).toContain('<title>Italian Grand Prix 2025 | Miniature GP</title>')
  expect(html).toContain('<meta name="twitter:card" content="player" />')
  expect(html).toContain('<meta name="twitter:site" content="@example" />')
  expect(html).toContain('<meta name="twitter:player" content="https://minigp.cc/embed/2025/monza/" />')
  expect(html).toContain('<meta name="twitter:player:width" content="516" />')
  expect(html).toContain('<meta name="twitter:player:height" content="516" />')
  expect(html).toContain('<meta name="twitter:image" content="https://minigp.cc/miniature-gp.png" />')
  expect(html).toContain('src="/assets/main-hash.js"')
  expect(html).toContain('href="/assets/main-hash.css"')
  expect(html).toContain('<noscript>')
  expect(html).not.toMatch(/summary_large_image|Old title|Old description/)
  expect(pages[1].source).toContain('https://minigp.cc/embed/2024/monte-carlo/')
})

it('escapes race text and uses the configured HTTPS host for every public URL', () => {
  const pages = createPlayerPages(template, [{ year: 2025, races: [{ circuit: 'São Paulo', grandPrix: 'Race <"&\'>', location: 'Test' }] }], { siteUrl: 'https://replays.example.com' })
  expect(pages[0].fileName).toBe('embed/2025/sao-paulo/index.html')
  expect(pages[0].source).toContain('Race &lt;&quot;&amp;&#39;&gt;')
  expect(pages[0].source).toContain('https://replays.example.com/embed/2025/sao-paulo/')
  expect(pages[0].source).not.toContain('https://minigp.cc')
  expect(pages[0].source).toContain('<meta name="twitter:site" content="@sergionoodle" />')
})

it('rejects insecure URLs, non-origin URLs and invalid X handles', () => {
  for (const siteUrl of ['http://example.com', 'https://example.com/path', 'https://user:password@example.com', 'https://example.com/?a=b']) {
    expect(() => createPlayerPages(template, seasons, { siteUrl })).toThrow('HTTPS site origin')
  }
  expect(() => createPlayerPages(template, seasons, { twitterSite: 'example' })).toThrow('X handle')
})
