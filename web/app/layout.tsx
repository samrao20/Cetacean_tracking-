import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Koamas — Maldives Cetacean Sightings',
  description: 'Track dolphin and whale sightings across the Maldives.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-navy font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
