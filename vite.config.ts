import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { playerCards } from './scripts/playerCards.mjs'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', 'VITE_')
  return {
    plugins: [tailwindcss(), playerCards({
      siteUrl: environment.VITE_PUBLIC_SITE_URL,
      twitterSite: environment.VITE_TWITTER_SITE,
    })],
  }
})
