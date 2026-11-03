import { BusStatusList } from "../components/BusStatusList";

export default function StatusPage() {
  return (
    <main>
      <h1>DAUST Bus</h1>
      <BusStatusList />
      <p className="muted hint">Tip: add this page to your home screen to check the bus in one tap.</p>
    </main>
  );
}
