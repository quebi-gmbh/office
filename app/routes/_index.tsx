import { Link } from "react-router";

const tools = [
  {
    to: "/text",
    name: "Text editor",
    blurb: "A lightweight code & text editor with syntax highlighting.",
  },
  {
    to: "/paint",
    name: "Paint",
    blurb: "A simple Paint-like drawing canvas.",
  },
];

export default function Index() {
  return (
    <section>
      <h1 className="mb-2 text-3xl tracking-tight">office.quebi.de</h1>
      <p className="mb-8 max-w-[60ch] text-muted">
        A small collection of open-source, browser-based office tools. No login,
        no backend — everything runs in your browser and stays on your device.
      </p>
      <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0">
        {tools.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              className="block rounded-xl border border-border bg-card p-5 transition duration-150 hover:-translate-y-px hover:border-accent"
            >
              <h2 className="mb-1 text-[1.05rem]">{t.name}</h2>
              <p className="text-sm text-muted">{t.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
