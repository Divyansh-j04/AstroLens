import { create } from 'zustand'

// The single shared store for the page (Zustand). Every component reads from here.
export const useStore = create((set) => ({
  mode: 'solar_system', // which scene the camera is in: 'solar_system' or 'deep_space'
  currentObjectId: null, // id from objects.json, or null at the overview
  isFlying: false, // true while the camera animation runs; mouse controls are locked
  panelOpen: false, // glass panel shown or collapsed
  panelView: 'card', // 'card', 'chat', 'guesses' (top-3 list) or 'unknown' (not one of the known objects)
  prediction: null, // last /classify answer: { top3, is_unknown, threshold, known_classes, gradcam_png_base64, latency_ms }
  flyRequest: 0, // counts fly requests, so "Home" or the same object can be asked for twice
  upload: { status: 'idle', error: null, previewUrl: null, slow: false }, // status: idle | loading | done | error

  selectObject: (id) =>
    set((s) => ({ currentObjectId: id, panelOpen: true, panelView: 'card', flyRequest: s.flyRequest + 1 })),
  goHome: () =>
    set((s) => ({ currentObjectId: null, panelOpen: false, panelView: 'card', flyRequest: s.flyRequest + 1 })),
  setMode: (mode) => set({ mode }),
  setFlying: (isFlying) => set({ isFlying }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setPanelView: (panelView) => set({ panelView }),
  setUpload: (patch) => set((s) => ({ upload: { ...s.upload, ...patch } })),

  // A classifier answer: fly to the top guess and open its card, or, if it is "unknown",
  // keep the camera where it is and show the unknown message with the closest guesses.
  applyPrediction: (prediction) =>
    set((s) =>
      prediction.is_unknown
        ? { prediction, panelOpen: true, panelView: 'unknown' }
        : {
            prediction,
            currentObjectId: prediction.top3[0].id,
            panelOpen: true,
            panelView: 'card',
            flyRequest: s.flyRequest + 1,
          },
    ),
}))
