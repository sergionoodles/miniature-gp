const ANALYTICS_SCRIPT_URL = 'https://analytics.codingnoodles.com/script.js'
const ANALYTICS_SCRIPT_ID = 'umami-analytics'

type AnalyticsOptions = {
  isProduction: boolean
  websiteId: string | undefined
}

export function appendAnalyticsScript({ isProduction, websiteId }: AnalyticsOptions): void {
  if (!isProduction || !websiteId?.trim()) return

  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || privacyNavigator.globalPrivacyControl) return
  if (document.getElementById(ANALYTICS_SCRIPT_ID)) return

  const script = document.createElement('script')
  script.id = ANALYTICS_SCRIPT_ID
  script.src = ANALYTICS_SCRIPT_URL
  script.async = true
  script.referrerPolicy = 'no-referrer'
  script.setAttribute('data-website-id', websiteId.trim())
  script.setAttribute('data-do-not-track', 'true')
  script.setAttribute('data-exclude-search', 'true')
  script.setAttribute('data-exclude-hash', 'true')
  script.setAttribute('data-fetch-credentials', 'omit')
  document.head.appendChild(script)
}
