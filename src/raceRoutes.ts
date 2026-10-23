export const circuitSlug = (circuit: string) => circuit
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

export const routeFromPath = (pathname: string) => {
  const match = pathname.match(/^\/(?:(embed|wireframe)\/)?(\d{4})\/([a-z0-9-]+)(?:\/index\.html|\/)?$/)
  if (!match) return null
  return {
    year: Number(match[2]),
    circuitSlug: match[3],
    isEmbed: Boolean(match[1]),
    ...(match[1] === 'wireframe' ? { mode: 'wireframe' as const } : {}),
  }
}

export const racePath = (
  year: number,
  race: { circuit: string },
  isEmbed = false,
  mode: 'default' | 'wireframe' = 'default',
) => {
  const embedPrefix = mode === 'wireframe' ? '/wireframe' : '/embed'
  const prefix = isEmbed ? embedPrefix : ''
  return `${prefix}/${year}/${circuitSlug(race.circuit)}${isEmbed ? '/' : ''}`
}
