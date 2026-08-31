import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Village Family",
  description: "The family coordination layer for shift work, childcare and real life.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
