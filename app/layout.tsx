import type React from "react";
import type { Metadata, Viewport } from "next";
import palette from "@/lib/colors/palette.json";
import ClientLayout from "@/app/client-layout";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import "../styles/globals.css";


const isDev = process.env.NODE_ENV !== "production";

export const metadata: Metadata = {
  title: "Personal Finance",
  description: "Self-hosted personal finance tracking and planning.",
  icons: {
    icon: isDev ? "/favicon-dev.svg" : "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Finance",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f141a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground" suppressHydrationWarning>
        <ClientLayout>
          <AuthenticatedLayout>{children}</AuthenticatedLayout>
        </ClientLayout>
      </body>
    </html>
  );
}

