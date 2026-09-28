// Race dates are ISO days (YYYY-MM-DD), so they order correctly as strings.
export function nextRaceAfter<Race extends { date: string }>(races: Race[], current: { date: string }): Race | null {
  return races
    .filter((race) => race.date > current.date)
    .reduce<Race | null>((earliest, race) => !earliest || race.date < earliest.date ? race : earliest, null)
}

export function nextSeason(years: number[], year: number): number | null {
  const later = years.filter((candidate) => candidate > year)
  return later.length ? Math.min(...later) : null
}
