import type { GithubRepo } from "../../../types/github.ts";

interface Props {
  repos: GithubRepo[];
  selectedRepos: string[];
  onReposChange: (repos: string[]) => void;
}

export function RepoFilter({ repos, selectedRepos, onReposChange }: Props) {
  if (repos.length === 0) {
    return (
      <div className="text-slate-500 text-sm px-4 py-2">No repos tracked yet.</div>
    );
  }

  function toggle(fullName: string): void {
    if (selectedRepos.includes(fullName)) {
      onReposChange(selectedRepos.filter((r) => r !== fullName));
    } else {
      onReposChange([...selectedRepos, fullName]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2">
      {repos.map((repo) => {
        const selected = selectedRepos.includes(repo.full_name);
        return (
          <button
            key={repo.full_name}
            aria-pressed={selected}
            onClick={() => toggle(repo.full_name)}
            className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
              selected
                ? "bg-slate-700 border-slate-500 text-slate-100"
                : "bg-transparent border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
            style={repo.color ? { borderColor: selected ? repo.color : undefined } : undefined}
          >
            {repo.display_name ?? repo.full_name}
          </button>
        );
      })}
    </div>
  );
}
