// Demo-mode shims for the GitHub Pages preview build.
//
// When PUBLIC_DEMO_MODE=true, the shop and gallery pages serve from the
// hardcoded arrays below instead of calling the backend, and the order form
// skips its fetch and shows a fake success so the client can see the full
// post-submit UI without a real Lambda reachable from GitHub Pages.
//
// Photos reference local files in /static/demo/ via a `demo:` sentinel on
// the Sanity asset._ref field — see lib/sanity.ts `imageUrl` for how that
// is translated into a direct URL at render time.

import { env } from '$env/dynamic/public';
import type { Product, GalleryPhoto } from './sanity';

export const isDemoMode = env.PUBLIC_DEMO_MODE === 'true';

export const demoProducts: Product[] = [
	{
		_id: 'demo-product-1',
		name: 'Acacia at Dusk',
		slug: 'acacia-at-dusk',
		blurb: 'A lone acacia against the last light of day.',
		description:
			'Three-panel folding screen, 1800 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 6500,
		available: true,
		order: 1,
		photos: [
			{
				_key: 'p1-photo-1',
				alt: 'A silhouette of an acacia tree against an orange and pink dusk sky',
				asset: { _ref: 'demo:product-acacia-dusk.svg' }
			}
		]
	},
	{
		_id: 'demo-product-2',
		name: 'Baobab Sentinel',
		slug: 'baobab-sentinel',
		blurb: 'An ancient baobab keeping watch at golden hour.',
		description:
			'Three-panel folding screen, 1800 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 7200,
		available: true,
		order: 2,
		photos: [
			{
				_key: 'p2-photo-1',
				alt: 'A baobab tree silhouetted against a warm amber sky',
				asset: { _ref: 'demo:product-baobab-golden.svg' }
			}
		]
	},
	{
		_id: 'demo-product-3',
		name: 'Morning Mist on the Zambezi',
		slug: 'morning-mist-on-the-zambezi',
		blurb: 'Soft dawn light drifting over still water.',
		description:
			'Four-panel folding screen, 2400 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 8400,
		available: true,
		order: 3,
		photos: [
			{
				_key: 'p3-photo-1',
				alt: 'A pale blue and pink dawn sky over a misty horizon',
				asset: { _ref: 'demo:product-dawn-mist.svg' }
			}
		]
	},
	{
		_id: 'demo-product-4',
		name: 'Bushveld Sunset',
		slug: 'bushveld-sunset',
		blurb: 'Warm amber savanna fading into evening.',
		description:
			'Three-panel folding screen, 1800 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 5900,
		available: true,
		order: 4,
		photos: [
			{
				_key: 'p4-photo-1',
				alt: 'A deep red and orange sunset sky above a thorn-tree horizon',
				asset: { _ref: 'demo:product-sunset-thorns.svg' }
			}
		]
	},
	{
		_id: 'demo-product-5',
		name: 'Moonrise over the Kopje',
		slug: 'moonrise-over-the-kopje',
		blurb: 'A rising moon above a rocky outcrop, twilight blue.',
		description:
			'Three-panel folding screen, 1800 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 6800,
		available: true,
		order: 5,
		photos: [
			{
				_key: 'p5-photo-1',
				alt: 'A full moon rising above a rocky kopje against a deep blue sky',
				asset: { _ref: 'demo:product-moonrise.svg' }
			}
		]
	},
	{
		_id: 'demo-product-6',
		name: 'Elephants at the Waterhole',
		slug: 'elephants-at-the-waterhole',
		blurb: 'Silhouettes gathered at first light.',
		description:
			'Four-panel folding screen, 2400 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 7800,
		available: true,
		order: 6,
		photos: [
			{
				_key: 'p6-photo-1',
				alt: 'Silhouettes of elephants at a waterhole against a mauve dawn sky',
				asset: { _ref: 'demo:product-elephants-waterhole.svg' }
			}
		]
	},
	{
		_id: 'demo-product-7',
		name: 'Kudu Ridge',
		slug: 'kudu-ridge',
		blurb: 'Warm afternoon light on a rocky ridgeline.',
		description:
			'Three-panel folding screen, 1800 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 6200,
		available: true,
		order: 7,
		photos: [
			{
				_key: 'p7-photo-1',
				alt: 'A rocky ridgeline lit by the warm light of late afternoon',
				asset: { _ref: 'demo:product-kudu-ridge.svg' }
			}
		]
	},
	{
		_id: 'demo-product-8',
		name: 'Leopard Fig Canopy',
		slug: 'leopard-fig-canopy',
		blurb: 'Dappled green light under a fig canopy.',
		description:
			'Three-panel folding screen, 1800 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 5500,
		available: true,
		order: 8,
		photos: [
			{
				_key: 'p8-photo-1',
				alt: 'Dappled green light filtering through a fig tree canopy',
				asset: { _ref: 'demo:product-leopard-fig.svg' }
			}
		]
	},
	{
		_id: 'demo-product-9',
		name: 'Stormlight over the Veld',
		slug: 'stormlight-over-the-veld',
		blurb: 'A break of light under a charcoal sky.',
		description:
			'Four-panel folding screen, 2400 × 1800 mm.\nPrinted on 100% cotton canvas, Meranti hardwood frame with traditional teak stain.',
		priceZar: 7600,
		available: true,
		order: 9,
		photos: [
			{
				_key: 'p9-photo-1',
				alt: 'A dramatic stormy sky breaking open with a shaft of light over open veld',
				asset: { _ref: 'demo:product-stormlight-veld.svg' }
			}
		]
	}
];

