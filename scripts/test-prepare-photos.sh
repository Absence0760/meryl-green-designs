#!/usr/bin/env bash
# shellcheck disable=SC2015  # `test && ok || bad` is intentional: ok never fails
#
# Tests for scripts/prepare-photos.sh. Standalone — not wired into
# `pnpm test` (it needs ImageMagick, which CI doesn't install).
#
#   scripts/test-prepare-photos.sh
#
# Generates synthetic images (with fake EXIF incl. a GPS IFD and a rotate-90
# orientation tag) in a temp dir, runs the tool, and asserts on outputs,
# dimensions (no upscaling), stripped metadata, naming, and the safety
# guards. Everything happens under mktemp; nothing touches the repo.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL="$HERE/prepare-photos.sh"

command -v magick >/dev/null 2>&1 || {
	echo "SKIP: ImageMagick ('magick') not installed — brew install imagemagick" >&2
	exit 0
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/prepare-photos-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL %s\n' "$1"; [ $# -lt 2 ] || printf '       %s\n' "$2"; }
eq() { # eq <label> <expected> <actual>
	if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$2', got '$3'"; fi
}
succeeds() { # succeeds <label> <cmd...>
	local label="$1"; shift
	if "$@" >"$TMP/last.log" 2>&1; then ok "$label"; else bad "$label" "$(tail -3 "$TMP/last.log")"; fi
}
fails() { # fails <label> <expected-stderr-substring> <cmd...>
	local label="$1" want="$2"; shift 2
	if "$@" >"$TMP/last.log" 2>&1; then
		bad "$label" "expected non-zero exit"
	elif grep -qF -- "$want" "$TMP/last.log"; then
		ok "$label"
	else
		bad "$label" "missing '$want' in: $(tail -3 "$TMP/last.log")"
	fi
}
dims() { magick identify -format '%wx%h' "$1"; }
exif() { magick identify -format '%[EXIF:*]' "$1"; }
checksum() { cksum <"$1"; }

# --- unit: slugify ---
echo "slugify"
# shellcheck source=scripts/prepare-photos.sh disable=SC1091
PREPARE_PHOTOS_LIB=1 . "$TOOL"
eq "WhatsApp name" "2026-09-24-09-16-33-2" "$(slugify "WhatsApp Image 2026-09-24 at 09.16.33 (2).jpeg")"
eq "WhatsApp name, no suffix" "2026-09-24-09-16-33" "$(slugify "/x/WhatsApp Image 2026-09-24 at 09.16.33.jpeg")"
eq "iPhone name" "img-1234" "$(slugify "IMG_1234.HEIC")"
eq "spaces + punctuation" "acacia-screen-final" "$(slugify "  Acacia Screen (FINAL)!.png")"
eq "empty slug fallback" "photo" "$(slugify "___.jpg")"
eq "no extension" "readme" "$(slugify "README")"

# --- fixtures ---
IN="$TMP/in"
mkdir -p "$IN"
# Minimal EXIF APP1: IFD0 = Orientation(6 = rotate 90° CW) + GPS IFD pointer;
# GPS IFD = GPSVersionID 2.2.0.0.
printf 'Exif\000\000II*\000\010\000\000\000\002\000\022\001\003\000\001\000\000\000\006\000\000\000\045\210\004\000\001\000\000\000\046\000\000\000\000\000\000\000\001\000\000\000\001\000\004\000\000\000\002\002\000\000\000\000\000\000' >"$TMP/exif.bin"
magick -size 3000x2000 plasma:fractal -seed 1 "$TMP/big.jpg"
magick "$TMP/big.jpg" -profile "APP1:$TMP/exif.bin" -orient TopLeft "$IN/a-big.jpg"
magick -size 300x200 gradient:red-blue "$TMP/rot.jpg"
magick "$TMP/rot.jpg" -profile "APP1:$TMP/exif.bin" -orient RightTop "$IN/WhatsApp Image 2026-09-24 at 09.16.33 (2).jpeg"
magick -size 800x600 gradient:green-yellow "$IN/c-small.png"
echo "not an image" >"$IN/notes.txt"

eq "fixture has GPS EXIF" "1" "$(exif "$IN/a-big.jpg" | grep -c GPSVersionID || true)"
BEFORE_SUM="$(checksum "$IN/a-big.jpg")"

# --- e2e: default naming ---
echo "default run"
OUT="$TMP/out"
succeeds "runs on a directory" "$TOOL" --webp --compare -o "$OUT" "$IN"
for f in a-big.jpg 2026-09-24-09-16-33-2.jpg c-small.jpg; do
	[ -f "$OUT/$f" ] && ok "writes $f" || bad "writes $f"
	[ -f "$OUT/${f%.jpg}.webp" ] && ok "writes ${f%.jpg}.webp" || bad "writes ${f%.jpg}.webp"
	[ -f "$OUT/compare/${f%.jpg}-compare.jpg" ] && ok "writes compare/${f%.jpg}-compare.jpg" || bad "writes compare sheet for $f"
	eq "no EXIF in $f" "" "$(exif "$OUT/$f")"
	eq "no EXIF in ${f%.jpg}.webp" "" "$(exif "$OUT/${f%.jpg}.webp")"
	eq "progressive $f" "JPEG" "$(magick identify -format '%[interlace]' "$OUT/$f")"
	eq "4:2:0 $f" "2x2,1x1,1x1" "$(magick identify -format '%[jpeg:sampling-factor]' "$OUT/$f")"
	eq "quality 90 $f" "90" "$(magick identify -format '%Q' "$OUT/$f")"
done
eq "downscales to 2400 long edge" "2400x1600" "$(dims "$OUT/a-big.jpg")"
eq "auto-orients (rotate 90)" "200x300" "$(dims "$OUT/2026-09-24-09-16-33-2.jpg")"
eq "never upscales" "800x600" "$(dims "$OUT/c-small.jpg")"
eq "skips non-images" "" "$(find "$OUT" -name "notes*")"
eq "original untouched" "$BEFORE_SUM" "$(checksum "$IN/a-big.jpg")"
grep -q "a-big.jpg" "$TMP/last.log" && grep -q "2400x1600" "$TMP/last.log" && ok "prints summary table" || bad "prints summary table"

# --- --name + --gentle, explicit file order ---
echo "--name / --gentle"
OUT2="$TMP/out2"
succeeds "runs with --name --gentle" "$TOOL" --gentle --name acacia-screen -o "$OUT2" "$IN/c-small.png" "$IN/a-big.jpg"
eq "numbers in input order (01)" "800x600" "$(dims "$OUT2/acacia-screen-01.jpg")"
eq "numbers in input order (02)" "2400x1600" "$(dims "$OUT2/acacia-screen-02.jpg")"
fails "rejects non-slug --name" "--name must be a slug" "$TOOL" --name "Bad Name" -o "$TMP/out3" "$IN"

# --- guards ---
echo "guards"
fails "refuses existing outputs" "already exists" "$TOOL" --name acacia-screen -o "$OUT2" "$IN/c-small.png"
succeeds "--force overwrites outputs" "$TOOL" --force --name acacia-screen -o "$OUT2" "$IN/c-small.png"
cp "$IN/c-small.png" "$TMP/c-small.jpg"
fails "refuses to overwrite an original" "would overwrite an original" "$TOOL" --force -o "$TMP" "$TMP/c-small.jpg"
succeeds "--dry-run exits 0" "$TOOL" --dry-run -o "$TMP/dry" "$IN"
[ ! -e "$TMP/dry" ] && ok "--dry-run writes nothing" || bad "--dry-run writes nothing"
fails "unknown option" "unknown option" "$TOOL" --bogus "$IN"
fails "missing input" "no such file" "$TOOL" -o "$TMP/x" "$TMP/nope.jpg"
fails "friendly error without magick" "brew install imagemagick" env PATH=/usr/bin:/bin "$TOOL" -o "$TMP/x" "$IN"

REPO="$TMP/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
fails "refuses a tracked path in a git repo" "not gitignored" "$TOOL" -o "$REPO/prepared" "$IN/c-small.png"
printf '.tmp-images/\n' >"$REPO/.gitignore"
succeeds "allows a gitignored path in a git repo" "$TOOL" -o "$REPO/.tmp-images/prepared" "$IN/c-small.png"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
