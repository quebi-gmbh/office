import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router";

export default function Root() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <Link to="/" className="font-semibold tracking-tight">
          office.quebi.de
        </Link>
        <nav className="flex gap-4">
          <NavLink
            to="/code"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Code
          </NavLink>
          <NavLink
            to="/doc"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Doc
          </NavLink>
          <NavLink
            to="/paint"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Paint
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 flex flex-col overflow-hidden px-6 py-8">
        <Suspense
          fallback={
            <div className="h-32 rounded-xl border border-border bg-card animate-pulse" />
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-2 gap-y-1 border-t border-border px-6 py-4 text-sm text-muted">
        <span>made with stubbornness and Bun</span>
        <span aria-hidden="true">·</span>
        <span>MIT</span>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/quebi-gmbh/office"
          target="_blank"
          rel="noreferrer"
        >
          source on github
        </a>
        <span aria-hidden="true">·</span>
        <span>no cookies</span>
        <span aria-hidden="true">·</span>
        <span>no JS frameworks</span>
        <span aria-hidden="true">·</span>
        <span>no kidding</span>
      </footer>
    </div>
  );
}
