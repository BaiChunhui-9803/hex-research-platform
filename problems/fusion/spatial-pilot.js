import { random } from "../../core/random.js";
import { spatialVariants } from "./spatial-rules.js";

export const PILOT_SEEDS = Object.freeze([26, 27]);
export const COUPLING_TARGET = Object.freeze({ delayShare: 0.10, recoveryShare: 0.05 });

export function couplingMeasurement(metrics) {
  const delayShare = metrics.heldTrainMinutes / Math.max(1, metrics.movingTrainMinutes);
  const recoveryShare = metrics.supportUsed / Math.max(1, metrics.ownStartingHp);
  return {
    delayShare,
    recoveryShare,
    errorPP: 50 * (Math.abs(delayShare - COUPLING_TARGET.delayShare) +
      Math.abs(recoveryShare - COUPLING_TARGET.recoveryShare)),
  };
}

export function runStartingPlan(create, config) {
  const environment = create(config);
  const task = environment.createSearchTask();
  environment.acceptSolution(task.initial(random(config.seed ^ 0x5306a7)));
  while (!environment.done()) environment.advance();
  return environment.metrics();
}

export function selectSpatialVariant(create, config) {
  const variants = ["standard", ...Object.keys(spatialVariants).filter((v) => v !== "standard")];
  const trials = variants.map((variant) => {
    const errors = PILOT_SEEDS.map((seed) =>
      couplingMeasurement(runStartingPlan(create, {
        ...config, seed, spatialVariant: variant, spatialSelector: undefined,
      })).errorPP,
    );
    return { variant, meanErrorPP: errors.reduce((sum, value) => sum + value, 0) / errors.length };
  });
  const best = trials.reduce((incumbent, trial) =>
    trial.meanErrorPP < incumbent.meanErrorPP - 1e-8 ? trial : incumbent,
  );
  return { variant: best.variant, seeds: [...PILOT_SEEDS], trials, rollouts: trials.length * PILOT_SEEDS.length };
}
