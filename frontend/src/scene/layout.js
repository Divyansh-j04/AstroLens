// How the deep-space distances are drawn, from 0 (square-root scale, the default) to 1 (true,
// linear distances). GSAP animates it when the "True distances" switch flips, and the scene reads
// it every frame, so it lives here rather than in the Zustand store (like fade.js).
export const layout = { t: 0 }
