/**
 * Generates Open Graph share images (1200×630 PNG) into public/og/:
 *   - default.png   site-wide / home fallback
 *   - <slug>.png    one per tool route (eyebrow + name + description)
 *
 * Build-time only, via satori (JSX-shaped object → SVG) + resvg (SVG → PNG).
 * No browser involved. Adapted from the ui-lib generator. Run from `build`.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { ROUTES } from "../app/lib/site-routes";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OG_OUT = join(ROOT, "public/og");

const BG = "#030712";
const BRAND = "#2dd4a8";
const FG = "#ffffff";
const MUTED = "#9ca3af";

// satori takes a React-element-shaped object literal (no JSX needed here).
function el(type: string, props: Record<string, unknown>, children?: unknown) {
  return { type, props: { ...props, children } };
}

function card(eyebrow: string, title: string, subtitle: string, logoSrc: string) {
  return el(
    "div",
    {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: BG,
        padding: "72px",
        fontFamily: "Outfit",
      },
    },
    [
      el("img", { src: logoSrc, width: 173, height: 50 }),
      el("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, [
        el(
          "div",
          {
            style: {
              fontSize: "34px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: BRAND,
            },
          },
          eyebrow,
        ),
        el(
          "div",
          { style: { fontSize: "72px", fontWeight: 700, color: FG, lineHeight: 1.05 } },
          title,
        ),
      ]),
      el("div", { style: { fontSize: "34px", color: MUTED, lineHeight: 1.3 } }, subtitle),
    ],
  );
}

type Fonts = Parameters<typeof satori>[1]["fonts"];

async function render(node: unknown, fonts: Fonts): Promise<Buffer> {
  const svg = await satori(node as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts });
  return Buffer.from(new Resvg(svg).render().asPng());
}

/** Trim to a word boundary near maxLen, adding an ellipsis if cut. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen).trimEnd()}…`;
}

async function loadFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(join(ROOT, "scripts/assets", file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function main() {
  const fonts: Fonts = [
    { name: "Outfit", data: await loadFont("Outfit-400.ttf"), weight: 400, style: "normal" },
    { name: "Outfit", data: await loadFont("Outfit-700.ttf"), weight: 700, style: "normal" },
  ];

  // The quebi logo as a data-URI so satori renders it through resvg.
  const logoSvg = await readFile(join(ROOT, "public/quebi-logo.svg"), "utf8");
  const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

  await rm(OG_OUT, { recursive: true, force: true });
  await mkdir(OG_OUT, { recursive: true });

  for (const r of ROUTES) {
    // Home uses its eyebrow + a short site tagline; tools use name + description.
    const title = r.path === "/" ? "office.quebi.de" : r.name;
    await writeFile(
      join(OG_OUT, `${r.slug}.png`),
      await render(card(r.eyebrow, title, truncate(r.description, 90), logo), fonts),
    );
  }

  console.log(`Generated ${ROUTES.length} OG images into public/og/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
