import sightingsData from '@/data/sightings.json'
import speciesData from '@/data/species.json'
import { MapClient } from '@/components/map/MapClient'
import type { Sighting, Species } from '@/lib/types'

export default function MapPage() {
  return (
    <MapClient
      sightings={sightingsData as Sighting[]}
      species={speciesData as Species[]}
    />
  )
}
