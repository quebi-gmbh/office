import type { Config } from "@react-router/dev/config";
// Plain-data registry (no JSX, no `~` alias) so it resolves outside Vite.
import { SITE_ROUTES } from "./app/lib/site-routes";

// Static-only build for GitHub Pages: no runtime server (ssr:false), prerender
// every route to real HTML so each page ships complete content + meta for
// SEO / social / AI crawlers. Non-prerendered paths fall back to the SPA shell.
export default {
  appDirectory: "app",
  ssr: false,
  async prerender() {
    return SITE_ROUTES;
  },
} satisfies Config;
