// Whether to animate. Every glide, packet and fade in the blocks asks first, so a reader who asked for less motion
// sees each change land at once. A board's own `motion: reduced` ask (enhancement #7, readBlocks.ts → Blocks.tsx)
// joins that answer through the scope below: either ask — the reader's system or the model's word — stills the
// board. The floor is one-way: the model's word can only ADD stillness, never take the reader's ask away.

import { createContext, useContext } from "react";

/** The board's motion word as a preference the drawing side consults. "full" is what boards drew before the
 *  word existed, so it is also the default for every subtree without a Blocks.tsx above it. */
export type MotionPref = "full" | "reduced";

export const MotionScope = createContext<MotionPref>("full");

/** True when the reader's system asks for reduced motion (or there is no way to ask, as in tests: then false). */
export function lessMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when this board should settle at once: the reader's system asks for less motion, or the model's word for
 *  this board says reduced. Call this where a drawing decides to animate; it stays honest in both directions.
 *  The context is read on EVERY render, never short-circuited behind the OS ask: consumers (Flow, Layers, Piles)
 *  hold state and effect hooks after this one, and a skipped useContext across a system preference change would
 *  shift those hook slots. Both answers are read first, combined after. */
export function useLessMotion(): boolean {
  const word = useContext(MotionScope);
  return lessMotion() || word === "reduced";
}
