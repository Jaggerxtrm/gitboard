import { useState } from "react";
import { useObservabilitySummary } from "../../hooks/useObservabilitySummary.ts";

export function Observability() {
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");
  const data = useObservabilitySummary(range);
  return <div style={{ padding: 16 }}>
    <header><button onClick={() => setRange("7d")}>7d</button><button onClick={() => setRange("30d")}>30d</button><button onClick={() => setRange("all")}>all</button></header>
    <Section title="spend"><pre>{JSON.stringify(data?.spend ?? [], null, 2)}</pre></Section>
    <Section title="roles"><pre>{JSON.stringify(data?.roles ?? [], null, 2)}</pre></Section>
    <Section title="recent jobs"><pre>{JSON.stringify(data?.jobs ?? [], null, 2)}</pre></Section>
    <Section title="waiting jobs"><pre>{JSON.stringify(data?.waiting ?? [], null, 2)}</pre></Section>
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2>{title}</h2>{children}</section>; }
