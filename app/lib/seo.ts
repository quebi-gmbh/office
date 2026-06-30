/**
 * Builds a React Router `meta` descriptor array — title, description, canonical,
 * and Open Graph / Twitter card tags — from the shared route registry. The
 * output is prerendered into each route's static HTML (see react-router.config),
 * so crawlers and social scrapers see complete per-page metadata without running
 * any JavaScript.
 */
import { BASE_URL, SITE, routeMeta } from "./site-routes";

export function seo(path: string) {
  const r = routeMeta(path);
  const fullTitle = r.exactTitle ? r.name : `${r.name} — ${SITE}`;
  const url = `${BASE_URL}${r.path}`;
  const ogImage = `${BASE_URL}/og/${r.slug}.png`;

  return [
    { title: fullTitle },
    { name: "description", content: r.description },
    { tagName: "link", rel: "canonical", href: url },

    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: r.description },
    { property: "og:url", content: url },
    { property: "og:image", content: ogImage },

    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: r.description },
    { name: "twitter:image", content: ogImage },
  ];
}
