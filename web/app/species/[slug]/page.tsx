import { notFound } from 'next/navigation'
import speciesData from '@/data/species.json'
import sightingsData from '@/data/sightings.json'
import { SpeciesDetail } from '@/components/species/SpeciesDetail'
import type { Species, Sighting } from '@/lib/types'

export async function generateStaticParams() {
  return (speciesData as Species[]).map((s) => ({ slug: s.slug }))
}

export default function SpeciesPage({ params }: { params: { slug: string } }) {
  const sp = (speciesData as Species[]).find((s) => s.slug === params.slug)
  if (!sp) notFound()

  const sightings = (sightingsData as Sighting[]).filter(
    (s) => s.species === params.slug
  )

  return <SpeciesDetail species={sp} sightings={sightings} />
}
