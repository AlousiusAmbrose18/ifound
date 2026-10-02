import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ifound | Compliance Workspace",
  description: "Customer screening and transaction monitoring workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
