/** Kiosk surfaces: no admin chrome. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh select-none">{children}</div>;
}
