import type React from "react";
import type { Metadata } from "next";
import { ReactQueryProvider } from "@/lib/query-client";
import ClientLayout from "@/app/client-layout";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Get ready for takeoff!",
  description:
    "For your money.",
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
            <AuthenticatedLayout>{children}</AuthenticatedLayout>
          </ClientLayout>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
