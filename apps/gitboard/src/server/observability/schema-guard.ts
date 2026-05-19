// sp's observability.db schema currently at version 11 (2026-05). Bump max as sp ships migrations.
export const COMPATIBLE_RANGE = { min: 1, max: 100 } as const;

export function isCompatible(version: number): boolean {
  return version >= COMPATIBLE_RANGE.min && version <= COMPATIBLE_RANGE.max;
}
