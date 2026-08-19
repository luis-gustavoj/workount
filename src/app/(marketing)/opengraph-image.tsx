import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

/**
 * The Open Graph card for `/` and `/privacy` (ticket 025).
 *
 * Generated rather than exported from a design tool, so the card can never
 * drift from the headline it is advertising — both read the same catalog key.
 *
 * Deliberately typeset in the runtime's default sans rather than IBM Plex.
 * `ImageResponse` cannot use `next/font`; giving it Plex means shipping the
 * .ttf as a repo asset and fetching it on every render of this route. That is
 * real weight and a real failure mode for a 1200×630 PNG that people see at
 * thumbnail size in a chat client. The chassis and the azure signal are what
 * make the card recognisable here, and both are exact.
 */
export const alt = "Workount";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const t = await getTranslations("Landing");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        // DESIGN.md's dark chassis, with the signal bloom the landing page
        // itself uses. Hex rather than oklch(): Satori does not resolve CSS
        // custom properties, and its colour parsing is narrower than a
        // browser's.
        background:
          "radial-gradient(60% 55% at 50% 0%, #0d2436 0%, #070707 70%)",
        padding: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "#17a5fe",
          }}
        />
        <div style={{ fontSize: 30, color: "#f5f5f5", fontWeight: 600 }}>
          Workount
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontSize: 76,
            lineHeight: 1.05,
            color: "#f5f5f5",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          {t("hero.titleTop")}
        </div>
        <div
          style={{
            fontSize: 76,
            lineHeight: 1.05,
            color: "#a8a8a8",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          {t("hero.titleBottom")}
        </div>
      </div>

      <div style={{ fontSize: 26, color: "#a8a8a8" }}>
        {t("benefits.networkTitle")}
      </div>
    </div>,
    size,
  );
}
