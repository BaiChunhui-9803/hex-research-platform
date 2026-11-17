import { policies as transit } from "../engines/metro/algorithms/adaptive.js";
import { policies as squad } from "../engines/skirmish/policies/registry.js";
/** Domain methods declare their narrower ports; they are never relabelled as universal. */
export const nativeMethods = [
  ...transit.map((policy) => ({
    id: `metro.${policy.id}`,
    name: policy.name,
    description: policy.description,
    mode: "policy",
    objective: "control",
    category: "Online strategies",
    family: "Transit control",
    variant: "Domain heuristic",
    referenceKeys: [],
    protocol: "metro-policy/v1",
    requires: ["dynamic-stations"],
    maxChange: policy.maxChange,
    decide: (observation, options, context) => ({
      type: "set-plan",
      plan: policy.decide(observation, options, context),
    }),
  })),
  ...squad.map((policy) => ({
    id: `squad.${policy.id}`,
    name: policy.name,
    description: policy.description,
    mode: "policy",
    objective: "control",
    category: "Online strategies",
    family: "Squad control",
    variant: "Domain heuristic",
    referenceKeys: [],
    protocol: "squad-policy/v1",
    decide: (observation, options, context) => ({
      type: "commands",
      orders: policy.decide(observation, context),
    }),
  })),
];
