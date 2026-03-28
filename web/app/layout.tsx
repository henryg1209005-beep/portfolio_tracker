import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portivex",
  description: "Real-time portfolio analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
