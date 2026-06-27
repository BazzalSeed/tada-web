import { AppShellContainer } from "@/app/components/shell/AppShellContainer";
import { TadaProvider } from "@/app/lib/store";
import { seedState } from "@/app/lib/seed";

// Product app shell (T1.3). Lives at /app; the apex stays for the marketing
// landing (Phase 4). Preloaded with seed data until T1.4 wires live /api/todos.
export default function AppPage() {
  return (
    <TadaProvider preload={seedState}>
      <AppShellContainer />
    </TadaProvider>
  );
}
