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
    <section className="landing">
      <h1 className="landing__title">office.quebi.de</h1>
      <p className="landing__lede">
        A small collection of open-source, browser-based office tools. No login,
        no backend — everything runs in your browser and stays on your device.
      </p>
      <ul className="landing__tools">
        {tools.map((t) => (
          <li key={t.to}>
            <Link to={t.to} className="tool-card">
              <h2>{t.name}</h2>
              <p>{t.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
