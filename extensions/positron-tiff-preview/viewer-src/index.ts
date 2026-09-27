/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Deck, OrthographicView } from '@deck.gl/core';
import { getDefaultPalette } from '@vivjs/extensions';
import { ImageLayer, MultiscaleImageLayer } from '@vivjs/layers';
import { getChannelStats, getImageSize, isInterleaved, loadOmeTiff, TiffPixelSource } from '@vivjs/loaders';
import { BaseClient, BaseResponse, fromCustomClient, GeoTIFFImage } from 'geotiff';

/**
 * The plane of a channel to show, as Viv expects it.
 */
interface Selection {
	readonly t: number;
	readonly c: number;
	readonly z: number;
}

/**
 * An image ready to render: one pixel source per resolution level, full
 * resolution first, and one selection per channel to show.
 */
interface LoadedImage {
	readonly sources: TiffPixelSource<string[]>[];
	readonly selections: Selection[];
}

/**
 * The most channels shown at once. It is the size of Viv's default color palette.
 */
const MAX_CHANNELS = 8;

const WHITE = [255, 255, 255];

/**
 * A geotiff.js client that never asks for bytes past the end of the file.
 *
 * The webview resource loader returns too few bytes for a Range request that
 * goes past the end of the file: it cuts the last chunk of the read, see
 * doReadFileIntoStream in src/vs/platform/files/common/io.ts. geotiff.js reads
 * 64 KB blocks, so its request for the last block of a file usually goes past
 * the end of the file.
 */
class ClampedRangeClient extends BaseClient {
	constructor(url: string, private readonly _fileSize: number) {
		super(url);
	}

	override async request({ headers, signal }: { headers: Record<string, string>; signal: AbortSignal }): Promise<BaseResponse> {
		const lastByte = this._fileSize - 1;
		const range = headers.Range.replace(/-(?<end>\d+)/g, (_match, end: string) => `-${Math.min(Number(end), lastByte)}`);
		const response = await fetch(this.url, { headers: { ...headers, Range: range }, signal });
		return new FetchResponse(response);
	}
}

/**
 * A geotiff.js response for a fetch API response.
 */
class FetchResponse extends BaseResponse {
	constructor(private readonly _response: Response) {
		super();
	}

	override get status(): number {
		return this._response.status;
	}

	override getHeader(name: string): string {
		return this._response.headers.get(name) ?? '';
	}

	override async getData(): Promise<ArrayBuffer> {
		return this._response.arrayBuffer();
	}
}

/**
 * Loads the TIFF at `src`, which is `fileSize` bytes long. An OME-TIFF shows its
 * channels at the first Z and T plane. A plain TIFF shows its first image.
 */
async function loadImage(src: string, fileSize: number): Promise<LoadedImage> {
	const tiff = await fromCustomClient(new ClampedRangeClient(src, fileSize));
	const firstImage = await tiff.getImage();
	if (isOmeTiff(firstImage)) {
		const { data, metadata } = await loadOmeTiff(src, { source: tiff });
		const channelCount = isInterleaved(data[0].shape) ? 1 : Math.min(metadata.Pixels.SizeC, MAX_CHANNELS);
		return {
			sources: data,
			selections: Array.from({ length: channelCount }, (_, c) => ({ t: 0, c, z: 0 })),
		};
	}
	return {
		sources: [createPixelSource(firstImage)],
		selections: [{ t: 0, c: 0, z: 0 }],
	};
}

function isOmeTiff(image: GeoTIFFImage): boolean {
	const description = image.fileDirectory.ImageDescription;
	return typeof description === 'string' && /<(\w+:)?OME[\s>]/.test(description);
}

/**
 * Wraps one image of a plain TIFF as a Viv pixel source. Viv shows 8-bit RGB and
 * RGBA images in color when their samples are interleaved. Other images show
 * their first sample.
 */
function createPixelSource(image: GeoTIFFImage): TiffPixelSource<string[]> {
	// geotiff.js picks the typed array for the sample format and bit depth.
	const dtype = image.getArrayForSample(0, 0).constructor.name.replace('Array', '') as TiffPixelSource<string[]>['dtype'];
	const samplesPerPixel = image.getSamplesPerPixel();
	const labels = ['t', 'c', 'z', 'y', 'x'];
	const shape = [1, 1, 1, image.getHeight(), image.getWidth()];
	if (dtype === 'Uint8' && (samplesPerPixel === 3 || samplesPerPixel === 4)) {
		labels.push('_c');
		shape.push(samplesPerPixel);
	}
	const tileSize = 2 ** Math.floor(Math.log2(Math.min(image.getTileWidth(), image.getTileHeight())));
	const meta = { photometricInterpretation: image.fileDirectory.PhotometricInterpretation };
	return new TiffPixelSource(async () => image, dtype, tileSize, shape, labels, meta);
}

/**
 * Computes a contrast range for each channel from the lowest resolution level,
 * so that a large pyramid does not load its full resolution plane.
 */
async function getContrastLimits(image: LoadedImage): Promise<number[][]> {
	const source = image.sources[image.sources.length - 1];
	if (isInterleaved(source.shape)) {
		// Viv ignores contrast for color images.
		return [[0, 255]];
	}
	return Promise.all(image.selections.map(async selection => {
		const { data } = await source.getRaster({ selection });
		return getChannelStats(data).contrastLimits;
	}));
}

async function main(): Promise<void> {
	const container = document.getElementById('viewer')!;
	const image = await loadImage(document.body.dataset.src!, Number(document.body.dataset.size));
	const contrastLimits = await getContrastLimits(image);

	// Fit the whole image in the view.
	const { width, height } = getImageSize(image.sources[0]);
	const zoom = Math.log2(Math.min(container.clientWidth / width, container.clientHeight / height));

	const layerProps = {
		id: 'image',
		selections: image.selections,
		contrastLimits,
		channelsVisible: image.selections.map(() => true),
		colors: image.selections.length === 1 ? [WHITE] : getDefaultPalette(image.selections.length),
	};
	new Deck({
		parent: container,
		views: [new OrthographicView({ id: 'ortho', controller: true })],
		initialViewState: { target: [width / 2, height / 2, 0], zoom },
		// A pyramid loads only the tiles of the level that fits the zoom.
		layers: [image.sources.length > 1
			? new MultiscaleImageLayer({ ...layerProps, loader: image.sources })
			: new ImageLayer({ ...layerProps, loader: image.sources[0] })],
	});
}

main().catch(error => {
	const message = document.getElementById('error')!;
	message.hidden = false;
	message.append(String(error));
	console.error(error);
});
