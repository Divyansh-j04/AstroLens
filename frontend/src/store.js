import { create } from 'zustand'
import { askChat, UploadError } from './api'

export const GENERAL_CHAT = '_general' // conversation key when no object is selected
const HISTORY_SENT = 4 // earlier messages sent with a question, so follow-ups make sense

// The single shared store for the page (Zustand). Every component reads from here.
export const useStore = create((set, get) => ({
  mode: 'solar_system', // which scene the camera is in: 'solar_system' or 'deep_space'
  currentObjectId: null, // id from objects.json, or null at the overview
  isFlying: false, // true while the camera animation runs; mouse controls are locked
  panelOpen: false, // glass panel shown or collapsed
  panelView: 'card', // 'card', 'chat', 'guesses' (top-3 list) or 'unknown' (not one of the known objects)
  prediction: null, // last /classify answer: { top3, is_unknown, threshold, known_classes, gradcam_png_base64, latency_ms }
  flyRequest: 0, // counts fly requests, so "Home" or the same object can be asked for twice
  upload: { status: 'idle', error: null, previewUrl: null, slow: false }, // status: idle | loading | done | error
  chats: {}, // one conversation per object id (or '_general'): [{ role, content, citations?, refused?, error? }]
  chatPending: false, // true while waiting for an answer

  selectObject: (id) =>
    set((s) => ({ currentObjectId: id, panelOpen: true, panelView: 'card', flyRequest: s.flyRequest + 1 })),
  goHome: () =>
    set((s) => ({ currentObjectId: null, panelOpen: false, panelView: 'card', flyRequest: s.flyRequest + 1 })),
  setMode: (mode) => set({ mode }),
  setFlying: (isFlying) => set({ isFlying }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setPanelView: (panelView) => set({ panelView }),
  setUpload: (patch) => set((s) => ({ upload: { ...s.upload, ...patch } })),
  // Remove the uploaded photo and everything that came from it (guesses, badge, heatmap).
  clearUpload: () =>
    set((s) => ({
      upload: { status: 'idle', error: null, previewUrl: null, slow: false },
      prediction: null,
      panelView: ['unknown', 'guesses'].includes(s.panelView) ? 'card' : s.panelView,
      panelOpen: ['unknown', 'guesses'].includes(s.panelView) ? Boolean(s.currentObjectId) && s.panelOpen : s.panelOpen,
    })),
  openChat: () => set({ panelOpen: true, panelView: 'chat' }),

  // Ask the chat about the current object (or in general), keeping one conversation per object.
  sendChat: async (text) => {
    const question = text.trim()
    const { currentObjectId, chats, chatPending } = get()
    if (!question || chatPending) return
    const key = currentObjectId ?? GENERAL_CHAT
    const before = chats[key] ?? []
    const history = before.filter((m) => !m.error).slice(-HISTORY_SENT).map(({ role, content }) => ({ role, content }))
    const add = (msg) => set((s) => ({ chats: { ...s.chats, [key]: [...(s.chats[key] ?? []), msg] } }))
    add({ role: 'user', content: question })
    set({ chatPending: true, panelOpen: true, panelView: 'chat' })
    try {
      const r = await askChat(question, currentObjectId, history)
      add({ role: 'assistant', content: r.answer, citations: r.citations, refused: r.refused, latencyMs: r.latency_ms })
    } catch (err) {
      add({ role: 'assistant', content: err instanceof UploadError ? err.message : 'Something went wrong.', error: true })
    } finally {
      set({ chatPending: false })
    }
  },

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
