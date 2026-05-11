import type React from "react";
import type { Metadata } from "next";
import { ReactQueryProvider } from "@/lib/query-client";
import ClientLayout from "@/app/client-layout";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "To the Moon!",
  description:
    "For your money.",
  icons: {
    icon: "/favicon.svg",
  },
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
