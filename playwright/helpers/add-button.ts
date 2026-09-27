// Accessible name of an "Add to order" button in either state: it reads
// "Added" for ~2s after a click (frontend/src/lib/addedFlash.ts). Matching
// both keeps `.nth(i)` pointing at the same product while one is flashing.
export const ADD_BUTTON = /add to order|^added$/i;
