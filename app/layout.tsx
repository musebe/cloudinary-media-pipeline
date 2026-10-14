import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Media Pipeline Lab | Cloudinary and Next.js",
  description:
    "Preview typed media workflows with explicit Cloudinary handoffs, transformation requirements, and approval gates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
