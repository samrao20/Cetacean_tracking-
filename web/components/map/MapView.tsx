'use client'

import { useRef, useCallback, useMemo, useState } from 'react'
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Sighting, Species } from '@/lib/types'

const MAP_STYLE = `https://api.maptiler.com/maps/ocean/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`

interface HoverInfo {
  speciesCommon: string
  date: string
  longitude: number
  latitude: number
}

interface Props {
  sightings: Sighting[]
  species: Species[]
  heatmap: boolean
  onSightingClick: (s: Sighting) => void
}

export function MapView({ sightings, species, heatmap, onSightingClick }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)

  const geojson = useMemo(() => {
    const colorMap: Record<string, string> = {}
    for (const sp of species) colorMap[sp.slug] = sp.color

    return {
      type: 'FeatureCollection' as const,
      features: sightings.map((s) => ({
        type: 'Feature' as const,
        id: s.id,
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat] as [number, number],
        },
        properties: {
          id: s.id,
          species: s.species,
          speciesCommon: s.speciesCommon,
          speciesScientific: s.speciesScientific,
          date: s.date,
          lat: s.lat,
          lng: s.lng,
          atoll: s.atoll,
          observer: s.observer,
          groupSize: s.groupSize,
          behaviour: s.behaviour,
          photoUrl: s.photoUrl,
          color: colorMap[s.species] ?? '#888888',
        },
      })),
    }
  }, [sightings, species])

  // Build MapLibre match expression for circle colour
  const colorMatchExpr = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expr: any[] = ['match', ['get', 'species']]
    for (const sp of species) expr.push(sp.slug, sp.color)
    expr.push('#888888')
    return expr
  }, [species])

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature?.properties) return
      const p = feature.properties
      onSightingClick({
        id: p.id,
        species: p.species,
        speciesCommon: p.speciesCommon,
        speciesScientific: p.speciesScientific,
        date: p.date,
        lat: p.lat,
        lng: p.lng,
        atoll: p.atoll,
        observer: p.observer,
        groupSize: p.groupSize,
        behaviour: p.behaviour,
        photoUrl: p.photoUrl,
      })
    },
    [onSightingClick]
  )

  const onMouseEnter = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature?.properties) return
    const coords = (feature.geometry as GeoJSON.Point).coordinates
    setHoverInfo({
      speciesCommon: feature.properties.speciesCommon,
      date: feature.properties.date,
      longitude: coords[0],
      latitude: coords[1],
    })
    mapRef.current?.getCanvas().style.setProperty('cursor', 'pointer')
  }, [])

  const onMouseLeave = useCallback(() => {
    setHoverInfo(null)
    mapRef.current?.getCanvas().style.setProperty('cursor', '')
  }, [])

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 73.2207, latitude: 3.2028, zoom: 6 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={heatmap ? [] : ['sightings']}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Source id="sightings" type="geojson" data={geojson}>
          {heatmap ? (
            <Layer
              id="sightings-heat"
              type="heatmap"
              paint={{
                'heatmap-weight': 1,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3] as any,
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(33,102,172,0)',
                  0.2, '#67a9cf',
                  0.4, '#d1e5f0',
                  0.6, '#fddbc7',
                  0.8, '#ef8a62',
                  1, '#b2182b',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ] as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 9, 40] as any,
                'heatmap-opacity': 0.8,
              }}
            />
          ) : (
            <Layer
              id="sightings"
              type="circle"
              paint={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 9] as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'circle-color': colorMatchExpr as any,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 0.9,
              }}
            />
          )}
        </Source>

        {hoverInfo && (
          <Popup
            longitude={hoverInfo.longitude}
            latitude={hoverInfo.latitude}
            closeButton={false}
            anchor="bottom"
            offset={12}
            className="!p-0"
          >
            <div className="px-3 py-2 text-sm rounded-lg">
              <div className="font-medium text-navy">{hoverInfo.speciesCommon}</div>
              <div className="text-xs text-gray-500">
                {new Date(hoverInfo.date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {sightings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-6 py-4 text-center shadow-lg">
            <p className="font-display text-lg text-navy">No sightings match your filters</p>
            <p className="text-sm text-gray-500 mt-1">
              Try adjusting or clearing the filters above
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
