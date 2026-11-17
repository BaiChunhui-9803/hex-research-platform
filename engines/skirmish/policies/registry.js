import rush from "./rush.js";
import focus from "./focus.js";
import kite from "./kite.js";
import random from "./random.js";
export const policies = [rush, focus, kite, random];
export const policyById = (id) => policies.find((policy) => policy.id === id);
export const policyMetadata = () =>
  policies.map(({ id, name, description }) => ({ id, name, description }));
