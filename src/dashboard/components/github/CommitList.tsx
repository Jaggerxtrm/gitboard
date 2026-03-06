import type { GithubEvent, GithubCommit } from "../../../types/github.ts";

interface Props {
  event: GithubEvent | null;
  commits: GithubCommit[];
}

export function CommitList({ event, commits }: Props) {
  if (!event) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Select an event to view details.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto px-4 py-3 gap-3">
      <div className="text-sm font-mono text-slate-300">
        <span className="text-slate-400">{event.repo}</span>
        {event.branch && <span className="text-slate-500"> / {event.branch}</span>}
      </div>

      {(event.additions != null || event.deletions != null) && (
        <div className="flex gap-4 text-sm font-mono">
          {event.additions != null && (
            <span className="text-emerald-400">+{event.additions}</span>
          )}
          {event.deletions != null && (
            <span className="text-rose-400">-{event.deletions}</span>
          )}
          {event.changed_files != null && (
            <span className="text-slate-500">{event.changed_files} files</span>
          )}
        </div>
      )}

      {commits.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Commits</div>
          {commits.map((commit) => (
            <div key={commit.sha} className="flex gap-2 text-sm">
              <a
                href={commit.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-indigo-400 hover:underline shrink-0 pt-0.5"
              >
                {commit.sha.slice(0, 7)}
              </a>
              <span className="text-slate-200 truncate">{commit.message.split("\n")[0]}</span>
            </div>
          ))}
        </div>
      )}

      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-400 hover:underline mt-auto"
        >
          View on GitHub →
        </a>
      )}
    </div>
  );
}
