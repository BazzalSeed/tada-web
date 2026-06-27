import { AppShellContainer } from "@/app/components/shell/AppShellContainer";
import { CaptureZone } from "@/app/components/capture/CaptureZone";
import { DataBootstrap } from "@/app/components/app/DataBootstrap";
import { TadaProvider } from "@/app/lib/store";

// Product app shell. Lives at /app (auth-gated by middleware); the apex stays for
// the marketing landing. CaptureZone wraps the whole app for global drop/paste/
// upload capture. DataBootstrap hydrates the store from the live API on mount —
// no seed data, so the unauthenticated state is real (empty), not masked.
export default function AppPage() {
  return (
    <TadaProvider>
      <DataBootstrap />
      <CaptureZone>
        <AppShellContainer />
      </CaptureZone>
    </TadaProvider>
  );
}
