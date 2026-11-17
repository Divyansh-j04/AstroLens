import { create } from 'zustand'
import { askChat, classifyImage, SLOW_AFTER_MS, UploadError } from './api'

export const GENERAL_CHAT = '_general' // conversation key when no object is selected
const HISTORY_SENT = 4 // earlier messages sent with a question, so follow-ups make sense
let uploadId = 0 // only the latest upload may update the page
// "?app" in the address skips the landing page (used by the browser check scripts).
const SKIP_LANDING = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('app')

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
  browserOpen: false, // the right-side object list (drawer)
  uploadPanelOpen: false, // the translucent upload panel next to the pill
  entered: SKIP_LANDING, // false while the landing page is shown
  arrived: null, // id of the nebula or cluster just flown to (shows the "it's 3D" hint), else null

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
  clearUpload: () => {
    uploadId++ // ignore an answer still on its way
    const old = get().upload.previewUrl
    if (old) URL.revokeObjectURL(old)
    set((s) => ({
      upload: { status: 'idle', error: null, previewUrl: null, slow: false },
      prediction: null,
      panelView: ['unknown', 'guesses'].includes(s.panelView) ? 'card' : s.panelView,
      panelOpen: ['unknown', 'guesses'].includes(s.panelView) ? Boolean(s.currentObjectId) && s.panelOpen : s.panelOpen,
    }))
  },
  openChat: () => set({ panelOpen: true, panelView: 'chat' }),
  setBrowserOpen: (browserOpen) => set({ browserOpen }),
  setArrived: (arrived) => set({ arrived }),
  setUploadPanelOpen: (uploadPanelOpen) => set({ uploadPanelOpen }),
  // Leave the landing page for one of its three doors: 'photo', 'chat' or 'explore'.
  enterApp: (door) =>
    set(() => ({
      entered: true,
      ...(door === 'chat' ? { panelOpen: true, panelView: 'chat' } : {}),
      ...(door === 'explore' ? { browserOpen: true } : {}),
      ...(door === 'photo' ? { uploadPanelOpen: true } : {}),
    })),
  showLanding: () => set({ entered: false, browserOpen: false, uploadPanelOpen: false }),

  // Classify a photo: used by the upload pill and by the landing page's photo card.
  uploadPhoto: async (file) => {
    if (!file) return
    const id = ++uploadId
    const old = get().upload.previewUrl
    if (old) URL.revokeObjectURL(old)
    set({ upload: { status: 'loading', error: null, slow: false, previewUrl: URL.createObjectURL(file) }, uploadPanelOpen: true })
    const slowTimer = setTimeout(() => id === uploadId && get().setUpload({ slow: true }), SLOW_AFTER_MS)
    try {
      const result = await classifyImage(file)
      if (id !== uploadId) return
      get().applyPrediction(result)
      get().setUpload({ status: 'done', slow: false })
    } catch (err) {
      if (id !== uploadId) return
      const message = err instanceof UploadError ? err.message : 'Something went wrong while classifying that photo.'
      get().setUpload({ status: 'error', error: message, slow: false })
    } finally {
      clearTimeout(slowTimer)
    }
  },

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
