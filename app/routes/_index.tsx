import type { ReactNode } from "react";
import {
  Boxes,
  Code2,
  FileText,
  FileType,
  Paintbrush,
  PenLine,
  PenTool,
  Table2,
} from "lucide-react";
import { Link } from "react-router";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/");
}

type Tool = {
  to: string;
  name: string;
  blurb: string;
  status: "live" | "soon";
  icon: ReactNode;
};

const tools: Tool[] = [
  {
    to: "/code",
    name: "Code editor",
    blurb: "Full-featured CodeMirror 6 editor — 20+ languages, linting, Prettier formatting, Vim/Emacs, command palette, and share-by-URL.",
    status: "live",
    icon: <Code2 size={20} aria-hidden />,
  },
  {
    to: "/docs",
    name: "Document editor",
    blurb: "A rich-text editor for notes and documents.",
    status: "live",
    icon: <FileText size={20} aria-hidden />,
  },
  {
    to: "/paint",
    name: "Paint",
    blurb: "A simple Paint-like drawing canvas.",
    status: "live",
    icon: <Paintbrush size={20} aria-hidden />,
  },
  {
    to: "/vector",
    name: "Vector editor",
    blurb: "Draw shapes, freehand and pen paths, and text; select, transform, and restyle; snap to a grid, undo/redo, autosave, and export to SVG or PNG.",
    status: "live",
    icon: <PenTool size={20} aria-hidden />,
  },
  {
    to: "/table",
    name: "Table",
    blurb: "Paste anything tabular into a fast virtualised grid — edit, sort, filter, and export anywhere. All client-side.",
    status: "live",
    icon: <Table2 size={20} aria-hidden />,
  },
  {
    to: "/pdf",
    name: "PDF tools",
    blurb: "Merge, split, rotate, crop, watermark, stamp, fill forms, edit metadata, extract text, build PDFs from images — all client-side via pdf-lib + pdfjs.",
    status: "live",
    icon: <FileType size={20} aria-hidden />,
  },
  {
    to: "/cad",
    name: "CAD tool",
    blurb: "Sketch on base planes with constraints and typed dimensions, then extrude, revolve, or combine primitives with booleans. Feature tree, undo/redo, autosave, and STL/GLB/PNG export — the Manifold kernel runs in a Web Worker.",
    status: "live",
    icon: <Boxes size={20} aria-hidden />,
  },
  {
    to: "/typst",
    name: "Typst editor",
    blurb: "Write Typst with syntax highlighting and a live preview; export to PDF, SVG, or PNG and share by link. The compiler runs in your browser via WebAssembly — nothing is uploaded.",
    status: "live",
    icon: <PenLine size={20} aria-hidden />,
  },
];

const comingSoon = [
  { slug: "/json" },
  { slug: "/diff" },
  { slug: "/qr" },
];

const chips = [
  "no login",
  "no backend",
  "no tracking*",
  "open source",
  "bookmarkable",
];

export default function Index() {
  return (
    <section>
      {/* Hero */}
      <header className="relative mb-16 overflow-hidden rounded-2xl px-8 py-20 text-center">
        {/* Decorative: teal glow circle */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 z-0 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-quebi-brand/[0.15] blur-3xl"
        />
        {/* Decorative: purple accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-8 z-0 h-[220px] w-[220px] rounded-full bg-purple-400/[0.12] blur-3xl"
        />
        {/* Decorative: grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-quebi-grid"
        />

        {/* Content */}
        <div className="relative z-10">
          <span className="quebi-eyebrow mb-4 block">quebi GmbH</span>
          <h1 className="mb-4 text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
            office.quebi.de
          </h1>
          <p className="mb-4 text-lg text-muted">
            Small tools that just work, right in your browser.
          </p>
          <p className="mx-auto mb-6 max-w-[60ch] text-sm text-muted">
            Missing Paint? Don't want to install a 200&thinsp;MB app to crop a
            screenshot or scribble a note? These tools live in a browser tab. No
            signup, no backend, no telemetry — just open source utilities, hosted
            statically on GitHub Pages.
          </p>
          <ul className="mb-1 flex list-none flex-wrap justify-center gap-1.5 p-0">
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-accent/20 bg-accent/[0.07] px-2.5 py-0.5 text-xs text-accent"
              >
                {chip}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted opacity-70">
            *the CDN sees your IP, nobody else.
          </p>
        </div>
      </header>

      {/* Tools grid */}
      <ul className="mb-12 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0">
        {tools.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              className="group relative block rounded-xl border border-border bg-card p-5 transition duration-300 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_0_24px_rgba(45,212,168,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <span
                className={`absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium tracking-wider ${
                  t.status === "live"
                    ? "border-accent/30 uppercase text-accent"
                    : "border-muted/30 italic text-muted"
                }`}
              >
                {t.status === "live" ? "live" : "coming soon"}
              </span>
              <span className="mb-3 block text-muted transition duration-150 group-hover:text-accent group-hover:rotate-[-4deg]">
                {t.icon}
              </span>
              <h2 className="mb-1 text-[1.05rem] font-semibold">{t.name}</h2>
              <p className="text-sm text-muted">{t.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>

      {/* Why this exists */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          Why this exists
        </h2>
        <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 p-0">
          <li>
            <p className="text-sm text-muted">
              <strong className="font-semibold text-fg">
                Your data stays put
              </strong>{" "}
              — files never leave your device.
            </p>
          </li>
          <li>
            <p className="text-sm text-muted">
              <strong className="font-semibold text-fg">
                No install, no account, no waiting
              </strong>{" "}
              — a URL is the whole UX.
            </p>
          </li>
          <li>
            <p className="text-sm text-muted">
              <strong className="font-semibold text-fg">Open source</strong>{" "}
              — every line on GitHub, fork it / host it / PR it.
            </p>
          </li>
        </ul>
      </section>

      {/* Coming soon strip */}
      <section
        aria-label="Coming soon"
        className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted"
      >
        <span className="font-medium">coming soon:</span>
        <ul className="flex list-none p-0 font-mono">
          {comingSoon.map((t, i) => (
            <li key={t.slug}>
              {i > 0 && (
                <span className="mx-2 select-none" aria-hidden="true">
                  ·
                </span>
              )}
              {t.slug}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
