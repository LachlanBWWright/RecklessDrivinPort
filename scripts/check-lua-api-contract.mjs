import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const contract = await readFile(new URL('documentation/reckless.d.lua', root), 'utf8');
const native = await readFile(new URL('source/scripts.c', root), 'utf8');
const generatedApi = await readFile(new URL('angular-site/src/app/lua-script-api.generated.ts', root), 'utf8');

function declaredMethods(source, className) {
  return new Set(
    [...source.matchAll(new RegExp(`function ${className}:([A-Za-z][A-Za-z0-9_]*)\\(`, 'g'))].map(
      (match) => match[1],
    ),
  );
}

function completionLabels(source, arrayName, type) {
  const arrayStart = source.indexOf(`export const ${arrayName}`);
  const nextArray = source.indexOf('\nexport const ', arrayStart + 1);
  const block = source.slice(arrayStart, nextArray < 0 ? source.length : nextArray);
  return new Set(
    [...block.matchAll(new RegExp(`label: ["']([^"']+)["'],\\s+type: ["']${type}["']`, 'g'))].map(
      (match) => match[1],
    ),
  );
}

function assertSame(label, expected, actual) {
  const missing = [...expected].filter((name) => !actual.has(name));
  const extra = [...actual].filter((name) => !expected.has(name));
  if (missing.length || extra.length) {
    throw new Error(
      `${label} drifted from documentation/reckless.d.lua; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    );
  }
}

const contractSelf = declaredMethods(contract, 'Object');
const contractContext = declaredMethods(contract, 'Context');
const contractHooks = new Set(
  [...contract.matchAll(/^function (on[A-Z][A-Za-z0-9_]*)\(/gm)].map((match) => match[1]),
);
const nativeSelf = new Set(
  [...native.matchAll(/RegisterMethod\(L, "([^"]+)", LuaSelf[A-Za-z0-9_]+\)/g)].map(
    (match) => match[1],
  ),
);
const nativeContext = new Set(
  [...native.matchAll(/RegisterMethod\(L, "([^"]+)", (?:LuaCtx[A-Za-z0-9_]+|LuaLog)\)/g)].map(
    (match) => match[1],
  ),
);
const runtimeHooks = new Set(
  [...native.matchAll(/"(on[A-Z][A-Za-z0-9_]*)"/g)].map((match) => match[1]),
);

assertSame('self API/native registration', contractSelf, nativeSelf);
assertSame('context API/native registration', contractContext, nativeContext);
assertSame('self API/Angular completion', contractSelf, completionLabels(generatedApi, 'LUA_SELF_COMPLETIONS', 'method'));
assertSame('context API/Angular completion', contractContext, completionLabels(generatedApi, 'LUA_CTX_COMPLETIONS', 'method'));
assertSame('hooks/runtime', contractHooks, runtimeHooks);
assertSame('hooks/Angular completion', contractHooks, completionLabels(generatedApi, 'LUA_HOOK_COMPLETIONS', 'hook'));

console.log(
  `Lua API contract OK: ${contractSelf.size} self methods, ${contractContext.size} context methods, ${contractHooks.size} hooks`,
);
