// How visible each scene mode is, from 0 (hidden) to 1 (shown).
// GSAP animates these numbers during a mode switch and the scene reads them every frame.
// They change 60 times a second, so they live here rather than in the Zustand store.
export const fade = { solar: 1, deep: 0 }
