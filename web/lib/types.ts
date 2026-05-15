export interface Sighting {
  id: string
  species: string
  speciesCommon: string
  speciesScientific: string
  date: string
  lat: number
  lng: number
  atoll: string
  observer: string
  groupSize: number | null
  behaviour: string | null
  photoUrl: string | null
}

export interface Species {
  slug: string
  common: string
  scientific: string
  category: 'dolphin' | 'whale'
  iucnStatus: string
  idFeatures: string[]
  behaviour: string
  color: string
}

export type Filters = {
  species: Set<string>
  atoll: string
  dateFrom: string
  dateTo: string
  heatmap: boolean
}
