import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {/* config options here */};

// Point the plugin at the request config (ADR-0005). No `withNextIntl` routing
// is wired — locale comes from the profile/cookie, not the URL.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