export const demoGalleryPhotos: GalleryPhoto[] = [
	{
		_id: 'demo-gallery-1',
		image: {
			alt: 'Morning light on an acacia',
			asset: { _ref: 'demo:gallery-acacia-morning.svg' }
		},
		caption: 'Morning light on an acacia',
		visible: true,
		order: 1
	},
	{
		_id: 'demo-gallery-2',
		image: {
			alt: 'Baobab at twilight',
			asset: { _ref: 'demo:gallery-baobab-twilight.svg' }
		},
		caption: 'Baobab at twilight',
		visible: true,
		order: 2
	},
	{
		_id: 'demo-gallery-3',
		image: {
			alt: 'Savanna noon',
			asset: { _ref: 'demo:gallery-savanna-noon.svg' }
		},
		caption: 'Savanna at noon',
		visible: true,
		order: 3
	},
	{
		_id: 'demo-gallery-4',
		image: {
			alt: 'Still water at first light',
			asset: { _ref: 'demo:gallery-river-still.svg' }
		},
		caption: 'Still water at first light',
		visible: true,
		order: 4
	},
	{
		_id: 'demo-gallery-5',
		image: {
			alt: 'Thorn trees at dawn',
			asset: { _ref: 'demo:gallery-thorn-dawn.svg' }
		},
		caption: 'Thorn trees at dawn',
		visible: true,
		order: 5
	},
	{
		_id: 'demo-gallery-6',
		image: {
			alt: 'Dry riverbed, late afternoon',
			asset: { _ref: 'demo:gallery-riverbed-gold.svg' }
		},
		caption: 'Dry riverbed, late afternoon',
		visible: true,
		order: 6
	},
	{
		_id: 'demo-gallery-7',
		image: {
			alt: 'First light on the pan',
			asset: { _ref: 'demo:gallery-pan-dawn.svg' }
		},
		caption: 'First light on the pan',
		visible: true,
		order: 7
	},
	{
		_id: 'demo-gallery-8',
		image: {
			alt: 'Grass in the afternoon wind',
			asset: { _ref: 'demo:gallery-grass-wind.svg' }
		},
		caption: 'Grass in the afternoon wind',
		visible: true,
		order: 8
	},
	{
		_id: 'demo-gallery-9',
		image: {
			alt: 'Cumulus over the escarpment',
			asset: { _ref: 'demo:gallery-escarpment-cloud.svg' }
		},
		caption: 'Cumulus over the escarpment',
		visible: true,
		order: 9
	},
	{
		_id: 'demo-gallery-10',
		image: {
			alt: 'Evening rains across the plain',
			asset: { _ref: 'demo:gallery-evening-rain.svg' }
		},
		caption: 'Evening rains across the plain',
		visible: true,
		order: 10
	}
];
