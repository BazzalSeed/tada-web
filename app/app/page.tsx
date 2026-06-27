import { AppShellContainer } from "@/app/components/shell/AppShellContainer";
import { CaptureZone } from "@/app/components/capture/CaptureZone";
import { TadaProvider } from "@/app/lib/store";
import { seedState } from "@/app/lib/seed";

// Product app shell. Lives at /app; the apex stays for the marketing landing
// (Phase 4). CaptureZone wraps the whole app for global drop/paste capture.
// Preloaded with seed data until live /api/todos hydration lands.
export default function AppPage() {
  return (
    <TadaProvider preload={seedState}>
      <CaptureZone>
        <AppShellContainer />
      </CaptureZone>
    </TadaProvider>
  );
}
