import { step } from "../../engines/metro/shared/simulation.js";

/**
 * Apply a local dispatch delay without editing a route, train, or station.
 * Arrivals are recovered from the engine's one-service-per-train minute.
 */
export function stepLocal(state, { delay = () => false, collectArrivals = false } = {}) {
  if (state.finished) return { held: 0, heldLines: [], moving: 0, arrivals: [] };
  const trains = state.trains;
  const moving = trains.filter((train) => train.dwell === 0);
  const held = new Set(moving.filter((train) => {
    const index = train.direction === 1 ? train.index : train.index - 1;
    return delay(state.network.paths[train.line][index].cells);
  }));
  const dispatched = held.size ? trains.filter((train) => !held.has(train)) : trains;
  const before = state.delivered;
  const visits = collectArrivals ? dispatched.map((train) => ({
    train, from: train.from, dwell: train.dwell, passengers: train.passengers,
  })) : [];
  state.trains = dispatched;
  try {
    step(state, 1, { stopOnFailure: false });
  } finally {
    state.trains = trains;
  }
  const arrivals = [];
  for (const visit of visits) {
    const stationId = visit.train.from;
    if (!visit.dwell && stationId === visit.from) continue;
    const { q, r, shape } = state.stations[stationId];
    const count = visit.passengers.filter((passenger) => passenger.shape === shape).length;
    if (count) arrivals.push({ stationId, q, r, count });
  }
  if (collectArrivals && arrivals.reduce((sum, arrival) => sum + arrival.count, 0) !== state.delivered - before)
    throw new Error("Station arrivals do not match the transit delivery total");
  return { held: held.size, heldLines: [...held].map(({ line }) => line), moving: moving.length, arrivals };
}
