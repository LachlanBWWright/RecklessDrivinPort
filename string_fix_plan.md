# Pascal String (`\p`) Fix Plan

## Problem
GCC doesn't support the `\p` Pascal string escape (a Mac/Clang extension). Instead of setting byte 0 to the string length, GCC emits a literal `'p'` (0x70 = 112). This causes text rendering loops to read 112 bytes past the buffer → crash/freeze.

## Fix
Replace every `"\pFOO"` with `"\x0NFOO"` where `0N` is the hex length of the string body (excluding the length byte itself).

## All occurrences (67 total)

### Critical: Text Effects (cause crashes during gameplay)

| File | Line | Current | Replacement |
|------|------|---------|-------------|
| source/objects.c | 273 | `"\pOUCHeee"` | `"\x07OUCHeee"` |
| source/objectCollision.c | 369 | `"\pADDONShLOCKEDf"` | `"\x0eADDONShLOCKEDf"` |
| source/objectCollision.c | 377 | `"\pMINESee"` | `"\x07MINESee"` |
| source/objectCollision.c | 385 | `"\pMISSILESe"` | `"\x09MISSILESe"` |
| source/objectCollision.c | 394 | `"\pSPIKESe"` | `"\x07SPIKESe"` |
| source/objectCollision.c | 403 | `"\pPOLICEhJAMMER"` | `"\x0dPOLICEhJAMMER"` |
| source/objectCollision.c | 412 | `"\pTURBOhENGINEeee"` | `"\x10TURBOhENGINEeee"` |
| source/objectCollision.c | 420 | `"\p][[[hAWARDEDf"` | `"\x0d][[[hAWARDEDf"` |
| source/objectCollision.c | 428 | `"\pEXTRAhLIFEee"` | `"\x0dEXTRAhLIFEee"` |
| source/gameframe.c | 205 | `"\pTIMEhUPee"` | `"\x09TIMEhUPee"` |
| source/gameframe.c | 222 | `"\pEXTRAhLIFEee"` | `"\x0dEXTRAhLIFEee"` |
| source/gameframe.c | 233 | `"\pLEVELhCOMPLETED"` | `"\x0fLEVELhCOMPLETED"` |

### Non-critical: Error dialogs, file paths, UI strings

These are used with `DoError`, `FSMakeFSSpec`, `DrawString`, `DebugStr`, etc. Many of these code paths may be stubbed out, but they should still be fixed for correctness.

Run this to find them all:
```
grep -rn '\"\\p' source/ --include="*.c"
```

For each, count the characters after `\p` and replace `\p` with `\xNN` where NN is the hex count.

### Formula
```
"\pHELLO" → length of "HELLO" = 5 = 0x05 → "\x05HELLO"
```

### Special cases
- `"\p"` (empty Pascal string) → `"\x00"`
- Strings with `\x` escapes inside (e.g. `"\p\xA0\xA0\xA0..."` in interface.c:119-120): each `\xNN` is ONE byte, count accordingly
