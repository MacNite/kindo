import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./designs.css";
import "./celebration.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Kindo",
  description: "Self-hosted family dashboard",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "Kindo", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#EEF1EC" }, { media: "(prefers-color-scheme: dark)", color: "#111719" }],
};

// Applies the saved theme and design style (src/lib/designs.ts: glass and brutal are always light,
// future always dark) before first paint to avoid a light flash on the wall at night, and the
// device's language to <html lang> (the server can't know it, §20 D7; PrefsProvider keeps it in step).
const themeScript = `try{var d=document.documentElement,p=JSON.parse(localStorage.getItem('kindo.prefs')||'{}');var t=p.theme||'system',g=p.design||'warm';d.dataset.design=g;if(g==='future'||(g!=='glass'&&g!=='brutal'&&(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))))d.classList.add('dark');d.lang=p.language||((navigator.language||'').toLowerCase().indexOf('de')===0?'de':'en')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
