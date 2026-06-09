import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import Root, { ErrorBoundary } from "./root";
import { routes } from "./routes.gen";

const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    ErrorBoundary,
    children: routes,
  },
]);

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
