import { NextRequest } from "next/server";
import { proxy, response } from "../../../lib/server-api";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!process.env.BACKEND_URL) return response({ mode: "local" });
  return proxy(request, "workspace");
}
export async function PUT(request: NextRequest) {
  return proxy(request, "workspace");
}
