export const FRAME_COLLECTIONS = [
  {
    "id": "frame-classic",
    "name": {
      "id": "Orbit Zyx",
      "en": "Orbit Zyx"
    },
    "src": "/gamification/collections/frames/orbit-zyx.webp",
    "collection": "Orbit Zyx",
    "motion": "orbit",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 5
  },
  {
    "id": "frame-detailed",
    "name": {
      "id": "Garuda Fajar",
      "en": "Garuda Fajar"
    },
    "src": "/gamification/collections/frames/garuda-fajar.webp",
    "collection": "Garuda Fajar",
    "motion": "shimmer",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 7
  },
  {
    "id": "frame-laurel",
    "name": {
      "id": "Samudra",
      "en": "Samudra"
    },
    "src": "/gamification/collections/frames/samudra.webp",
    "collection": "Samudra",
    "motion": "wave",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 6
  },
  {
    "id": "frame-circuit",
    "name": {
      "id": "Bara Komodo",
      "en": "Bara Komodo"
    },
    "src": "/gamification/collections/frames/bara-komodo.webp",
    "collection": "Bara Komodo",
    "motion": "flame",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 7
  },
  {
    "id": "frame-celestial",
    "name": {
      "id": "Wayang Kencana",
      "en": "Wayang Kencana"
    },
    "src": "/gamification/collections/frames/wayang-kencana.webp",
    "collection": "Wayang Kencana",
    "motion": "breeze",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 5
  },
  {
    "id": "frame-merah-putih",
    "name": {
      "id": "Merah Putih",
      "en": "Merah Putih"
    },
    "src": "/gamification/collections/frames/merah-putih.webp",
    "collection": "Merah Putih",
    "motion": "parade",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 4
  },
  {
    "id": "frame-borobudur",
    "name": {
      "id": "Borobudur",
      "en": "Borobudur"
    },
    "src": "/gamification/collections/frames/borobudur.webp",
    "collection": "Borobudur",
    "motion": "shimmer",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 8
  },
  {
    "id": "frame-khatulistiwa",
    "name": {
      "id": "Khatulistiwa",
      "en": "Khatulistiwa"
    },
    "src": "/gamification/collections/frames/khatulistiwa.webp",
    "collection": "Khatulistiwa",
    "motion": "orbit",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 6
  },
  {
    "id": "frame-anggrek",
    "name": {
      "id": "Anggrek Rimba",
      "en": "Anggrek Rimba"
    },
    "src": "/gamification/collections/frames/anggrek.webp",
    "collection": "Anggrek Rimba",
    "motion": "breeze",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 7
  },
  {
    "id": "frame-naga",
    "name": {
      "id": "Naga Obsidian",
      "en": "Naga Obsidian"
    },
    "src": "/gamification/collections/frames/naga.webp",
    "collection": "Naga Obsidian",
    "motion": "wave",
    "aperture": 0.8,
    "shape": "circle",
    "depth": 8
  }
] as const;

export type FrameCollection = (typeof FRAME_COLLECTIONS)[number];

export function getFrameCollection(id: string | null | undefined): FrameCollection | undefined {
  return FRAME_COLLECTIONS.find((entry) => entry.id === id);
}
