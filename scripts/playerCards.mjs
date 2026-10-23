import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { URL } from 'node:url'
import { racePath, routeFromPath } from '../src/raceRoutes.ts'

const PLAYER_SIZE = 516
const DEFAULT_SITE_URL = 'https://minigp.cc'
const DEFAULT_TWITTER_SITE = '@sergionoodle'
const EMBED_MODES = ['default', 'wireframe']

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

/** Generate complete HTML pages so card crawlers never need to execute JavaScript. */
export function createPlayerPages(template, seasons, options = {}) {
  const site = new URL(options.siteUrl ?? DEFAULT_SITE_URL)
  const twitterSite = options.twitterSite ?? DEFAULT_TWITTER_SITE
  if (site.protocol !== 'https:' || site.pathname !== '/' || site.search || site.hash || site.username || site.password) {
    throw new Error('Player Cards require an HTTPS site origin, such as https://minigp.cc.')
  }
  if (!/^@[a-zA-Z0-9_]{1,15}$/.test(twitterSite)) {
    throw new Error('The Player Card twitter:site must be an X handle, including @.')
  }

  const shell = template
    .replace(/\s*<meta\s+(?:name|property)="(?:twitter:[^"]+|og:[^"]+|description)"[^>]*>/g, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/g, '')

  return seasons.flatMap(({ year, races }) => races.flatMap((race) => EMBED_MODES.map((mode) => {
    const embedPath = racePath(year, race, true, mode)
    const playerUrl = new URL(embedPath, site).href
    const replayUrl = new URL(racePath(year, race), site).href
    const title = `${race.grandPrix} ${year} | Miniature GP`
    const description = `Replay the ${year} ${race.grandPrix} at ${race.location} in miniature 3D. Follow drivers, explore the circuit and control the replay.`
    const imageUrl = new URL('/miniature-gp.png', site).href
    const metadata = [
      `<link rel="canonical" href="${escapeHtml(playerUrl)}" />`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      '<meta name="twitter:card" content="player" />',
      `<meta name="twitter:site" content="${escapeHtml(twitterSite)}" />`,
      `<meta name="twitter:player" content="${escapeHtml(playerUrl)}" />`,
      `<meta name="twitter:player:width" content="${PLAYER_SIZE}" />`,
      `<meta name="twitter:player:height" content="${PLAYER_SIZE}" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
      '<meta name="twitter:image:alt" content="Miniature GP 3D race replay" />',
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${escapeHtml(playerUrl)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    ].join('\n    ')
    const source = shell
      .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
      .replace('</head>', () => `    ${metadata}\n  </head>`)
      .replace('<div id="root"></div>', () => `<div id="root"></div>\n    <noscript><p>${escapeHtml(title)}. Enable JavaScript for the interactive replay, or <a href="${escapeHtml(replayUrl)}" target="_blank" rel="noopener noreferrer">open Miniature GP</a>.</p></noscript>`)
    return { fileName: `${embedPath.slice(1)}index.html`, source }
  })))
}

function readSeasons(publicDirectory) {
  const years = JSON.parse(readFileSync(join(publicDirectory, 'data/years.json'), 'utf8'))
  return years.map((year) => ({
    year,
    races: JSON.parse(readFileSync(join(publicDirectory, `data/${year}/races-${year}.json`), 'utf8')),
  }))
}

export function playerCards(options = {}) {
  let rootDirectory = ''
  let publicDirectory = ''
  return {
    name: 'miniature-gp-player-cards',
    enforce: 'post',
    configResolved(config) {
      rootDirectory = config.root
      publicDirectory = config.publicDir
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith('/embed/') && !pathname.startsWith('/wireframe/')) return next()
        try {
          const route = routeFromPath(pathname)
          const template = readFileSync(join(rootDirectory, 'index.html'), 'utf8')
          const seasons = readSeasons(publicDirectory)
          const page = route && createPlayerPages(template, seasons, options)
            .find((candidate) => candidate.fileName === `${racePath(route.year, { circuit: route.circuitSlug }, true, route.mode).slice(1)}index.html`)
          if (!page) {
            response.statusCode = 404
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            response.end('<!doctype html><title>Race not found</title><p>This race is not available. <a href="/">Open Miniature GP</a>.</p>')
            return
          }
          const html = await server.transformIndexHtml(pathname, page.source)
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(html)
        } catch (cause) {
          next(cause)
        }
      })
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle['index.html']
        if (!entry || entry.type !== 'asset' || typeof entry.source !== 'string') {
          throw new Error('The compiled index.html is missing; Player Cards could not be generated.')
        }
        const pages = createPlayerPages(entry.source, readSeasons(publicDirectory), options)
        for (const page of pages) this.emitFile({ type: 'asset', ...page })
      },
    },
  }
}
