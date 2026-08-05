import DOMRect from '../dom/DOMRect.js';
import type Element from '../nodes/element/Element.js';
import type BrowserWindow from '../window/BrowserWindow.js';

export interface IRootMarginValue {
	value: number;
	unit: 'px' | '%';
}

export interface IParsedRootMargin {
	top: IRootMarginValue;
	right: IRootMarginValue;
	bottom: IRootMarginValue;
	left: IRootMarginValue;
	serialized: string;
}

export interface IIntersectionResult {
	boundingClientRect: DOMRect;
	intersectionRect: DOMRect;
	rootBounds: DOMRect;
	intersectionRatio: number;
	isIntersecting: boolean;
}

const ROOT_MARGIN_VALUE_REGEXP = /^(-?(?:\d+|\d*\.\d+))(px|%)$/;

/**
 * Utility for IntersectionObserver parsing and geometry calculations.
 */
export default class IntersectionObserverUtility {
	/**
	 * Parses a rootMargin string into four values and a normalized serialization.
	 *
	 * @param rootMargin Root margin string.
	 * @returns Parsed root margin.
	 */
	public static parseRootMargin(rootMargin: string): IParsedRootMargin {
		const parts = String(rootMargin).trim().split(/\s+/).filter(Boolean);

		if (parts.length === 0 || parts.length > 4) {
			throw new SyntaxError(`Failed to parse rootMargin value '${rootMargin}'`);
		}

		const parsed = parts.map((part) => {
			const match = ROOT_MARGIN_VALUE_REGEXP.exec(part);
			if (!match) {
				throw new SyntaxError(`Failed to parse rootMargin value '${rootMargin}'`);
			}
			return {
				value: Number(match[1]),
				unit: <'px' | '%'>match[2]
			};
		});

		let top: IRootMarginValue;
		let right: IRootMarginValue;
		let bottom: IRootMarginValue;
		let left: IRootMarginValue;

		switch (parsed.length) {
			case 1:
				top = right = bottom = left = parsed[0];
				break;
			case 2:
				top = bottom = parsed[0];
				right = left = parsed[1];
				break;
			case 3:
				top = parsed[0];
				right = left = parsed[1];
				bottom = parsed[2];
				break;
			default:
				top = parsed[0];
				right = parsed[1];
				bottom = parsed[2];
				left = parsed[3];
				break;
		}

		const serialize = (margin: IRootMarginValue): string => `${margin.value}${margin.unit}`;

		return {
			top,
			right,
			bottom,
			left,
			serialized: `${serialize(top)} ${serialize(right)} ${serialize(bottom)} ${serialize(left)}`
		};
	}

	/**
	 * Normalizes threshold init into a sorted unique list of numbers in [0, 1].
	 *
	 * @param threshold Threshold init value.
	 * @returns Normalized thresholds.
	 */
	public static normalizeThresholds(threshold: number | number[] | undefined): number[] {
		const list = threshold === undefined ? [0] : Array.isArray(threshold) ? threshold : [threshold];
		const normalized: number[] = [];

		for (const value of list) {
			const number = Number(value);
			if (!Number.isFinite(number)) {
				throw new TypeError('Failed to construct threshold: value is not a finite number.');
			}
			if (number < 0 || number > 1) {
				throw new RangeError('Threshold values must be between 0 and 1 inclusive.');
			}
			normalized.push(number);
		}

		normalized.sort((a, b) => a - b);

		const unique: number[] = [];
		for (const value of normalized) {
			if (unique.length === 0 || unique[unique.length - 1] !== value) {
				unique.push(value);
			}
		}

		return unique.length > 0 ? unique : [0];
	}

	/**
	 * Returns the threshold index for a given intersection ratio.
	 *
	 * @param thresholds Thresholds.
	 * @param intersectionRatio Intersection ratio.
	 * @returns Threshold index.
	 */
	public static getThresholdIndex(thresholds: number[], intersectionRatio: number): number {
		let thresholdIndex = thresholds.length;
		for (let i = 0; i < thresholds.length; i++) {
			if (thresholds[i] > intersectionRatio) {
				thresholdIndex = i;
				break;
			}
		}
		return thresholdIndex - 1;
	}

