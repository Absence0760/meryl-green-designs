import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { SanityGalleryPhoto, SanityProduct, SanityTestimonial } from './sanity.js';

// Local-dev content backend. Activated by CONTENT_BACKEND=local (the
// committed backend/.env.development default): the public content getters
// in sanity.ts read from <content dir>/content.json instead of Sanity
// (see resolveContentDir for which dir), and photos whose
// asset ref is `local:<file>` are served from <content dir>/images/
// by the /dev-content/images route. Lets new products and photos be
// previewed without a Sanity project, token, or network. Strictly
// dev-only — the env var stays unset on the deployed Lambda, so the
// image route isn't even registered there.

// `category` is optional in content.json, matching Sanity docs created
// before the field existed; getLocalProducts() defaults it to 'screen'
// the same way the GROQ projection's coalesce() does.
export type LocalContent = {
	products?: Array<Omit<SanityProduct, 'category'> & { category?: SanityProduct['category'] }>;
	galleryPhotos?: SanityGalleryPhoto[];
	testimonials?: SanityTestimonial[];
};

export const LOCAL_ASSET_PREFIX = 'local:';

const IMAGE_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp'
};

// Plain file names only — no separators, no leading dot — so a request
// can never walk out of the images directory.
const SAFE_IMAGE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(jpe?g|png|webp)$/i;

export function isLocalContent(): boolean {
	return (process.env.CONTENT_BACKEND ?? 'sanity').toLowerCase() === 'local';
}

function assertSafeDir(dir: string): string {
	const allowedRoots = [resolve(process.cwd()), resolve(tmpdir())];
	if (!allowedRoots.some((root) => dir === root || dir.startsWith(root + '/'))) {
		throw new Error(
			`CONTENT_DEV_DIR must be under the project working directory or the OS tmp dir, got: ${dir}`
		);
	}
	return dir;
}

// Writable local-dev data dir (CONTENT_DEV_DIR, default .dev-content).
// Holds the local order-skeleton store (orders-local.ts) and, when
// present, your own content.json + images/.
export function resolveLocalDataDir(): string {
	return assertSafeDir(resolve(process.env.CONTENT_DEV_DIR ?? '.dev-content'));
}

// Committed sample content (generic placeholder copy + images), relative
// to the backend working directory. Used when you haven't set up your own
// content, so a fresh clone shows a populated shop with zero setup.
export const SAMPLE_CONTENT_DIR = 'dev-content.sample';

// Where content.json + images/ are read from:
//   1. CONTENT_DEV_DIR, when set explicitly (no fallback);
//   2. .dev-content/, when it holds a content.json;
//   3. otherwise the committed sample (dev-content.sample/).
// Checked per call so creating .dev-content/content.json takes effect on
// the next request, no restart needed.
export function resolveContentDir(): string {
	if (process.env.CONTENT_DEV_DIR) return resolveLocalDataDir();
	const own = resolveLocalDataDir();
	if (existsSync(resolve(own, 'content.json'))) return own;
	return assertSafeDir(resolve(SAMPLE_CONTENT_DIR));
}

// Re-read on every call so edits to content.json show up on the next
// page load without restarting the dev server.
async function loadContent(): Promise<LocalContent> {
	const file = resolve(resolveContentDir(), 'content.json');
	return JSON.parse(await readFile(file, 'utf8')) as LocalContent;
}

// Mirrors the GROQ ordering in sanity.ts: `order asc, name asc`.
function byOrderThenName(a: SanityProduct, b: SanityProduct): number {
	return (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
}

function byOrder<T extends { order: number }>(a: T, b: T): number {
	return (a.order ?? 0) - (b.order ?? 0);
}

export async function getLocalProducts(): Promise<SanityProduct[]> {
	const { products = [] } = await loadContent();
	return products
		.filter((p) => p.available)
		.map((p) => ({ ...p, category: p.category ?? 'screen' }))
		.sort(byOrderThenName);
}

export async function getLocalProductBySlug(slug: string): Promise<SanityProduct | null> {
	const list = await getLocalProducts();
	return list.find((p) => p.slug === slug) ?? null;
}

export async function getLocalProductsByIds(ids: string[]): Promise<SanityProduct[]> {
	const list = await getLocalProducts();
	return list.filter((p) => ids.includes(p._id));
}

export async function getLocalGalleryPhotos(): Promise<SanityGalleryPhoto[]> {
	const { galleryPhotos = [] } = await loadContent();
	return galleryPhotos.filter((p) => p.visible).sort(byOrder);
}

export async function getLocalTestimonials(): Promise<SanityTestimonial[]> {
	const { testimonials = [] } = await loadContent();
	return testimonials.filter((t) => t.visible).sort(byOrder);
}

export async function readLocalImage(
	name: string
): Promise<{ body: Buffer; contentType: string } | null> {
	if (!SAFE_IMAGE_NAME.test(name)) return null;
	const contentType = IMAGE_TYPES[extname(name).toLowerCase()];
	if (!contentType) return null;
	try {
		const body = await readFile(resolve(resolveContentDir(), 'images', name));
		return { body, contentType };
	} catch {
		return null;
	}
}
