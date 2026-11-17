/** Register this object in adaptive.js to add a synchronous online policy. */
export default {
  id: "my-policy",
  name: "My adaptive policy",
  description: "Describe when the policy changes routes and what it optimizes.",
  maxChange: 12,
  decide(observation, options, context) {
    // Only open stations and past/current queues are in the observation.
    // context.evaluate(plan) uses a forecast, not future evaluation events.
    // Return the current plan to leave every vehicle and passenger untouched.
    return observation.plan;
  },
};