	/**
	 * Computes intersection geometry between a target and the observer root.
	 *
	 * @param window Window.
	 * @param target Target element.
	 * @param root Root element or null for the viewport.
	 * @param rootMargin Parsed root margin.
	 * @returns Intersection result.
	 */
	public static computeIntersection(
		window: BrowserWindow,
		target: Element,
		root: Element | null,
		rootMargin: IParsedRootMargin
	): IIntersectionResult {
		const boundingClientRect = DOMRect.fromRect(target.getBoundingClientRect());

		let rootRect: DOMRect;
		let isInRoot = true;

		if (root === null) {
			rootRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
			isInRoot = target.isConnected;
		} else {
			rootRect = DOMRect.fromRect(root.getBoundingClientRect());
			isInRoot = root === target || root.contains(target);
		}

		const resolvedTop = this.#resolveMargin(rootMargin.top, rootRect.width, rootRect.height, false);
		const resolvedRight = this.#resolveMargin(
			rootMargin.right,
			rootRect.width,
			rootRect.height,
			true
		);
		const resolvedBottom = this.#resolveMargin(
			rootMargin.bottom,
			rootRect.width,
			rootRect.height,
			false
		);
		const resolvedLeft = this.#resolveMargin(rootMargin.left, rootRect.width, rootRect.height, true);

		const expandedRoot = new DOMRect(
			rootRect.left - resolvedLeft,
			rootRect.top - resolvedTop,
			rootRect.width + resolvedLeft + resolvedRight,
			rootRect.height + resolvedTop + resolvedBottom
		);

		const rootBounds = DOMRect.fromRect(expandedRoot);

		if (!isInRoot) {
			return {
				boundingClientRect,
				intersectionRect: new DOMRect(),
				rootBounds,
				intersectionRatio: 0,
				isIntersecting: false
			};
		}

		const targetArea = Math.abs(boundingClientRect.width * boundingClientRect.height);
		const isContained =
			boundingClientRect.left >= expandedRoot.left &&
			boundingClientRect.right <= expandedRoot.right &&
			boundingClientRect.top >= expandedRoot.top &&
			boundingClientRect.bottom <= expandedRoot.bottom;

		if (targetArea === 0) {
			const isIntersecting = isContained;
			return {
				boundingClientRect,
				intersectionRect: isIntersecting
					? new DOMRect(
							boundingClientRect.left,
							boundingClientRect.top,
							boundingClientRect.width,
							boundingClientRect.height
						)
					: new DOMRect(),
				rootBounds,
				intersectionRatio: isIntersecting ? 1 : 0,
				isIntersecting
			};
		}

		const left = Math.max(boundingClientRect.left, expandedRoot.left);
		const top = Math.max(boundingClientRect.top, expandedRoot.top);
		const right = Math.min(boundingClientRect.right, expandedRoot.right);
		const bottom = Math.min(boundingClientRect.bottom, expandedRoot.bottom);

		const width = Math.max(0, right - left);
		const height = Math.max(0, bottom - top);
		const intersectionRect = new DOMRect(left, top, width, height);
		const intersectionArea = width * height;
		const isIntersecting = intersectionArea > 0;
		const intersectionRatio = isIntersecting
			? Math.min(1, intersectionArea / targetArea)
			: 0;

		return {
			boundingClientRect,
			intersectionRect,
			rootBounds,
			intersectionRatio,
			isIntersecting
		};
	}

	/**
	 * Resolves a root margin value against root dimensions.
	 *
	 * @param margin Margin value.
	 * @param rootWidth Root width.
	 * @param rootHeight Root height.
	 * @param horizontal Whether the margin is horizontal.
	 * @returns Resolved pixel value.
	 */
	static #resolveMargin(
		margin: IRootMarginValue,
		rootWidth: number,
		rootHeight: number,
		horizontal: boolean
	): number {
		if (margin.unit === '%') {
			return (margin.value / 100) * (horizontal ? rootWidth : rootHeight);
		}
		return margin.value;
	}
}
