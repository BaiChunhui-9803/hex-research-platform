export function random(seed = 26) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (items, rng) => items[Math.floor(rng() * items.length)];
export function integer(value, fallback, min, max, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return number;
}
