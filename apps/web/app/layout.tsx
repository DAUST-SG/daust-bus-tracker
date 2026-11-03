import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "../components/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAUST Bus",
  description: "Live status of the DAUST buses.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
