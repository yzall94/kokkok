declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      params?: Record<string, unknown>
    ) => void
    dataLayer: Record<string, unknown>[]
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

export function pageview(url: string): void {
  if (!isClient() || !GA_ID) return
  window.gtag('config', GA_ID, { page_path: url })
}

export function event(
  action: string,
  params?: Record<string, unknown>
): void {
  if (!isClient() || !GA_ID) return
  window.gtag('event', action, params)
}

export function trackScreen(screenName: string, screenPath: string): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: 'screen_view',
    screen_name: screenName,
    screen_path: screenPath,
  })
}
