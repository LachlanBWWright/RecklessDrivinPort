export type LuaApiCompletionType =
  | 'variable'
  | 'function'
  | 'method'
  | 'property'
  | 'hook'
  | 'constant'
  | 'snippet';

export interface LuaApiCompletion {
  readonly label: string;
  readonly type: LuaApiCompletionType;
  readonly detail: string;
  readonly documentation: string;
  readonly apply?: string;
}

export interface LuaApiGroup {
  readonly id: string;
  readonly label: string;
  readonly completions: readonly LuaApiCompletion[];
}
