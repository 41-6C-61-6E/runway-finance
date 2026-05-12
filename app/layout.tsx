import type React from "react";
import type { Metadata, Viewport } from "next";
import { ReactQueryProvider } from "@/lib/query-client";
import ClientLayout from "@/app/client-layout";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "To the Moon!",
  description: "For your money.",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground" suppressHydrationWarning>
        <ReactQueryProvider>
          <ClientLayout>
            <AuthenticatedLayout>{children}</AuthenticatedLayout>
          </ClientLayout>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
