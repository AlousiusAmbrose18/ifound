import { NextRequest, NextResponse } from "next/server";
export const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function proxy(
  request: NextRequest,
  path: string,
  body?: unknown,
) {
  const backend = process.env.BACKEND_URL;
  if (!backend)
    return response(
      { mode: "local", error: "Backend is not configured." },
      503,
    );
  if (request.method !== "GET") {
    try {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).host !== request.headers.get("host"))
        return response({ error: "Cross-origin writes are not allowed." }, 403);
    } catch {
      return response({ error: "Invalid origin." }, 403);
    }
  }
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      "Content-Type": "application/json",
    };
    const token = request.cookies.get("ifound-session")?.value;
    if (token) headers["X-Session-Token"] = token;
    let content: string | undefined;
    if (body !== undefined) content = JSON.stringify(body);
    else if (!["GET", "DELETE"].includes(request.method)) {
      const reader = request.body?.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      content = "";
      if (reader)
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 10_000_000) {
            await reader.cancel();
            return response({ error: "Request exceeds 10 MB." }, 413);
          }
          content += decoder.decode(value, { stream: true });
        }
      content += decoder.decode();
    }
    const upstream = await fetch(
      `${backend}/api/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: content,
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    const result = await upstream
      .json()
      .catch(() => ({ error: "Backend could not complete the request." }));
    if (!upstream.ok) {
      const failure = response({ mode: "server", ...result }, upstream.status);
      if (path === "auth/logout") failure.cookies.delete("ifound-session");
      return failure;
    }
    const session = result.token;
    delete result.token;
    const reply = response(
      Array.isArray(result) ? result : { mode: "server", ...result },
    );
    if (path === "auth/login" && session)
      reply.cookies.set("ifound-session", session, {
        httpOnly: true,
        sameSite: "strict",
        secure:
          request.nextUrl.protocol === "https:" ||
          request.headers.get("x-forwarded-proto") === "https",
        path: "/",
        maxAge: 43200,
      });
    if (path === "auth/logout" || path === "auth/password")
      reply.cookies.delete("ifound-session");
    return reply;
  } catch {
    const failure = response(
      {
        mode: "server",
        error:
          "Backend is unavailable. Please retry when the service is healthy.",
      },
      503,
    );
    if (path === "auth/logout") failure.cookies.delete("ifound-session");
    return failure;
  }
}
