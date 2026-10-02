import { response } from "../../../lib/server-api";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!process.env.BACKEND_URL)
    return response({ status: "UP", mode: "local" });
  try {
    const r = await fetch(`${process.env.BACKEND_URL}/q/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response({ status: r.ok ? "UP" : "DOWN" }, r.ok ? 200 : 503);
  } catch {
    return response({ status: "DOWN" }, 503);
  }
}
