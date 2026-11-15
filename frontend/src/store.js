import { create } from 'zustand'

// The single shared store for the page (Zustand). Every component reads from here.
export const useStore = create((set) => ({
  mode: 'solar_system', // which scene the camera is in: 'solar_system' or 'deep_space'
  currentObjectId: null, // id from objects.json, or null at the overview
  isFlying: false, // true while the camera animation runs; mouse controls are locked
  panelOpen: false, // glass panel shown or collapsed
  panelView: 'card', // 'card' or 'chat'
  prediction: null, // classifier result ({ top3, is_unknown, ... }), set from Phase 3
  flyRequest: 0, // counts fly requests, so "Home" or the same object can be asked for twice

  selectObject: (id) =>
    set((s) => ({ currentObjectId: id, panelOpen: true, panelView: 'card', flyRequest: s.flyRequest + 1 })),
  goHome: () =>
    set((s) => ({ currentObjectId: null, panelOpen: false, panelView: 'card', flyRequest: s.flyRequest + 1 })),
  setMode: (mode) => set({ mode }),
  setFlying: (isFlying) => set({ isFlying }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setPanelView: (panelView) => set({ panelView }),
}))
