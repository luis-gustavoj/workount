import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PwaShell } from "@/components/pwa/pwa-shell";

import "./globals.css";

// DESIGN.md: IBM Plex Sans for interface text, IBM Plex Mono for every numeral.
// One superfamily paired on a real contrast axis (grotesque vs monospace).
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Workount",
  description: "Track your training programs and log your sessions.",
  // iOS Safari still doesn't fully read manifest.webmanifest (ticket 019):
  // these are what actually make "Add to Home Screen" open standalone there.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Workount",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070707", // DESIGN.md dark-theme --bg; the app is dark-only
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved by src/i18n/request.ts (profile cookie → Accept-Language). Drives
  // `<html lang>` for a11y/spellcheck and the catalog the provider hands down.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${plexSans.variable} ${plexMono.variable} dark h-dvh antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        {/* No props: locale + messages are inherited from the request config,
            so the whole catalog is available to Client Components too. */}
        <NextIntlClientProvider>
          {children}
          <PwaShell />
          <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
