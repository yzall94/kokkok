import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '콕콕',
    short_name: '콕콕',
    description: '익명으로 상대방에게 마음을 전하는 서비스',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F2F2F7',
    theme_color: '#F9F9F9',
    orientation: 'portrait' as const,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
