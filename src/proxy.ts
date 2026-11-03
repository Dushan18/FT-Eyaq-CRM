import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirección optimista al inicio de sesión cuando no hay cookies de sesión.
 * No valida el token (eso lo hace el backend en cada petición): solo evita mostrar
 * pantallas privadas vacías a quien no inició sesión.
 */
const PUBLIC_PATHS = ["/login", "/olvide-contrasena", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = request.cookies.has("crm_rt") || request.cookies.has("crm_at");

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluye la API del BFF, archivos estáticos e imágenes.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
