// The Grand Tour: the stops in order (ids only; names, captions and positions come from objects.json).
export const TOUR_STOPS = ['sun', 'earth', 'moon', 'jupiter', 'saturn', 'orion_nebula', 'pleiades']

/** The caption at a stop: the first sentence of the object's summary in objects.json. */
export function tourCaption(obj) {
  const m = obj.summary.match(/^.*?[.!?](?=\s|$)/)
  return m ? m[0] : obj.summary
}
