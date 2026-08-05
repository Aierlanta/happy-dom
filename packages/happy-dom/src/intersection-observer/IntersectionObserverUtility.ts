import type DOMRect from '../dom/DOMRect.js';
import DOMRectReadOnly from '../dom/DOMRectReadOnly.js';

export interface IRootMarginValue {
	value: number;
	unit: 'px' | '%';
}

export interface IRootMargin {
	top: IRootMarginValue;
	right: IRootMarginValue;
	bottom: IRootMarginValue;
	left: IRootMarginValue;
}

export interface IRect {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
}

const ROOT_MARGIN_VALUE_REGEXP = /^([+-]?(\d+\.?|\d*\.\d+))(px|%)$/;

/**
 * Intersection Observer utility.
 */
export default class IntersectionObserverUtility {
	/**
	 * Parses rootMargin according to CSS shorthand rules.
	 *
	 * @param rootMargin Root margin string.
	 * @returns Parsed root margin.
	 */
	public static parseRootMargin(rootMargin: string): IRootMargin {
		const parts = rootMargin.trim().split(/\s+/).filter(Boolean);

		if (parts.length === 0) {
			parts.push('0px');
		}

		if (parts.length > 4) {
			throw new SyntaxError(
				`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value '${rootMargin}'.`
			);
		}

		const parsed = parts.map((part) => this.#parseRootMarginToken(part, rootMargin));

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

		return { top, right, bottom, left };
	}

	/**
	 * Serializes root margin to four-value form.
	 *
	 * @param margin Margin.
	 * @returns Serialized string.
	 */
	public static serializeRootMargin(margin: IRootMargin): string {
		return [
			this.#serializeRootMarginValue(margin.top),
			this.#serializeRootMarginValue(margin.right),
			this.#serializeRootMarginValue(margin.bottom),
			this.#serializeRootMarginValue(margin.left)
		].join(' ');
	}

	/**
	 * Normalizes threshold init value.
	 *
	 * @param threshold Threshold.
	 * @returns Sorted unique thresholds.
	 */
	public static normalizeThresholds(threshold: number | number[] | undefined): number[] {
		const list = threshold === undefined ? [0] : Array.isArray(threshold) ? threshold : [threshold];

		if (list.length === 0) {
			return [0];
		}

		const normalized: number[] = [];

		for (const value of list) {
			const number = Number(value);

			if (typeof value !== 'number' || !Number.isFinite(number) || number < 0 || number > 1) {
				throw new TypeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be numbers between 0 and 1 inclusive.`
				);
			}

			if (!normalized.includes(number)) {
				normalized.push(number);
			}
		}

		normalized.sort((a, b) => a - b);

		return normalized;
	}

	/**
	 * Applies root margin to a root rect.
	 *
	 * @param rootRect Root rect.
	 * @param margin Margin.
	 * @returns Expanded/shrunk rect.
	 */
	public static applyRootMargin(rootRect: IRect, margin: IRootMargin): IRect {
		const top = this.#resolveMarginValue(margin.top, rootRect.height);
		const right = this.#resolveMarginValue(margin.right, rootRect.width);
		const bottom = this.#resolveMarginValue(margin.bottom, rootRect.height);
		const left = this.#resolveMarginValue(margin.left, rootRect.width);

		const x = rootRect.left - left;
		const y = rootRect.top - top;
		const width = rootRect.width + left + right;
		const height = rootRect.height + top + bottom;

		return this.#toRect(x, y, width, height);
	}

	/**
	 * Converts DOMRect-like to plain rect.
	 *
	 * @param rect Rect.
	 * @returns Plain rect.
	 */
	public static fromDOMRect(rect: DOMRect | DOMRectReadOnly): IRect {
		return this.#toRect(rect.x, rect.y, rect.width, rect.height);
	}

	/**
	 * Creates a viewport rect.
	 *
	 * @param width Width.
	 * @param height Height.
	 * @returns Viewport rect.
	 */
	public static createViewportRect(width: number, height: number): IRect {
		return this.#toRect(0, 0, width, height);
	}

	/**
	 * Intersects two rects.
	 *
	 * @param a Rect A.
	 * @param b Rect B.
	 * @returns Intersection rect or null when completely outside.
	 */
	public static intersect(a: IRect, b: IRect): IRect | null {
		const left = Math.max(a.left, b.left);
		const top = Math.max(a.top, b.top);
		const right = Math.min(a.right, b.right);
		const bottom = Math.min(a.bottom, b.bottom);
		const width = right - left;
		const height = bottom - top;

		if (width < 0 || height < 0) {
			return null;
		}

		return this.#toRect(left, top, width, height);
	}

	/**
	 * Returns whether target is fully contained by root.
	 *
	 * @param target Target rect.
	 * @param root Root rect.
	 * @returns Whether contained.
	 */
	public static isContained(target: IRect, root: IRect): boolean {
		return (
			target.left >= root.left &&
			target.right <= root.right &&
			target.top >= root.top &&
			target.bottom <= root.bottom
		);
	}

	/**
	 * Computes intersection ratio.
	 *
	 * @param targetBounds Target bounds.
	 * @param intersectionRect Intersection rect or null.
	 * @returns Ratio between 0 and 1.
	 */
	public static getIntersectionRatio(targetBounds: IRect, intersectionRect: IRect | null): number {
		const targetArea = Math.max(0, targetBounds.width) * Math.max(0, targetBounds.height);

		// Zero-area targets: ratio is 1 when intersecting (contained in/against the root), otherwise 0.
		if (targetArea === 0) {
			return intersectionRect !== null ? 1 : 0;
		}

		if (!intersectionRect) {
			return 0;
		}

		const intersectionArea =
			Math.max(0, intersectionRect.width) * Math.max(0, intersectionRect.height);

		return Math.min(1, intersectionArea / targetArea);
	}

	/**
	 * Computes threshold index used for change detection.
	 *
	 * @param intersectionRatio Intersection ratio.
	 * @param isIntersecting Whether intersecting.
	 * @param thresholds Thresholds.
	 * @returns Threshold index.
	 */
	public static getThresholdIndex(
		intersectionRatio: number,
		isIntersecting: boolean,
		thresholds: number[]
	): number {
		if (!isIntersecting) {
			return 0;
		}

		let index = 0;

		while (index < thresholds.length && thresholds[index] <= intersectionRatio) {
			index++;
		}

		return index;
	}

	/**
	 * Creates a DOMRectReadOnly from a plain rect.
	 *
	 * @param rect Rect.
	 * @returns DOMRectReadOnly.
	 */
	public static toDOMRectReadOnly(rect: IRect | null): DOMRectReadOnly | null {
		if (!rect) {
			return null;
		}

		return new DOMRectReadOnly(rect.x, rect.y, rect.width, rect.height);
	}

	/**
	 * Parses one root margin token.
	 *
	 * @param token Token.
	 * @param rootMargin Original string for error message.
	 * @returns Parsed value.
	 */
	static #parseRootMarginToken(token: string, rootMargin: string): IRootMarginValue {
		const match = ROOT_MARGIN_VALUE_REGEXP.exec(token);

		if (!match) {
			throw new SyntaxError(
				`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value '${rootMargin}'.`
			);
		}

		return {
			value: Number(match[1]),
			unit: <'px' | '%'>match[3]
		};
	}

	/**
	 * Serializes one margin value.
	 *
	 * @param margin Margin value.
	 * @returns Serialized value.
	 */
	static #serializeRootMarginValue(margin: IRootMarginValue): string {
		return `${margin.value}${margin.unit}`;
	}

	/**
	 * Resolves margin value against an axis size.
	 *
	 * @param margin Margin.
	 * @param axisSize Width or height of root.
	 * @returns Pixel value.
	 */
	static #resolveMarginValue(margin: IRootMarginValue, axisSize: number): number {
		if (margin.unit === '%') {
			return (margin.value * axisSize) / 100;
		}

		return margin.value;
	}

	/**
	 * Creates a normalized rect.
	 *
	 * @param x X.
	 * @param y Y.
	 * @param width Width.
	 * @param height Height.
	 * @returns Rect.
	 */
	static #toRect(x: number, y: number, width: number, height: number): IRect {
		return {
			x,
			y,
			width,
			height,
			top: y,
			right: x + width,
			bottom: y + height,
			left: x
		};
	}

}
