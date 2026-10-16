import { IdleScreensaver } from "@/components/photos/IdleScreensaver";

/** The child's pages become the photo frame when idle, like the wall (§13). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<IdleScreensaver /></>;
}
