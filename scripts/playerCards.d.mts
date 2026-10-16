import type { Plugin } from 'vite'

type PlayerCardOptions = { siteUrl?: string; twitterSite?: string }
type Season = { year: number; races: { circuit: string; grandPrix: string; location: string }[] }

export function createPlayerPages(template: string, seasons: Season[], options?: PlayerCardOptions): { fileName: string; source: string }[]
export function playerCards(options?: PlayerCardOptions): Plugin
