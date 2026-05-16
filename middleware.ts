import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml|manifest.json|api/).*)"],
};
