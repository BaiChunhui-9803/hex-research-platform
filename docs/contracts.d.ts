export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export interface Metric {
  id: string;
  name: string;
  direction: "max" | "min" | "context";
  unit: string;
}
export interface Capabilities {
  protocols: string[];
  features: string[];
  searchMeaning?: string;
  encoding?: string;
  objectiveSchema?: Metric[];
}
export interface Evaluation {
  valid: boolean;
  score: number;
  objectives?: number[] | null;
  metrics?: unknown;
  [key: string]: unknown;
}
export interface SearchTask<S = Json> {
  protocol: "optimization/v1";
  temperature?: number;
  objectiveSchema?: Metric[];
  initial(random: () => number): S;
  sample(random: () => number): S;
  mutate(solution: S, random: () => number): S;
  evaluate(solution: S): Evaluation;
}
/** All vector coordinates are normalized to [0,1]; objectives are minimized. */
export interface VectorTask<S = Json> {
  protocol: "vector-optimization/v1";
  dimension: number;
  encoding: string;
  objectiveSchema: Metric[];
  initial(random: () => number): number[];
  decode(vector: number[]): S;
  evaluate(vector: number[]): Evaluation;
}
export interface MethodOptions {
  evaluations: number;
  populationSize?: number;
}
export interface SearchContext {
  random(): number;
  check?(): void;
  shouldStop(): boolean;
  evaluate(candidate: Json): Evaluation;
}
export interface ParetoPoint {
  objectives: number[];
  score: number;
  solution: Json;
  vector: number[];
}
export interface SearchResult {
  solution: Json;
  score: number;
  evaluations: number;
  trace: { iteration: number; score: number | null }[];
  vector?: number[];
  paretoArchive?: ParetoPoint[];
  objectiveSchema?: Metric[];
  selectionRule?: string;
  implementation?: object;
}
export interface MethodBase {
  id: string;
  name: string;
  description: string;
  requires?: string[];
  maxChange?: number;
  objective: "single" | "multi" | "control";
  category: string;
  family: string;
  variant: string;
  referenceKeys?: string[];
  implementationNotes?: string;
  parameters?: object[];
}
export interface NativeSearchMethod extends MethodBase {
  mode: "search";
  protocol: "optimization/v1";
  solve(
    task: SearchTask,
    options: MethodOptions,
    context: SearchContext,
  ): SearchResult;
}
export interface VectorSearchMethod extends MethodBase {
  mode: "search";
  protocol: "vector-optimization/v1";
  solve(
    task: VectorTask,
    options: MethodOptions,
    context: SearchContext,
  ): SearchResult;
}
export interface PolicyMethod extends MethodBase {
  mode: "policy";
  protocol: string;
  decide(observation: Json, options: object, context: SearchContext): Json;
}
export type Method = NativeSearchMethod | VectorSearchMethod | PolicyMethod;
export interface Environment {
  observe(): Json;
  metrics(): Record<string, number | boolean | string | null>;
  renderState(): unknown;
  tick(): number;
  time(): number;
  done(): boolean;
  apply(action: Json): void;
  advance(): void;
  clearSolution(): void;
  decisionDue(mode: Method["mode"], previous: Json | null): boolean;
  decisionStamp(): Json;
  opened?(): boolean;
  createSearchTask(maxChange?: number): SearchTask;
  createVectorTask?(maxChange?: number): VectorTask;
  acceptSolution(solution: Json): void;
}
export interface Problem {
  id: string;
  name: string;
  shortName: string;
  description: string;
  view: string;
  timeUnit: string;
  stepSize: number;
  defaultScenario: string;
  scenarios: {
    id: string;
    name: string;
    description: string;
    dynamic?: boolean;
  }[];
  metrics: Metric[];
  capabilities(scenarioId: string): Capabilities;
  settings?(scenarioId: string): object[];
  validateConfig(input: object): {
    scenarioId: string;
    seed: number;
    [key: string]: unknown;
  };
  create(config: ReturnType<Problem["validateConfig"]>): Environment;
}
export interface ProblemView {
  update(view: object): void;
  render(): void;
  dispose(): void;
}
export type MountView = (options: {
  host: HTMLElement;
  controls: HTMLElement;
  onAction(action: Json): Promise<object>;
  onPause(): void;
  notice(message: string, error?: boolean): void;
}) => ProblemView;
