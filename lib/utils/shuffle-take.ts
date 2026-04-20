/** Fisher–Yates shuffle then take the first `take` items (copy; does not mutate input). */
export function shuffleAndTake<T>(items: readonly T[], take: number): T[] {
  if (items.length === 0 || take <= 0) return [];
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(take, copy.length));
}
