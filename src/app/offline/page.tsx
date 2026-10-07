import { OfflineScreen } from "@/components/layout/OfflineScreen";

/** Shown by the service worker for a page this device hasn't opened before while offline (§19.7). */
export default function Page() {
  return <OfflineScreen />;
}
