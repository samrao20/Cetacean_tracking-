'use client'

import { X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { Sighting, Species } from '@/lib/types'
import { cn, formatCoord, formatDateTime } from '@/lib/utils'

interface Props {
  sighting: Sighting | null
  species: Species[]
  onClose: () => void
}

export function SidePanel({ sighting, species, onClose }: Props) {
  const sp = sighting ? species.find((s) => s.slug === sighting.species) : null

  return (
    <>
      {/* Backdrop on mobile */}
      {sighting && (
        <div
          className="absolute inset-0 z-10 sm:hidden bg-black/30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Sighting details"
        className={cn(
          'absolute z-20 bg-white shadow-2xl transition-transform duration-300 ease-out',
          // Desktop: right side panel
          'sm:right-0 sm:top-0 sm:h-full sm:w-96',
          sighting ? 'sm:translate-x-0' : 'sm:translate-x-full',
          // Mobile: bottom sheet
          'bottom-0 left-0 right-0 sm:left-auto rounded-t-2xl sm:rounded-none',
          sighting ? 'translate-y-0' : 'translate-y-full sm:translate-y-0',
          'max-h-[70vh] sm:max-h-none'
        )}
      >
        {sighting && (
          <div className="h-full overflow-y-auto flex flex-col">
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <div>
                <h2 className="font-display text-xl font-semibold text-navy leading-tight">
                  {sighting.speciesCommon}
                </h2>
                <p className="text-sm italic text-gray-400 mt-0.5">
                  {sighting.speciesScientific}
                </p>
              </div>
              <button
                onClick={onClose}
                className="ml-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 flex-shrink-0"
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* Species colour band / photo */}
            <div
              className="h-36 flex items-center justify-center text-sm text-white/80 flex-shrink-0"
              style={{ backgroundColor: sp?.color ?? '#0a1628' }}
            >
              {sighting.photoUrl ? (
                <img
                  src={sighting.photoUrl}
                  alt={sighting.speciesCommon}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-lg">{sighting.speciesCommon}</span>
              )}
            </div>

            {/* Detail list */}
            <dl className="px-5 py-4 space-y-4 flex-1">
              <Detail label="Date & time" value={formatDateTime(sighting.date)} />
              <Detail label="Atoll" value={sighting.atoll} />
              <Detail
                label="Coordinates"
                value={`${formatCoord(sighting.lat)}° N, ${formatCoord(sighting.lng)}° E`}
              />
              <Detail label="Observer" value={sighting.observer} />
              <Detail
                label="Group size"
                value={sighting.groupSize != null ? String(sighting.groupSize) : 'Unknown'}
              />
              {sighting.behaviour && (
                <Detail label="Behaviour notes" value={sighting.behaviour} />
              )}
            </dl>

            {/* CTA */}
            <div className="px-5 pb-6 flex-shrink-0">
              <Link
                href={`/species/${sighting.species}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy/80 transition-colors"
              >
                Learn more about {sighting.speciesCommon}
                <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy leading-relaxed">{value}</dd>
    </div>
  )
}
