export const circuitSlug = (circuit: string) => circuit
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

export const routeFromPath = (pathname: string) => {
  const match = pathname.match(/^\/(embed\/)?(\d{4})\/([a-z0-9-]+)(?:\/index\.html|\/)?$/)
  return match ? { year: Number(match[2]), circuitSlug: match[3], isEmbed: Boolean(match[1]) } : null
}

export const racePath = (year: number, race: { circuit: string }, isEmbed = false) =>
  `${isEmbed ? '/embed' : ''}/${year}/${circuitSlug(race.circuit)}${isEmbed ? '/' : ''}`
