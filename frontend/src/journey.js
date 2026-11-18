// The Journey: a scroll-driven story through the scene. Chapters in order (ids only; names, captions
// and distances come from objects.json). Between Saturn and the Orion Nebula the camera leaves the
// Solar System, which is where the warp happens.
// During the Journey the picture shifts to leave room for the chapter text (scene/ViewShift.jsx): the
// object moves right by 14% of the screen width on larger screens, or up by 16% of its height on phones.
export const JOURNEY_SHIFT = { x: 0.14, y: 0.16 }

export const JOURNEY = ['earth', 'moon', 'mars', 'jupiter', 'saturn', 'orion_nebula', 'pleiades']

/** A chapter's caption: the first sentence of the object's summary in objects.json. */
export function chapterCaption(obj) {
  const m = obj.summary.match(/^.*?[.!?](?=\s|$)/)
  return m ? m[0] : obj.summary
}
