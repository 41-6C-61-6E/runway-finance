import type React from "react";
import type { Metadata } from "next";
import { ReactQueryProvider } from "@/lib/query-client";
import ClientLayout from "@/app/client-layout";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Runway: Get ready for takeoff!",
  description:
    "A modern, production-ready starter template for Next.js projects with Docker, TypeScript, and Tailwind CSS 4.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-gray-950" suppressHydrationWarning>
        <ReactQueryProvider>
          <ClientLayout>
            {children}
          </ClientLayout>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
