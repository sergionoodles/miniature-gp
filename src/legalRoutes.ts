export type LegalPageName = 'terms' | 'privacy'

export function resolveLegalPage(pathname: string): LegalPageName | null {
  if (pathname === '/terms' || pathname === '/terms/') return 'terms'
  if (pathname === '/privacy' || pathname === '/privacy/') return 'privacy'
  return null
}
