# Browser Lua workspace

Open **Lua editor** in the editor toolbar, or open a script from its object/level binding.

## Drafts and applying changes

The workspace edits a copy of the scripts and bindings. New, duplicate, rename, delete, imports,
and binding changes remain in that copy until **Apply to resource pack** is selected.
Deleting a script explicitly removes its object and level bindings in the draft.

Edits are saved locally to IndexedDB after a short pause. **Save draft & close** waits for
the storage transaction and accepts unfinished Lua. Opening the same resource project offers
recovery; the recovered source, selected file, cursor/selection, and scroll positions are restored.
Storage failures are shown in the editor. Export a ZIP or individual Lua files for portable backups.
Closing a clean editor does not remove an unreviewed saved draft.

Apply synchronously validates the latest source and binding snapshot. Syntax and structural errors
block application, but warnings do not. **Apply & test** flushes the changes through the existing
resource-saving flow and launches the chosen level with scripts enabled.

## Language assistance

Each script executes in an isolated Lua state. Other scripts' global functions are therefore
not completion candidates or F12 targets. Project search still finds their source.

The browser analyzer tracks local scopes, parameters, shadowing, local/global functions, hook
parameter roles, and simple object/context aliases. It supplies completions, hover, local definition
navigation, an outline, and signature help with an active-argument indicator. Available standard
library functions are included, while game methods and resource IDs come from the generated host
contract and loaded resource pack. Unknown host methods and dot calls that need colon syntax
produce warnings. Suggestions are suppressed inside comments and strings.

This is lightweight static assistance, not full LuaLS type inference. The current `luaparse`
dependency accepts Lua 5.3 grammar; the game runtime is Lua 5.5. Newer grammar extensions need a
parser upgrade. LuaLS project exports use the actual runtime version.

## Diagnostics and runtime console

The Problems panel covers the whole draft project. Selecting a diagnostic opens the script and
jumps to its location. The API sidebar's diagnostics are also clickable.

Native Lua calls preserve stack traces and emit structured runtime failures in release builds.
The game bridge captures these alongside Lua print/log output in a bounded console. Clicking a
runtime failure opens its script and line. Runtime locations refer to the applied version used by
the game; unapplied edits can move those lines.

## Project exchange

ZIPs preserve IDs, names, source text, object/level binding flags, resource references, and generated
LuaLS definitions. Imports check paths, encoding, manifest versions, duplicate entries, dangling
bindings, and archive limits. Structurally valid packages with broken Lua may be imported as drafts.
The preview lists script and binding changes and missing resource references before replacing the
working draft. Single `.lua` import replaces the active file after the same review step.

Unchanged source retains its original line endings on export. Editing through CodeMirror uses its
normalized line endings. ZIP exports are available even when the draft needs repair.

## Performance and shortcuts

The editor is loaded on demand. A module worker caches per-script analysis and receives changed
files and removals, keeping project validation off the main thread. A local fallback is available
when workers cannot start. The last validation before Apply always runs against the current snapshot.

- Tab accepts completion and moves through inserted arguments; Shift+Tab moves back.
- F12 jumps to a visible symbol's definition.
- Ctrl/Cmd+S applies; Ctrl/Cmd+Shift+S saves a local draft.
- Ctrl/Cmd+Shift+F opens project search.
- Alt+Left/Right switches scripts. Tab-strip arrows and Home/End navigate tabs.

## Checks

Focused unit coverage lives in `lua-language.spec.ts`, `lua-workspace.spec.ts`,
`lua-script-completions.spec.ts`, `lua-project.spec.ts`, and the dialog tests.
`e2e/lua-editor.spec.ts` covers reload recovery, staged file imports, clickable diagnostics,
and exact file export. Native scripting tests cover traceback preservation and Lua stack balance.
