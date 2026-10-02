import { NextRequest } from "next/server";
import { proxy, response } from "../../../lib/server-api";
export const dynamic = "force-dynamic";
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !path.length ||
    ![
      "customers",
      "screenings",
      "watchlists",
      "transactions",
      "alerts",
      "rules",
      "dashboard",
      "audit",
      "users",
      "auth",
    ].includes(path[0]) ||
    path.length > 4 ||
    path.some((s) => s.length > 100)
  )
    return response({ error: "Unknown API endpoint." }, 404);
  return proxy(request, path.map(encodeURIComponent).join("/"));
}
export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
