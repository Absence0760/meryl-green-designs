#!/usr/bin/env bash
# Prepare client product photos for upload to Sanity Studio.
#
# Takes phone photos (typically WhatsApp-compressed JPEGs, or HEIC/PNG
# originals), auto-orients them, applies a gentle clean-up, fits them within
# a 2400px long edge (never upscales), strips ALL metadata (EXIF incl. GPS,
# XMP, IPTC, ICC), converts to sRGB and writes progressive JPEG q90 4:2:0.
# Sanity handles further resizing / format negotiation on its CDN.
#
# Originals are never modified. Output must go outside any git working tree
# or into a gitignored path (e.g. `.tmp-images/` in this repo) — client
# photos must NEVER be committed (this is a public repo).
#
# Usage: scripts/prepare-photos.sh [options] <file|dir>...
#   Run with --help for the option list. Tests: scripts/test-prepare-photos.sh
# Docs: docs/run-locally.md § "Preparing product photos".
#
# Requires ImageMagick 7 (`magick`): brew install imagemagick
# Compatible with macOS's stock bash 3.2.

set -euo pipefail

PROG="$(basename "$0")"
MAX_EDGE=2400
JPEG_QUALITY=90
WEBP_QUALITY=85
COMPARE_EDGE=1200

usage() {
	cat <<EOF
Usage: $PROG [options] <file|dir>...

Prepare product photos for upload: auto-orient, gentle enhancement, fit
within ${MAX_EDGE}px (never upscale), strip metadata incl. GPS, sRGB,
progressive JPEG q${JPEG_QUALITY}.

Inputs are image files (jpg/jpeg/png/heic/heif/webp/tif/tiff) or directories
(non-recursive, processed in sorted filename order).

Options:
  -o, --out DIR    Output directory (default: ./prepared). Must be outside a
                   git working tree or gitignored — in this repo use
                   .tmp-images/prepared
  -n, --name SLUG  Name outputs SLUG-01.jpg, SLUG-02.jpg … in input order
                   (default: a slug of each original filename)
      --gentle     Lighter touch for already-saturated shots (e.g. sunsets)
      --webp       Also write a .webp next to each .jpg
      --compare    Write side-by-side before/after sheets to DIR/compare/
      --dry-run    Print what would happen; write nothing
  -f, --force      Overwrite existing outputs (never the originals)
  -h, --help       Show this help

Example:
  $PROG --name acacia-screen --compare -o .tmp-images/prepared ~/Downloads/acacia/
EOF
}

die() {
	printf '%s: error: %s\n' "$PROG" "$*" >&2
	exit 1
}

# --- pure helpers (sourced by the test script via PREPARE_PHOTOS_LIB=1) ---

# slugify "WhatsApp Image 2026-09-24 at 09.16.33 (2).jpeg"
#   → "2026-09-24-09-16-33-2"
# Strips the extension and any directory, lowercases, drops the WhatsApp
# boilerplate ("WhatsApp Image … at …"), and collapses everything that isn't
# [a-z0-9] into single hyphens.
slugify() {
	local s
	s="$(basename -- "$1")"
	case "$s" in
	*.*) s="${s%.*}" ;;
	esac
	s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')"
	s="$(printf '%s' "$s" | sed -E \
		-e 's/^whatsapp (image|photo) //' \
		-e 's/^([0-9]{4}-[0-9]{2}-[0-9]{2}) at /\1 /' \
		-e 's/[^a-z0-9]+/-/g' \
		-e 's/^-+//' -e 's/-+$//')"
	[ -n "$s" ] || s="photo"
	printf '%s' "$s"
}

# is_image PATH → 0 if the extension is one we process.
is_image() {
	local ext
	ext="$(printf '%s' "${1##*.}" | tr '[:upper:]' '[:lower:]')"
	case "$ext" in
	jpg | jpeg | png | heic | heif | webp | tif | tiff) return 0 ;;
	*) return 1 ;;
	esac
}

