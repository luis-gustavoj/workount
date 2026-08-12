import { cloneElement, isValidElement, type ReactNode } from "react";

/**
 * jsdom measures every element as 0×0, so Recharts' ResponsiveContainer —
 * which sizes itself from its parent — renders nothing at all. Handing its
 * child a fixed size makes the real SVG render, which is what lets the
 * analytics chart tests assert on marks (the record dot, the bars, the axis
 * ticks) rather than only on the table view beneath each chart.
 *
 * Used from a test as:
 *
 *   vi.mock("recharts", async (importOriginal) =>
 *     fixedSizeRecharts(importOriginal),
 *   );
 *
 * `vi.mock` is hoisted and its factory cannot close over test-file state, so
 * the factory stays in each file — this shares the 13 lines inside it.
 */
export async function fixedSizeRecharts(
  importOriginal: () => Promise<typeof import("recharts")>,
  { width = 360, height = 200 }: { width?: number; height?: number } = {},
): Promise<typeof import("recharts")> {
  const actual = await importOriginal();

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(
            children as React.ReactElement<Record<string, unknown>>,
            {
              width,
              height,
            },
          )
        : children,
  } as unknown as typeof import("recharts");
}
