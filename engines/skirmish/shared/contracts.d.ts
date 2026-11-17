export type TeamId = "blue" | "orange" | "violet";
export type UnitType = "rifle" | "heavy" | "marksman";
export interface Hex {
  q: number;
  r: number;
}
export interface Command {
  team: TeamId;
  unitIds: string[];
  type: "move" | "attackMove" | "attack" | "hold";
  target?: Hex;
  targetId?: string;
}
export interface Unit extends Hex {
  id: string;
  team: TeamId;
  type: UnitType;
  hp: number;
  maxHp: number;
  cooldown: number;
  move: null | { from: Hex; to: Hex; elapsed: number; duration: number };
}
export interface Observation {
  version: string;
  team: TeamId;
  tick: number;
  time: number;
  map: object;
  own: Unit[];
  enemies: Unit[];
  unitTypes: object;
}
export interface Policy {
  id: string;
  name: string;
  description: string;
  decide(
    observation: Observation,
    context: { random: () => number },
  ): Omit<Command, "team">[];
}
