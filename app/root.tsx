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
            to="/text"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Text
          </NavLink>
          <NavLink
            to="/paint"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Paint
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">
        <Outlet />
      </main>
      <footer className="flex justify-center gap-2 border-t border-border px-6 py-4 text-sm text-muted">
        <a
          href="https://github.com/quebi/office"
          target="_blank"
          rel="noreferrer"
        >
          source on github
        </a>
        <span>·</span>
        <span>MIT</span>
      </footer>
    </div>
  );
}
