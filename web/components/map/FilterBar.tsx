'use client'

import { useMemo } from 'react'
import type { Sighting, Species, Filters } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  sightings: Sighting[]
  species: Species[]
  filters: Filters
  onChange: (f: Filters) => void
}

export function FilterBar({ sightings, species, filters, onChange }: Props) {
  const speciesWithCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sightings) counts[s.species] = (counts[s.species] ?? 0) + 1
    return species
      .filter((sp) => (counts[sp.slug] ?? 0) > 0)
      .map((sp) => ({ ...sp, count: counts[sp.slug] ?? 0 }))
  }, [sightings, species])

  const atolls = useMemo(
    () => Array.from(new Set(sightings.map((s) => s.atoll))).sort(),
    [sightings]
  )

  const isActive =
    filters.species.size > 0 ||
    filters.atoll !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.heatmap

  const toggleSpecies = (slug: string) => {
    const next = new Set(filters.species)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    onChange({ ...filters, species: next })
  }

  const clear = () =>
    onChange({ species: new Set(), atoll: '', dateFrom: '', dateTo: '', heatmap: false })

  return (
    <div className="bg-navy/90 backdrop-blur-sm rounded-xl px-4 py-3 flex flex-wrap gap-2 items-center shadow-lg">
      {/* Species chips */}
      <div className="flex flex-wrap gap-1.5 overflow-x-auto">
        {speciesWithCounts.map((sp) => {
          const active = filters.species.has(sp.slug)
          return (
            <button
              key={sp.slug}
              onClick={() => toggleSpecies(sp.slug)}
              aria-pressed={active}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                active ? 'text-white shadow-sm' : 'bg-white/10 text-white/70 hover:bg-white/20'
              )}
              style={active ? { backgroundColor: sp.color } : undefined}
            >
              {sp.common} ({sp.count})
            </button>
          )
        })}
      </div>

      <div className="h-4 w-px bg-white/20 hidden sm:block" />

      {/* Atoll */}
      <select
        value={filters.atoll}
        onChange={(e) => onChange({ ...filters, atoll: e.target.value })}
        aria-label="Filter by atoll"
        className="bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/20 outline-none hover:bg-white/20 cursor-pointer"
      >
        <option value="">All atolls</option>
        {atolls.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      {/* Date range */}
      <label className="sr-only" htmlFor="date-from">From date</label>
      <input
        id="date-from"
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        className="bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/20 outline-none hover:bg-white/20 cursor-pointer"
      />
      <label className="sr-only" htmlFor="date-to">To date</label>
      <input
        id="date-to"
        type="date"
        value={filters.dateTo}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        className="bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/20 outline-none hover:bg-white/20 cursor-pointer"
      />

      {/* Heatmap toggle */}
      <button
        onClick={() => onChange({ ...filters, heatmap: !filters.heatmap })}
        aria-pressed={filters.heatmap}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
          filters.heatmap
            ? 'bg-coral text-white'
            : 'bg-white/10 text-white/70 hover:bg-white/20'
        )}
      >
        Heatmap
      </button>

      {/* Clear */}
      {isActive && (
        <button
          onClick={clear}
          className="px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          Clear
        </button>
      )}
    </div>
  )
}
