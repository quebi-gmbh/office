import { Suspense } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import "./app.css";
import { ClientOnly } from "./components/ClientOnly";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { NavigationGuard } from "./components/NavigationGuard";
import { SaveButton } from "./components/SaveButton";

/**
 * Document shell. React Router injects per-route <title>/meta via <Meta /> and
 * the bundled CSS/JS via <Links />/<Scripts />. The static head bits that used
 * to live in public/index.html (favicons, theme-color) now live here.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#030712" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="128x128" href="/favicon-128x128.png" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

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

export default function App() {
  return (
    <div id="root" className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <Link to="/" className="font-semibold tracking-tight">
          office.quebi.de
        </Link>
        <div className="flex items-center gap-4">
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
          <NavLink
            to="/table"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Table
          </NavLink>
          <NavLink
            to="/pdf"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            PDF
          </NavLink>
          <NavLink
            to="/typst"
            className={({ isActive }) => (isActive ? "text-accent" : "")}
          >
            Typst
          </NavLink>
        </nav>
        <ClientOnly>{() => <SaveButton />}</ClientOnly>
        </div>
      </header>
      <ClientOnly>{() => <NavigationGuard />}</ClientOnly>
      <div className="flex min-h-0 flex-1">
        <ClientOnly>{() => <WorkspaceSidebar />}</ClientOnly>
        <main className="min-w-0 flex-1 overflow-auto">
          {/* Centered reading column by default; a route can opt into full
              width by rendering an element with `data-full-bleed` (see the
              Typst editor), which drops the max-width via :has(). CSS-only so
              it works in the prerendered HTML without depending on JS. */}
          <div className="mx-auto w-full max-w-[1100px] px-6 py-8 has-[[data-full-bleed]]:max-w-none">
            <Suspense
              fallback={
                <div className="h-32 rounded-xl border border-border bg-card animate-pulse" />
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
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
