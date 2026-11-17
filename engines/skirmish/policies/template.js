export default {
  id: "my-policy",
  name: "My policy",
  description: "Describe the tactical decision rule.",
  decide(observation, context) {
    // Return [{ unitIds: [...], type: 'attack', targetId: 'orange-1' }].
    // Other commands: move / attackMove with target {q,r}, or hold.
    // observation is detached from the live engine; context.random is seeded.
    return [];
  },
};
