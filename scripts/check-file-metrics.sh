#!/usr/bin/env bash
# check-file-metrics.sh — reports TypeScript/HTML source files by line count and
# maximum indentation depth.
#
# Categories reported:
#   Lines:        > 300 (warning)   > 700 (critical)
#   Indentation:  > 3 levels        > 6 levels  (each 2-space or 4-space indent = 1 level)
#
# Usage:
#   ./scripts/check-file-metrics.sh [root_dir]
#
# Exits 0 always (informational only).

set -euo pipefail

ROOT="${1:-angular-site/src}"
INDENT_UNIT=2   # spaces per indentation level

# ---------- helpers -----------------------------------------------------------

# Maximum indentation depth in a file (counts leading spaces / INDENT_UNIT)
max_indent() {
  local file="$1"
  local max=0
  while IFS= read -r line; do
    # Count leading spaces
    local stripped="${line#"${line%%[! ]*}"}"
    local spaces=$(( ${#line} - ${#stripped} ))
    local depth=$(( spaces / INDENT_UNIT ))
    (( depth > max )) && max=$depth
  done < "$file"
  printf '%d' "$max"
}

# ---------- main --------------------------------------------------------------

declare -a warn_lines=()   # > 300 lines
declare -a crit_lines=()   # > 700 lines
declare -a warn_indent=()  # > 3 indent levels
declare -a crit_indent=()  # > 6 indent levels

while IFS= read -r -d '' file; do
  lines=$(wc -l < "$file")
  indent=$(max_indent "$file")

  (( lines > 700 )) && crit_lines+=("  $lines  $file")
  (( lines > 300 && lines <= 700 )) && warn_lines+=("  $lines  $file")
  (( indent > 6 )) && crit_indent+=("  $indent levels  $file")
  (( indent > 3 && indent <= 6 )) && warn_indent+=("  $indent levels  $file")
done < <(find "$ROOT" \( -name '*.ts' -o -name '*.html' \) ! -path '*/node_modules/*' -print0)

# ---------- output ------------------------------------------------------------

echo "============================================================"
echo " File Metrics Report  (root: $ROOT)"
echo "============================================================"

echo ""
echo "── CRITICAL: > 700 lines ───────────────────────────────────"
if [[ ${#crit_lines[@]} -eq 0 ]]; then
  echo "  (none)"
else
  printf '%s\n' "${crit_lines[@]}" | sort -rn
fi

echo ""
echo "── WARNING:  300–700 lines ─────────────────────────────────"
if [[ ${#warn_lines[@]} -eq 0 ]]; then
  echo "  (none)"
else
  printf '%s\n' "${warn_lines[@]}" | sort -rn
fi

echo ""
echo "── CRITICAL: > 6 indentation levels ───────────────────────"
if [[ ${#crit_indent[@]} -eq 0 ]]; then
  echo "  (none)"
else
  printf '%s\n' "${crit_indent[@]}" | sort -rn
fi

echo ""
echo "── WARNING:  4–6 indentation levels ────────────────────────"
if [[ ${#warn_indent[@]} -eq 0 ]]; then
  echo "  (none)"
else
  printf '%s\n' "${warn_indent[@]}" | sort -rn
fi

echo ""
echo "============================================================"
