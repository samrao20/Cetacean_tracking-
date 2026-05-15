'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronUp, Download } from 'lucide-react'
import type { Species, Sighting } from '@/lib/types'
import { formatDate, sightingsToCSV } from '@/lib/utils'

const IUCN_BADGE: Record<string, string> = {
  'Least Concern': 'bg-green-100 text-green-800',
  'Near Threatened': 'bg-yellow-100 text-yellow-800',
  Vulnerable: 'bg-orange-100 text-orange-800',
  Endangered: 'bg-red-100 text-red-800',
  'Critically Endangered': 'bg-red-200 text-red-900',
  'Data Deficient': 'bg-gray-100 text-gray-600',
}

interface Props {
  species: Species
  sightings: Sighting[]
}

export function SpeciesDetail({ species, sightings }: Props) {
  const [showRaw, setShowRaw] = useState(false)

  const sortedSightings = [...sightings].sort((a, b) =>
    b.date.localeCompare(a.date)
  )

  const downloadCSV = () => {
    const csv = sightingsToCSV(sightings)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${species.slug}-sightings.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Back link */}
      <div className="max-w-3xl mx-auto px-6 pt-6">
        <Link
          href="/map"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy transition-colors"
        >
          <ArrowLeft size={14} />
          Back to map
        </Link>
      </div>

      {/* Hero band */}
      <div
        className="mt-4 py-14 px-6"
        style={{ backgroundColor: `${species.color}28` }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="font-display text-4xl font-semibold text-navy leading-tight">
              {species.common}
            </h1>
            <span
              className={`mt-2 px-2.5 py-1 text-xs font-medium rounded-full ${IUCN_BADGE[species.iucnStatus] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {species.iucnStatus}
            </span>
          </div>
          <p className="mt-1.5 text-lg italic text-gray-500">{species.scientific}</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-gray-400">
            {species.category}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        {/* ID features */}
        <section>
          <h2 className="font-display text-2xl font-semibold text-navy mb-4">
            Identification features
          </h2>
          <ul className="space-y-2.5">
            {species.idFeatures.map((feature, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: species.color }}
                />
                {feature}
              </li>
            ))}
          </ul>
        </section>

        {/* Behaviour */}
        <section>
          <h2 className="font-display text-2xl font-semibold text-navy mb-4">
            Behaviour &amp; ecology
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed">{species.behaviour}</p>
        </section>

        {/* Distribution placeholder */}
        <section>
          <h2 className="font-display text-2xl font-semibold text-navy mb-4">
            Distribution in the Maldives
          </h2>
          <div className="rounded-xl border border-sand bg-sand/30 h-48 flex items-center justify-center">
            <span className="text-sm text-gray-400">Distribution map coming soon</span>
          </div>
        </section>

        {/* Sightings timeline */}
        <section>
          <h2 className="font-display text-2xl font-semibold text-navy mb-4">
            Sightings ({sightings.length})
          </h2>
          {sortedSightings.length === 0 ? (
            <p className="text-sm text-gray-500">No sightings recorded yet.</p>
          ) : (
            <ul className="divide-y divide-sand">
              {sortedSightings.map((s) => (
                <li
                  key={s.id}
                  className="py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"
                >
                  <span className="text-navy font-medium">{formatDate(s.date)}</span>
                  <span className="text-gray-600">{s.atoll}</span>
                  <span className="text-gray-400">
                    {s.groupSize != null ? `${s.groupSize} individuals` : '—'}
                  </span>
                  <span className="text-gray-400">{s.observer}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Raw data */}
        {sightings.length > 0 && (
          <section className="pb-10">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-navy transition-colors"
            >
              {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showRaw ? 'Hide' : 'View'} raw data
            </button>

            {showRaw && (
              <div className="mt-4">
                <div className="overflow-x-auto rounded-xl border border-sand">
                  <table className="min-w-full text-xs divide-y divide-sand">
                    <thead>
                      <tr className="bg-sand/40">
                        {['Date', 'Atoll', 'Lat', 'Lng', 'Observer', 'Group', 'Behaviour'].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-3 py-2.5 text-left font-medium text-gray-600 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand/60 bg-white">
                      {sortedSightings.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {formatDate(s.date)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{s.atoll}</td>
                          <td className="px-3 py-2 text-gray-500">{s.lat.toFixed(4)}</td>
                          <td className="px-3 py-2 text-gray-500">{s.lng.toFixed(4)}</td>
                          <td className="px-3 py-2 text-gray-700">{s.observer}</td>
                          <td className="px-3 py-2 text-gray-500">{s.groupSize ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-xs truncate">
                            {s.behaviour ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={downloadCSV}
                  className="mt-3 flex items-center gap-2 text-sm text-navy font-medium hover:text-coral transition-colors"
                >
                  <Download size={14} />
                  Download CSV
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
