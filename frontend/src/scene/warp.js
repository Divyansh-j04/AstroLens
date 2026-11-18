// Warp-speed effect strength, from 0 (off) to 1 (full): stars stretch into streaks, the view widens
// a little and the screen edges darken. GSAP animates it during long flights (CameraRig.jsx); the
// star shader and the edge overlay read it every frame. It changes 60 times a second, so like
// fade.js it lives here rather than in the Zustand store.
export const warp = { value: 0 }
