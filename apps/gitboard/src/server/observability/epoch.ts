const epochs = new Map<string, number>();

export function get(repoSlug: string): number {
  return epochs.get(repoSlug) ?? 0;
}

export function bump(repoSlug: string): number {
  const next = get(repoSlug) + 1;
  epochs.set(repoSlug, next);
  return next;
}
