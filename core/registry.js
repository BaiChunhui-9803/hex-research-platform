/** Registries know contracts and capabilities, never domain-specific rules. */
export function createRegistry(entries, kind) {
  const map = new Map();
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9.-]*$/.test(entry.id) || map.has(entry.id))
      throw new Error(`Invalid or duplicate ${kind} ID: ${entry.id}`);
    map.set(entry.id, entry);
  }
  return {
    list: () => [...map.values()],
    get(id) {
      const entry = map.get(id);
      if (!entry) throw new Error(`Unknown ${kind}: ${id}`);
      return entry;
    },
  };
}
export function compatibility(method, capabilities) {
  const reasons = [];
  if (!capabilities.protocols.includes(method.protocol))
    reasons.push(
      `Requires ${method.protocol}; this problem exposes ${capabilities.protocols.join(", ")}`,
    );
  for (const flag of method.requires ?? [])
    if (!capabilities.features.includes(flag))
      reasons.push(`Requires capability: ${flag}`);
  return { compatible: reasons.length === 0, reasons };
}
export function methodMetadata(method, capabilities) {
  const {
    id,
    name,
    description,
    protocol,
    mode,
    parameters,
    requires,
    category,
    family,
    variant,
    objective,
    referenceKeys,
    implementationNotes,
  } = method;
  return {
    id,
    name,
    description,
    protocol,
    mode,
    parameters,
    requires,
    category,
    family,
    variant,
    objective,
    referenceKeys,
    implementationNotes,
    ...compatibility(method, capabilities),
  };
}
