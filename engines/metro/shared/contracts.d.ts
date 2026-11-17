export type Shape = "circle" | "triangle" | "square";
export interface HexCell {
  q: number;
  r: number;
  terrain?: string;
  requires?: string[];
  cost?: number;
}
export interface Station extends HexCell {
  id: string;
  name: string;
  shape: Shape;
  demand: number;
  opensAt?: number;
}
export interface Line {
  id: "A" | "B" | "C";
  stops: string[];
}
export interface Plan {
  lines: Line[];
}
export interface Evaluation {
  valid: boolean;
  score: number;
  delivered?: number;
  completion?: number;
  averageQueue?: number;
  overflow?: number;
  track?: number;
  editUnits?: number;
  editOperations?: number;
  remaining?: number;
  errors?: string[];
}
export interface PlanningProblem {
  version: string;
  scenario: object;
  seed: number;
  horizon: number;
  weights: Record<string, number>;
  schedule: object[];
}
export interface SolverContext {
  random: () => number;
  evaluate: (plan: Plan) => Evaluation;
  progress: (fraction: number, message: string) => void;
  shouldStop: () => boolean;
}
export interface Solver {
  id: string;
  name: string;
  description: string;
  solve(
    problem: PlanningProblem,
    options: Record<string, unknown>,
    context: SolverContext,
  ): Promise<Plan> | Plan;
}
export interface MapRules {
  id: string;
  canBuildStation(cell: HexCell): boolean;
  canTraverse(from: HexCell, to: HexCell, context: object): boolean;
  traversalCost(from: HexCell, to: HexCell, context: object): number;
}
export interface OnlineObservation {
  time: number;
  scenario: object;
  plan: Plan;
  queues: Array<{ id: string; passengers: object[] }>;
  metrics: Partial<Evaluation>;
  remainingEditBudget: number;
}
export interface AdaptivePolicy {
  id: string;
  name: string;
  description: string;
  maxChange?: number;
  decide(
    observation: OnlineObservation,
    options: { iterations: number; opened: boolean; maxChange: number },
    context: Pick<SolverContext, "random" | "evaluate" | "shouldStop">,
  ): Plan;
}
