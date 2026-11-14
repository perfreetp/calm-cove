/**
 * The learner build ships as a single read-only page. When deployed separately,
 * VITE_ASSET_BASE points at the directory holding the delivered sequence frames.
 */
export function assetUrl(): string | undefined {
  const base = import.meta.env.VITE_ASSET_BASE as string | undefined;
  return base && base.length > 0 ? base : undefined;
}

export function isStandaloneLearner(): boolean {
  return (import.meta.env.VITE_LEARNER_MODE as string | undefined) === '1';
}
