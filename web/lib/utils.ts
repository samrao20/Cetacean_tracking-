import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Sighting } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCoord(n: number): string {
  return n.toFixed(4)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Indian/Maldives',
  })
}

export function sightingsToCSV(sightings: Sighting[]): string {
  const headers = [
    'id',
    'species',
    'speciesCommon',
    'speciesScientific',
    'date',
    'lat',
    'lng',
    'atoll',
    'observer',
    'groupSize',
    'behaviour',
    'photoUrl',
  ]

  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = sightings.map((s) =>
    headers.map((h) => escape(s[h as keyof Sighting] as string | number | null)).join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}
