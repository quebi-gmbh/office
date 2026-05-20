import { Link, NavLink, Outlet } from "react-router";

export default function Root() {
  return (
    <div className="app">
      <header className="app__header">
        <Link to="/" className="app__brand">
          office.quebi.de
        </Link>
        <nav className="app__nav">
          <NavLink to="/text">Text</NavLink>
          <NavLink to="/paint">Paint</NavLink>
        </nav>
      </header>
      <main className="app__main">
        <Outlet />
      </main>
      <footer className="app__footer">
        <a href="https://github.com/quebi/office" target="_blank" rel="noreferrer">
          source on github
        </a>
        <span>·</span>
        <span>MIT</span>
      </footer>
    </div>
  );
}
