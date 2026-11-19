export const PROPORTIONAL_SUPPLY = "proportional-unmet-hp";
export const EQUAL_SUPPLY = "equal-share-redistribution";

export function allocateStationSupply(needs, amount, rule) {
  const claims = Object.entries(needs).filter(([, need]) => need > 0);
  const total = claims.reduce((sum, [, need]) => sum + need, 0);
  const pool = Math.min(amount, total);
  if (pool <= 0) return {};
  if (rule === PROPORTIONAL_SUPPLY)
    return Object.fromEntries(claims.map(([team, need]) => [team, pool * need / total]));
  if (rule !== EQUAL_SUPPLY) throw new Error("Unknown public supply allocator");

  // Cap small claims first, then divide the remaining stock among larger claims.
  claims.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  let remaining = pool;
  return Object.fromEntries(claims.map(([team, need], index) => {
    const share = Math.min(need, remaining / (claims.length - index));
    remaining -= share;
    return [team, share];
  }));
}
