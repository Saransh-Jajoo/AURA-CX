import { NextRequest, NextResponse } from "next/server";

type UserRole = "super_admin" | "tenant_admin" | "executive" | "qa_reviewer" | "support_agent";

const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin: ["/dashboard", "/dashboard/admin", "/dashboard/analytics", "/dashboard/profiles", "/dashboard/hitl", "/dashboard/shadow-tickets", "/dashboard/qa-review", "/dashboard/integrations", "/dashboard/subscriptions", "/dashboard/executive", "/dashboard/knowledge", "/dashboard/team", "/dashboard/settings", "/dashboard/voice", "/dashboard/compliance"],
  tenant_admin: ["/dashboard", "/dashboard/admin", "/dashboard/analytics", "/dashboard/profiles", "/dashboard/hitl", "/dashboard/shadow-tickets", "/dashboard/qa-review", "/dashboard/integrations", "/dashboard/subscriptions", "/dashboard/executive", "/dashboard/knowledge", "/dashboard/team", "/dashboard/settings", "/dashboard/voice", "/dashboard/compliance"],
  executive: ["/dashboard", "/dashboard/executive", "/dashboard/analytics", "/dashboard/subscriptions", "/dashboard/profiles", "/dashboard/compliance"],
  qa_reviewer: ["/dashboard", "/dashboard/qa-review", "/dashboard/hitl", "/dashboard/analytics", "/dashboard/profiles", "/dashboard/knowledge", "/dashboard/voice"],
  support_agent: ["/dashboard", "/dashboard/profiles", "/dashboard/hitl", "/dashboard/knowledge", "/dashboard/voice"],
};

const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  super_admin: "/dashboard/admin",
  tenant_admin: "/dashboard/admin",
  executive: "/dashboard/executive",
  qa_reviewer: "/dashboard/qa-review",
  support_agent: "/dashboard",
};

const PUBLIC_PATHS = ["/login", "/api", "/_next", "/favicon.ico", "/logo"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function base64UrlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function verifyJWT(token: string, secret: string): Promise<{ sub: string; role: UserRole; tenant: string; exp: number } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(signatureB64), encoder.encode(`${headerB64}.${payloadB64}`));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!(payload.role in ROLE_ROUTES)) return null;
    if (typeof payload.sub !== "string" || typeof payload.tenant !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();
  if (pathname === "/") return NextResponse.redirect(new URL("/login", request.url));

  const token = request.cookies.get("aura_token")?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const secret = process.env.SECRET_KEY;
  if (!secret) return NextResponse.next();

  const payload = await verifyJWT(token, secret);
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("aura_token");
    return response;
  }

  if (pathname.startsWith("/dashboard")) {
    const allowedRoutes = ROLE_ROUTES[payload.role] || [];
    const hasAccess = allowedRoutes.some((route) => pathname === route || pathname === `${route}/`);
    if (!hasAccess) {
      return NextResponse.redirect(new URL(ROLE_DEFAULT_ROUTE[payload.role] || "/dashboard", request.url));
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-tenant-id", payload.tenant);
  response.headers.set("x-user-role", payload.role);
  response.headers.set("x-user-sub", payload.sub);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
