import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AURA-CX | Intelligent Customer Experience Orchestrator",
  description: "Autonomous Universal Resolution & Analytics — AI-powered omnichannel CX command center for enterprise customer experience management.",
  keywords: ["CX", "AI", "customer experience", "omnichannel", "SaaS", "analytics"],
  openGraph: {
    title: "AURA-CX | Intelligent CX Orchestrator",
    description: "AI-powered omnichannel CX command center",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}