# abspath PATH → absolute path, resolving symlinks in the existing part.
# Works for paths that don't exist yet (resolves the nearest existing parent).
abspath() {
	local p="$1" tail=""
	case "$p" in /*) ;; *) p="$PWD/$p" ;; esac
	while [ ! -d "$p" ]; do
		tail="/$(basename -- "$p")$tail"
		p="$(dirname -- "$p")"
	done
	p="$(cd "$p" && pwd -P)"
	printf '%s%s' "${p%/}" "$tail"
}

# nearest_existing_dir PATH → the deepest existing directory at or above PATH.
nearest_existing_dir() {
	local p="$1"
	while [ ! -d "$p" ]; do p="$(dirname -- "$p")"; done
	printf '%s' "$p"
}

# check_out_dir ABS_DIR → dies unless ABS_DIR is outside any git work tree
# or is gitignored there.
check_out_dir() {
	local dir="$1" base top
	base="$(nearest_existing_dir "$dir")"
	command -v git >/dev/null 2>&1 || return 0
	top="$(git -C "$base" rev-parse --show-toplevel 2>/dev/null)" || return 0
	if ! git -C "$top" check-ignore -q -- "$dir/.prepare-photos-probe.jpg"; then
		die "output dir '$dir' is inside the git work tree '$top' and is not gitignored.
Client photos must never be committed. Use a gitignored path instead, e.g.:
  $PROG -o .tmp-images/prepared …"
	fi
}

human_kb() {
	awk -v b="$1" 'BEGIN { printf "%.0f", b / 1024 }'
}

file_bytes() {
	wc -c <"$1" | tr -d ' '
}

if [ "${PREPARE_PHOTOS_LIB:-0}" = "1" ]; then
	# Sourced for tests — expose helpers only.
	# shellcheck disable=SC2317  # exit is the fallback when run, not sourced
	return 0 2>/dev/null || exit 0
fi

# --- args ---

OUT_DIR="./prepared"
NAME=""
GENTLE=0
WEBP=0
COMPARE=0
DRY_RUN=0
FORCE=0
INPUT_ARGS=()

while [ $# -gt 0 ]; do
	case "$1" in
	-o | --out)
		[ $# -ge 2 ] || die "$1 needs a directory"
		OUT_DIR="$2"
		shift 2
		;;
	--out=*) OUT_DIR="${1#*=}"; shift ;;
	-n | --name)
		[ $# -ge 2 ] || die "$1 needs a slug"
		NAME="$2"
		shift 2
		;;
	--name=*) NAME="${1#*=}"; shift ;;
	--gentle) GENTLE=1; shift ;;
	--webp) WEBP=1; shift ;;
	--compare) COMPARE=1; shift ;;
	--dry-run) DRY_RUN=1; shift ;;
	-f | --force) FORCE=1; shift ;;
	-h | --help) usage; exit 0 ;;
	--) shift; while [ $# -gt 0 ]; do INPUT_ARGS+=("$1"); shift; done ;;
	-*) die "unknown option: $1 (see --help)" ;;
	*) INPUT_ARGS+=("$1"); shift ;;
	esac
done

[ ${#INPUT_ARGS[@]} -gt 0 ] || { usage >&2; exit 1; }

if [ -n "$NAME" ]; then
	clean="$(slugify "$NAME.x")"
	[ "$clean" = "$NAME" ] || die "--name must be a slug (lowercase a-z, 0-9, hyphens), e.g. '$clean'"
fi

if ! command -v magick >/dev/null 2>&1; then
	die "ImageMagick 7 ('magick') is not installed. Install it with:
  brew install imagemagick"
fi

# --- collect inputs (in the order given; directories sorted) ---

INPUTS=()
for arg in "${INPUT_ARGS[@]}"; do
	if [ -d "$arg" ]; then
		found=0
		while IFS= read -r f; do
			if is_image "$f"; then
				INPUTS+=("$f")
				found=1
			fi
		done < <(find "$arg" -mindepth 1 -maxdepth 1 -type f ! -name '.*' | LC_ALL=C sort)
		[ "$found" = 1 ] || printf '%s: warning: no images found in %s\n' "$PROG" "$arg" >&2
	elif [ -f "$arg" ]; then
		is_image "$arg" || die "not a supported image type: $arg"
		INPUTS+=("$arg")
	else
		die "no such file or directory: $arg"
	fi
done

[ ${#INPUTS[@]} -gt 0 ] || die "no input images"

OUT_ABS="$(abspath "$OUT_DIR")"
check_out_dir "$OUT_ABS"

# --- plan output names ---

OUTPUTS=()
i=0
for f in "${INPUTS[@]}"; do
	i=$((i + 1))
	if [ -n "$NAME" ]; then
		base="$(printf '%s-%02d' "$NAME" "$i")"
	else
		base="$(slugify "$f")"
		# De-duplicate slugs that collide (e.g. "a.jpg" + "a.png").
		candidate="$base" n=2
		while :; do
			clash=0
			for existing in ${OUTPUTS[@]+"${OUTPUTS[@]}"}; do
				[ "$existing" = "$candidate" ] && clash=1 && break
			done
			[ "$clash" = 0 ] && break
			candidate="$base-$n"
			n=$((n + 1))
		done
		base="$candidate"
	fi
	OUTPUTS+=("$base")
done

# Refuse to clobber an original or (without --force) a previous output.
for idx in "${!INPUTS[@]}"; do
	in_abs="$(abspath "${INPUTS[$idx]}")"
	for j in "${!OUTPUTS[@]}"; do
		for ext in jpg webp; do
			target="$OUT_ABS/${OUTPUTS[$j]}.$ext"
			[ "$target" = "$in_abs" ] && die "output $target would overwrite an original; choose another --out"
		done
	done
done
if [ "$FORCE" = 0 ]; then
	for b in "${OUTPUTS[@]}"; do
		for ext in jpg webp; do
			[ -e "$OUT_ABS/$b.$ext" ] && die "$OUT_ABS/$b.$ext already exists (use --force to overwrite)"
		done
	done
fi

# --- pipeline ---

if [ "$GENTLE" = 1 ]; then
	ENHANCE=(-contrast-stretch 0.1%x0.2% -unsharp 0x0.8+0.4+0.03)
else
	# shellcheck disable=SC2054  # commas are ImageMagick arg syntax
	ENHANCE=(-enhance -contrast-stretch 0.2%x0.4% -sigmoidal-contrast 2.5,45%
		-modulate 102,110,100 -unsharp 0x1.0+0.5+0.03)
fi
# Resize before sharpening so unsharp works at output scale. `>` = only shrink.
PRE=(-auto-orient -colorspace sRGB -resize "${MAX_EDGE}x${MAX_EDGE}>")
JPEG_OUT=(-strip -colorspace sRGB -interlace JPEG -sampling-factor 4:2:0 -quality "$JPEG_QUALITY")
WEBP_OUT=(-strip -colorspace sRGB -quality "$WEBP_QUALITY" -define webp:method=6)

run() {
	if [ "$DRY_RUN" = 1 ]; then
		printf '  $'
		printf ' %q' "$@"
		printf '\n'
	else
		"$@"
	fi
}

if [ "$DRY_RUN" = 1 ]; then
	printf 'Dry run — nothing will be written. Output dir: %s\n' "$OUT_ABS"
else
	mkdir -p "$OUT_ABS"
	[ "$COMPARE" = 0 ] || mkdir -p "$OUT_ABS/compare"
fi

ROWS=()
for idx in "${!INPUTS[@]}"; do
	in="${INPUTS[$idx]}"
	b="${OUTPUTS[$idx]}"
	out="$OUT_ABS/$b.jpg"
	# [0] = first frame/page only (HEIC bursts, multi-page TIFF).
	src="${in}[0]"

	[ "$DRY_RUN" = 0 ] || printf '%s → %s\n' "$in" "$out"
	run magick "$src" "${PRE[@]}" "${ENHANCE[@]}" "${JPEG_OUT[@]}" "$out"
	if [ "$WEBP" = 1 ]; then
		run magick "$src" "${PRE[@]}" "${ENHANCE[@]}" "${WEBP_OUT[@]}" "$OUT_ABS/$b.webp"
	fi
	if [ "$COMPARE" = 1 ]; then
		run magick \
			\( "$src" -auto-orient -colorspace sRGB -resize "${COMPARE_EDGE}x${COMPARE_EDGE}>" \) \
			\( "$out" -resize "${COMPARE_EDGE}x${COMPARE_EDGE}>" \) \
			-bordercolor white -border 8 +append \
			-strip -quality 85 "$OUT_ABS/compare/$b-compare.jpg"
	fi

	if [ "$DRY_RUN" = 0 ]; then
		# Oriented dimensions, so a rotated phone shot reads the same as its output.
		in_dims="$(magick "$src" -auto-orient -format '%wx%h' info: 2>/dev/null || echo '?')"
		out_dims="$(magick identify -format '%wx%h' "$out")"
		ROWS+=("$(basename -- "$in")|$b.jpg|$in_dims|$out_dims|$(human_kb "$(file_bytes "$in")")|$(human_kb "$(file_bytes "$out")")")
	fi
done

[ "$DRY_RUN" = 0 ] || exit 0

printf '\n%-44s  %-32s  %-11s  %-11s  %8s  %8s\n' "INPUT" "OUTPUT" "IN DIMS" "OUT DIMS" "IN KB" "OUT KB"
for row in "${ROWS[@]}"; do
	IFS='|' read -r c1 c2 c3 c4 c5 c6 <<EOF
$row
EOF
	printf '%-44.44s  %-32.32s  %-11s  %-11s  %8s  %8s\n' "$c1" "$c2" "$c3" "$c4" "$c5" "$c6"
done
printf '\nWrote %d photo(s) to %s' "${#ROWS[@]}" "$OUT_ABS"
[ "$COMPARE" = 0 ] || printf ' (before/after sheets in compare/)'
printf '\nReview, then upload via Sanity Studio. Never commit these files.\n'
