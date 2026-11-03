import { connection } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../convex/_generated/api";
import type { BusStatusView } from "../shared/types";
import { BusStatusList } from "../components/BusStatusList";

export default async function StatusPage() {
  await connection(); // render per request: the HTML carries today's statuses, not build-time ones
  // Buses are in the first HTML, so they show before the JS (most of the 3G load) arrives.
  // If Convex is unreachable here, the client subscription still fills the list.
  const initial = (await fetchQuery(api.status.list, { now: Math.floor(Date.now() / 60_000) * 60_000 }).catch(() => undefined)) as
    | BusStatusView[]
    | undefined;
  return (
    <main>
      <h1>DAUST Bus</h1>
      <BusStatusList initial={initial} />
      <p className="muted hint">Tip: add this page to your home screen to check the bus in one tap.</p>
    </main>
  );
}
