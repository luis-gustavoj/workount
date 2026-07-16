import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom implements neither of these, but Radix's Select (first used by the
// exercise picker, ticket 008) calls them on pointer interaction.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no ResizeObserver, but @dnd-kit/dom (first used by the workout
// and exercise list drag-reorder, tickets 007/009) constructs one at import
// time — a no-op stub is enough since layout tests don't drive real drags.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no matchMedia, but RestSheet (ticket 023) reads
// `prefers-reduced-motion` on every mount — a default "no preference" stub
// keeps every other test that renders the session player from crashing;
// individual tests can still override it with vi.spyOn to simulate reduced
// motion.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
