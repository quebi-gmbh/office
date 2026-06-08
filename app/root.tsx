import { Suspense } from "react";
import { isRouteErrorResponse, Link, NavLink, Outlet, useRouteError } from "react-router";

/**
 * Root-level error boundary.
 * Chunk-load failures ("Failed to fetch dynamically imported module") show a
 * friendly "please refresh" message rather than the default developer screen.
 */
export function ErrorBoundary() {
  const error = useRouteError();

  const isChunkError =
    error instanceof TypeError &&
    error.message.toLowerCase().includes("failed to fetch dynamically imported module");

  if (isChunkError) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium">Page couldn't load</p>
        <p className="text-muted max-w-sm">
          A newer version of the app was deployed. Refresh the page to continue.
        </p>
        <button
          className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:border-accent"
          onClick={() => window.location.reload()}
        >
          Refresh now
        </button>
      </div>
    );
  }

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-medium">Something went wrong</p>
      <p className="text-muted font-mono text-sm">{message}</p>
    </div>
  );
}

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
            to="/docs"
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
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">
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
          className="hover:text-white"
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
