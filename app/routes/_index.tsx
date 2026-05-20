import type { ReactNode } from "react";
import { Code2, FileText, Paintbrush } from "lucide-react";
import { Link } from "react-router";

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
    to: "/doc",
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
      <header className="mb-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          office.quebi.de
        </h1>
        <p className="mb-3 text-lg font-medium tracking-tight">
          Small tools that just work, right in your browser.
        </p>
        <p className="mb-4 max-w-[60ch] text-sm text-muted">
          Missing Paint? Don't want to install a 200&thinsp;MB app to crop a
          screenshot or scribble a note? These tools live in a browser tab. No
          signup, no backend, no telemetry — just open source utilities, hosted
          statically on GitHub Pages.
        </p>
        <ul className="mb-1 flex list-none flex-wrap gap-1.5 p-0">
          {chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted"
            >
              {chip}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted opacity-70">
          *the CDN sees your IP, nobody else.
        </p>
      </header>

      {/* Tools grid */}
      <ul className="mb-12 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0">
        {tools.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              className="group relative block rounded-xl border border-border bg-card p-5 transition duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-sm"
            >
              <span
                className={`absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium tracking-wider ${
                  t.status === "live"
                    ? "border-live/30 uppercase text-live"
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
                🔒 Your data stays put
              </strong>{" "}
              — files never leave your device.
            </p>
          </li>
          <li>
            <p className="text-sm text-muted">
              <strong className="font-semibold text-fg">
                ⚡ No install, no account, no waiting
              </strong>{" "}
              — a URL is the whole UX.
            </p>
          </li>
          <li>
            <p className="text-sm text-muted">
              <strong className="font-semibold text-fg">🛠 Open source</strong>{" "}
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
