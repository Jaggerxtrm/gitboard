import { useEffect, useState } from "react";

export interface SpecialistOwnershipJob {
  role: string;
  state: string;
  repoSlug: string;
}

export function useSpecialistOwnership(beadId: string | null, enabled = true): SpecialistOwnershipJob | null {
  const [job, setJob] = useState<SpecialistOwnershipJob | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled || !beadId) {
        setJob(null);
        return;
      }

      try {
        const res = await fetch(`/api/specialists/jobs?bead_id=${encodeURIComponent(beadId)}`);
        if (!res.ok) {
          if (!cancelled) setJob(null);
          return;
        }

        const data = (await res.json()) as { jobs?: Array<{ role?: string; state?: string; repoSlug?: string }> };
        const first = data.jobs?.[0];
        if (!cancelled) {
          setJob(first?.role && first.state && first.repoSlug ? { role: first.role, state: first.state, repoSlug: first.repoSlug } : null);
        }
      } catch {
        if (!cancelled) setJob(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [beadId, enabled]);

  return job;
}
