'use client'

import { useState, useMemo, useCallback } from 'react'
import type { Sighting, Species, Filters } from '@/lib/types'
import { MapView } from './MapView'
import { FilterBar } from './FilterBar'
import { SidePanel } from './SidePanel'

interface Props {
  sightings: Sighting[]
  species: Species[]
}

const DEFAULT_FILTERS: Filters = {
  species: new Set(),
  atoll: '',
  dateFrom: '',
  dateTo: '',
  heatmap: false,
}

export function MapClient({ sightings, species }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null)

  const filteredSightings = useMemo(() => {
    return sightings.filter((s) => {
      if (filters.species.size > 0 && !filters.species.has(s.species)) return false
      if (filters.atoll && s.atoll !== filters.atoll) return false
      if (filters.dateFrom && s.date < filters.dateFrom) return false
      if (filters.dateTo && s.date > filters.dateTo + 'T23:59:59Z') return false
      return true
    })
  }, [sightings, filters])

  const handleSightingClick = useCallback((sighting: Sighting) => {
    setSelectedSighting(sighting)
  }, [])

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <MapView
        sightings={filteredSightings}
        species={species}
        heatmap={filters.heatmap}
        onSightingClick={handleSightingClick}
      />

      <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <FilterBar
            sightings={sightings}
            species={species}
            filters={filters}
            onChange={setFilters}
          />
        </div>
      </div>

      <SidePanel
        sighting={selectedSighting}
        species={species}
        onClose={() => setSelectedSighting(null)}
      />
    </div>
  )
}
