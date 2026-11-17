export function random(seed = 26) {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
export function teamRandom(state, team) {
  let value = state.randomStates[team] || 0x9e3779b9;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.randomStates[team] = value >>> 0;
  return (value >>> 0) / 4294967296;
}
