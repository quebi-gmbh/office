import type { RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

// File-based routing over app/routes/ using React Router's flat-routes
// convention (_index.tsx → "/", code.tsx → "/code", …). Replaces the old
// hand-rolled scripts/generate-routes.ts → app/routes.gen.ts generator.
export default flatRoutes() satisfies RouteConfig;
