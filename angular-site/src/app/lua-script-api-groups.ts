import { LUA_CONSTANT_COMPLETIONS } from './lua-script-api-constants';
import { LUA_CTX_COMPLETIONS } from './lua-script-api-context';
import { LUA_HOOK_COMPLETIONS } from './lua-script-api-hooks';
import { LUA_SELF_COMPLETIONS } from './lua-script-api-self';
import { LUA_SNIPPET_COMPLETIONS } from './lua-script-api-snippets';
import type { LuaApiGroup } from './lua-script-api.types';

export const LUA_API_GROUPS: readonly LuaApiGroup[] = [
  { id: 'hooks', label: 'Lifecycle Hooks', completions: LUA_HOOK_COMPLETIONS },
  { id: 'self', label: 'self Methods', completions: LUA_SELF_COMPLETIONS },
  { id: 'ctx', label: 'ctx Methods', completions: LUA_CTX_COMPLETIONS },
  { id: 'constants', label: 'Constants', completions: LUA_CONSTANT_COMPLETIONS },
  { id: 'snippets', label: 'Snippets', completions: LUA_SNIPPET_COMPLETIONS },
];
