import { LinkIcon, StopwatchIcon } from "@primer/octicons-react";
import { useInFlightJobs } from "../../hooks/useInFlightJobs.ts";

const EXCERPT_LIMIT = 80;

function excerpt(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > EXCERPT_LIMIT ? `${trimmed.slice(0, EXCERPT_LIMIT - 1)}…` : trimmed;
}

function formatElapsed(updatedAt: string): string {
  const deltaMs = Math.max(0, Date.now() - Date.parse(updatedAt));
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function InFlightRail() {
  const { groups, loading, error } = useInFlightJobs();

  return (
    <section className="ide-inflight-rail" aria-label="In-flight specialists">
      <div className="ide-sidebar-group-title">In-flight specialists</div>
      {loading && groups.length === 0 ? (
        <p className="ide-empty-msg">Loading live specialists…</p>
      ) : error ? (
        <p className="ide-empty-msg">{error}</p>
      ) : groups.length === 0 ? (
        <p className="ide-empty-msg">No live specialists.</p>
      ) : (
        <div className="ide-inflight-groups">
          {groups.map((group) => (
            <section key={group.repoSlug} className="ide-inflight-group">
              <h3 className="ide-inflight-group-title">{group.repoSlug}</h3>
              <ul className="ide-inflight-list" role="list">
                {group.jobs.map((job) => (
                  <li key={`${job.repoSlug}:${job.beadId}:${job.chainId ?? ""}:${job.updatedAt}`}>
                    <article className="ide-inflight-row">
                      <span className="ide-inflight-role" aria-hidden="true" title={job.chainKind ?? "specialist"}>
                        <RoleIcon role={job.chainKind} />
                      </span>
                      <div className="ide-inflight-main">
                        <a className="ide-inflight-title" href={`/beadboard?bead=${encodeURIComponent(job.beadId)}`}>
                          {job.beadId}
                        </a>
                        <div className="ide-inflight-meta">
                          <span className="ide-inflight-elapsed">
                            <StopwatchIcon size={11} /> {formatElapsed(job.updatedAt)}
                          </span>
                          <span className="ide-inflight-excerpt" title={job.lastOutput ?? undefined}>
                            {excerpt(job.lastOutput)}
                          </span>
                        </div>
                      </div>
                      <span className="ide-inflight-link" aria-hidden="true">
                        <LinkIcon size={11} />
                      </span>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function RoleIcon({ role }: { role: string | null }): JSX.Element {
  const label = role ?? "other";
  return <span>{label.slice(0, 1).toUpperCase()}</span>;
}
