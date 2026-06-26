import type { Metadata } from "next";
import { Caveat, EB_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Brand families loaded via next/font (Turbopack drops the remote @import in
// styles/tokens/fonts.css). Exposed as CSS variables; globals.css wires them
// into the --font-display/body/wordmark/mono brand tokens.
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tada — Not to-do. Ta-da.",
  description: "Capture-first AI to-do that does the task for you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ebGaramond.variable} ${geist.variable} ${geistMono.variable} ${caveat.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
