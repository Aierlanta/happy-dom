import IntersectionObserverEntry from './IntersectionObserverEntry.js';
import type IIntersectionObserverInit from './IIntersectionObserverInit.js';
import type Element from '../nodes/element/Element.js';
import * as PropertySymbol from '../PropertySymbol.js';
import type BrowserWindow from '../window/BrowserWindow.js';
import DOMRect from '../dom/DOMRect.js';
import NodeTypeEnum from '../nodes/node/NodeTypeEnum.js';

interface IRootMarginEntry {
	value: number;
	unit: 'px' | '%';
}

interface IObservationState {
	previousThresholdIndex: number;
	previousIsIntersecting: boolean;
	isFirstObservation: boolean;
}

interface IIntersectionResult {
	boundingClientRect: DOMRect;
	intersectionRect: DOMRect;
	rootBounds: DOMRect;
	intersectionRatio: number;
	isIntersecting: boolean;
}

/**
 * The IntersectionObserver interface of the Intersection Observer API provides a way to asynchronously observe changes in the intersection of a target element with an ancestor element or with a top-level document's viewport.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
 */
export default class IntersectionObserver {
	// Injected by WindowContextClassExtender
	protected declare [PropertySymbol.window]: BrowserWindow;

	#callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;
	#root: Element | null = null;
	#rootMargin: string = '0px 0px 0px 0px';
	#rootMarginEntries: IRootMarginEntry[] = [
		{ value: 0, unit: 'px' },
		{ value: 0, unit: 'px' },
		{ value: 0, unit: 'px' },
		{ value: 0, unit: 'px' }
	];
	#thresholds: number[] = [0];
	#targets: Element[] = [];
	#states: Map<Element, IObservationState> = new Map();
	#pendingEntries: IntersectionObserverEntry[] = [];
	#deliveryQueued = false;
	#animationFrameId: NodeJS.Immediate | null = null;
	#destroyed = false;

	/**
	 * Constructor.
	 *
	 * @param callback Callback.
	 * @param options Options.
	 */
	constructor(
		callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
		options?: IIntersectionObserverInit
	) {
		if (!this[PropertySymbol.window]) {
			throw new TypeError(
				`Failed to construct '${this.constructor.name}': '${this.constructor.name}' was constructed outside a Window context.`
			);
		}

		const window = this[PropertySymbol.window];

		if (arguments.length === 0) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': 1 argument required, but only 0 present.`
			);
		}

		if (typeof callback !== 'function') {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': The callback provided as parameter 1 is not a function.`
			);
		}

		this.#callback = callback;

		if (options !== undefined && options !== null) {
			if (typeof options !== 'object') {
				throw new window.TypeError(
					`Failed to construct 'IntersectionObserver': The provided value is not of type 'IntersectionObserverInit'.`
				);
			}

			if (options.root != null) {
				const root = <Element>options.root;
				if (
					typeof root !== 'object' ||
					root[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode
				) {
					throw new window.TypeError(
						`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
					);
				}
				this.#root = root;
			}

			if (options.rootMargin !== undefined && options.rootMargin !== null) {
				const parsed = this.#parseRootMargin(String(options.rootMargin));
				this.#rootMarginEntries = parsed;
				this.#rootMargin = parsed
					.map((entry) => `${this.#formatNumber(entry.value)}${entry.unit}`)
					.join(' ');
			}

			if (options.threshold !== undefined && options.threshold !== null) {
				this.#thresholds = this.#normalizeThresholds(options.threshold);
			}
		}
	}

	/**
	 * Returns the root element.
	 *
	 * @returns Root.
	 */
	public get root(): Element | null {
		return this.#root;
	}

	/**
	 * Returns the normalized root margin string (top right bottom left).
	 *
	 * @returns Root margin.
	 */
	public get rootMargin(): string {
		return this.#rootMargin;
	}

	/**
	 * Returns the normalized list of thresholds.
	 *
	 * @returns Thresholds.
	 */
	public get thresholds(): number[] {
		return <number[]>Object.freeze(this.#thresholds.slice());
	}

	/**
	 * Starts observing a target element.
	 *
	 * @param target Target.
	 */
	public observe(target: Element): void {
		if (this.#destroyed) {
			return;
		}

		const window = this[PropertySymbol.window];

		if (arguments.length === 0) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': 1 argument required, but only 0 present.`
			);
		}

		if (
			!target ||
			typeof target !== 'object' ||
			target[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode
		) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		if (this.#states.has(target)) {
			return;
		}

		this.#targets.push(target);
		this.#states.set(target, {
			previousThresholdIndex: -1,
			previousIsIntersecting: false,
			isFirstObservation: true
		});

		const intersectionObservers = window[PropertySymbol.intersectionObservers];
		if (!intersectionObservers.includes(this)) {
			intersectionObservers.push(this);
		}

		this.#updateTarget(target);
		this.#scheduleAnimationFrame();
	}

	/**
	 * Stops observing a target element.
	 *
	 * @param target Target.
	 */
	public unobserve(target: Element): void {
		if (this.#destroyed) {
			return;
		}

		if (
			!target ||
			typeof target !== 'object' ||
			target[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode
		) {
			return;
		}

		const index = this.#targets.indexOf(target);
		if (index === -1) {
			return;
		}

		this.#targets.splice(index, 1);
		this.#states.delete(target);

		if (this.#targets.length === 0) {
			this.#cancelAnimationFrame();
			this.#removeFromWindowObservers();
		}
	}

	/**
	 * Disconnects the observer, stops future delivery and clears pending records.
	 */
	public disconnect(): void {
		if (this.#destroyed) {
			return;
		}

		this.#targets = [];
		this.#states.clear();
		this.#pendingEntries = [];
		this.#deliveryQueued = false;
		this.#cancelAnimationFrame();
		this.#removeFromWindowObservers();
	}

	/**
	 * Returns and clears pending IntersectionObserverEntry objects.
	 *
	 * @returns Records.
	 */
	public takeRecords(): IntersectionObserverEntry[] {
		const records = this.#pendingEntries;
		this.#pendingEntries = [];
		return records;
	}

	/**
	 * Destroys the observer.
	 */
	public [PropertySymbol.destroy](): void {
		this.#destroyed = true;
		this.disconnect();
		this.#callback = null!;
	}

	/**
	 * Removes this observer from the window observer list.
	 */
	#removeFromWindowObservers(): void {
		const window = this[PropertySymbol.window];
		if (!window) {
			return;
		}
		const intersectionObservers = window[PropertySymbol.intersectionObservers];
		const index = intersectionObservers.indexOf(this);
		if (index !== -1) {
			intersectionObservers.splice(index, 1);
		}
	}

	/**
	 * Schedules an animation frame to look for intersection changes.
	 */
	#scheduleAnimationFrame(): void {
		if (this.#animationFrameId !== null || this.#destroyed || this.#targets.length === 0) {
			return;
		}

		this.#animationFrameId = this[PropertySymbol.window].requestAnimationFrame(() => {
			this.#animationFrameId = null;
			if (this.#destroyed || this.#targets.length === 0) {
				return;
			}
			for (const target of this.#targets.slice()) {
				this.#updateTarget(target);
			}
			this.#scheduleAnimationFrame();
		});
	}

	/**
	 * Cancels the scheduled animation frame.
	 */
	#cancelAnimationFrame(): void {
		if (this.#animationFrameId !== null) {
			this[PropertySymbol.window].cancelAnimationFrame(this.#animationFrameId);
			this.#animationFrameId = null;
		}
	}

	/**
	 * Updates intersection state for a target and queues an entry when needed.
	 *
	 * @param target Target.
	 */
	#updateTarget(target: Element): void {
		if (this.#destroyed || !this.#states.has(target)) {
			return;
		}

		const result = this.#calculateIntersection(target);
		const thresholdIndex = this.#computeThresholdIndex(result.intersectionRatio);
		const state = this.#states.get(target)!;
		const shouldQueue =
			state.isFirstObservation ||
			state.previousThresholdIndex !== thresholdIndex ||
			state.previousIsIntersecting !== result.isIntersecting;

		state.previousThresholdIndex = thresholdIndex;
		state.previousIsIntersecting = result.isIntersecting;
		state.isFirstObservation = false;

		if (!shouldQueue) {
			return;
		}

		const entry = new IntersectionObserverEntry({
			time: this[PropertySymbol.window].performance.now(),
			target,
			boundingClientRect: result.boundingClientRect,
			intersectionRect: result.intersectionRect,
			rootBounds: result.rootBounds,
			intersectionRatio: result.intersectionRatio,
			isIntersecting: result.isIntersecting
		});

		this.#pendingEntries.push(entry);
		this.#scheduleDelivery();
	}

	/**
	 * Schedules asynchronous callback delivery.
	 */
	#scheduleDelivery(): void {
		if (this.#deliveryQueued || this.#destroyed) {
			return;
		}

		this.#deliveryQueued = true;

		this[PropertySymbol.window].queueMicrotask(() => {
			this.#deliveryQueued = false;

			if (this.#destroyed) {
				return;
			}

			const entries = this.takeRecords();
			if (entries.length > 0) {
				this.#callback(entries, this);
			}
		});
	}

	/**
	 * Calculates intersection geometry for a target.
	 *
	 * @param target Target.
	 * @returns Intersection result.
	 */
	#calculateIntersection(target: Element): IIntersectionResult {
		const boundingClientRect = this.#cloneDOMRect(target.getBoundingClientRect());
		const rootBounds = this.#getRootBounds();
		const emptyRect = new DOMRect(0, 0, 0, 0);

		if (!target.isConnected || (this.#root !== null && !this.#root.contains(target))) {
			return {
				boundingClientRect,
				intersectionRect: emptyRect,
				rootBounds,
				intersectionRatio: 0,
				isIntersecting: false
			};
		}

		const intersectionRect = this.#intersectRects(boundingClientRect, rootBounds);
		const targetArea = Math.abs(boundingClientRect.width * boundingClientRect.height);
		const intersectionArea = Math.abs(intersectionRect.width * intersectionRect.height);
		const isIntersecting = this.#rectsIntersect(boundingClientRect, rootBounds);

		let intersectionRatio: number;
		if (targetArea === 0) {
			intersectionRatio = isIntersecting ? 1 : 0;
		} else {
			intersectionRatio = intersectionArea / targetArea;
		}

		if (intersectionRatio < 0) {
			intersectionRatio = 0;
		} else if (intersectionRatio > 1) {
			intersectionRatio = 1;
		}

		return {
			boundingClientRect,
			intersectionRect: isIntersecting ? intersectionRect : emptyRect,
			rootBounds,
			intersectionRatio,
			isIntersecting
		};
	}

	/**
	 * Returns the root bounds with rootMargin applied.
	 *
	 * @returns Root bounds.
	 */
	#getRootBounds(): DOMRect {
		let x: number;
		let y: number;
		let width: number;
		let height: number;

		if (this.#root === null) {
			const window = this[PropertySymbol.window];
			x = 0;
			y = 0;
			width = window.innerWidth;
			height = window.innerHeight;
		} else {
			const rect = this.#root.getBoundingClientRect();
			x = rect.x;
			y = rect.y;
			width = rect.width;
			height = rect.height;
		}

		const [topMargin, rightMargin, bottomMargin, leftMargin] = this.#rootMarginEntries;
		const top = this.#resolveMargin(topMargin, height);
		const right = this.#resolveMargin(rightMargin, width);
		const bottom = this.#resolveMargin(bottomMargin, height);
		const left = this.#resolveMargin(leftMargin, width);

		return new DOMRect(x - left, y - top, width + left + right, height + top + bottom);
	}

	/**
	 * Resolves a root margin value to pixels.
	 *
	 * @param margin Margin entry.
	 * @param referenceSize Width or height of the root.
	 * @returns Pixel value.
	 */
	#resolveMargin(margin: IRootMarginEntry, referenceSize: number): number {
		if (margin.unit === '%') {
			return (margin.value / 100) * referenceSize;
		}
		return margin.value;
	}

	/**
	 * Computes the threshold index for an intersection ratio.
	 *
	 * @param intersectionRatio Intersection ratio.
	 * @returns Threshold index.
	 */
	#computeThresholdIndex(intersectionRatio: number): number {
		let thresholdIndex = 0;
		while (
			thresholdIndex < this.#thresholds.length &&
			this.#thresholds[thresholdIndex] <= intersectionRatio
		) {
			thresholdIndex++;
		}
		return thresholdIndex;
	}

	/**
	 * Parses rootMargin with CSS shorthand expansion.
	 *
	 * @param rootMargin Root margin string.
	 * @returns Parsed margin entries (top, right, bottom, left).
	 */
	#parseRootMargin(rootMargin: string): IRootMarginEntry[] {
		const window = this[PropertySymbol.window];
		const parts = rootMargin.trim().split(/\s+/).filter(Boolean);

		if (parts.length === 0 || parts.length > 4) {
			throw new window.SyntaxError(
				`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value '${rootMargin}'.`
			);
		}

		const parsed = parts.map((part) => this.#parseRootMarginToken(part, rootMargin));

		switch (parsed.length) {
			case 1:
				return [parsed[0], parsed[0], parsed[0], parsed[0]];
			case 2:
				return [parsed[0], parsed[1], parsed[0], parsed[1]];
			case 3:
				return [parsed[0], parsed[1], parsed[2], parsed[1]];
			default:
				return [parsed[0], parsed[1], parsed[2], parsed[3]];
		}
	}

	/**
	 * Parses a single rootMargin token.
	 *
	 * @param token Token.
	 * @param original Original rootMargin string (for error messages).
	 * @returns Parsed margin entry.
	 */
	#parseRootMarginToken(token: string, original: string): IRootMarginEntry {
		const window = this[PropertySymbol.window];
		const match = /^([+-]?[0-9]*\.?[0-9]+)(px|%)$/.exec(token);

		if (!match) {
			// Unitless zero is allowed (CSS length).
			const unitlessZero = /^([+-]?0(\.0+)?)$/.exec(token);
			if (unitlessZero) {
				return { value: 0, unit: 'px' };
			}
			throw new window.SyntaxError(
				`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value '${original}'.`
			);
		}

		return {
			value: Number(match[1]),
			unit: <'px' | '%'>match[2]
		};
	}

	/**
	 * Normalizes threshold option to a sorted unique number array.
	 *
	 * @param threshold Threshold option.
	 * @returns Normalized thresholds.
	 */
	#normalizeThresholds(threshold: number | number[]): number[] {
		const window = this[PropertySymbol.window];
		const values = Array.isArray(threshold) ? threshold : [threshold];

		if (values.length === 0) {
			return [0];
		}

		const normalized: number[] = [];

		for (const value of values) {
			const numberValue = Number(value);
			if (!Number.isFinite(numberValue)) {
				throw new window.TypeError(
					`Failed to construct 'IntersectionObserver': Failed to read the 'threshold' property from 'IntersectionObserverInit': The provided floating point value is non-finite.`
				);
			}
			if (numberValue < 0 || numberValue > 1) {
				throw new window.RangeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				);
			}
			normalized.push(numberValue);
		}

		normalized.sort((a, b) => a - b);

		const unique: number[] = [];
		for (const value of normalized) {
			if (unique.length === 0 || unique[unique.length - 1] !== value) {
				unique.push(value);
			}
		}

		return unique;
	}

	/**
	 * Formats a number for rootMargin serialization.
	 *
	 * @param value Value.
	 * @returns Formatted number string.
	 */
	#formatNumber(value: number): string {
		return String(value);
	}

	/**
	 * Clones a DOMRect-like object into a DOMRect.
	 *
	 * @param rect Rect.
	 * @returns DOMRect.
	 */
	#cloneDOMRect(rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	}): DOMRect {
		return new DOMRect(rect.x, rect.y, rect.width, rect.height);
	}

	/**
	 * Returns whether two rects intersect (including edges).
	 *
	 * @param a Rect A.
	 * @param b Rect B.
	 * @returns True if intersecting.
	 */
	#rectsIntersect(
		a: { x: number; y: number; width: number; height: number },
		b: { x: number; y: number; width: number; height: number }
	): boolean {
		const aLeft = Math.min(a.x, a.x + a.width);
		const aRight = Math.max(a.x, a.x + a.width);
		const aTop = Math.min(a.y, a.y + a.height);
		const aBottom = Math.max(a.y, a.y + a.height);
		const bLeft = Math.min(b.x, b.x + b.width);
		const bRight = Math.max(b.x, b.x + b.width);
		const bTop = Math.min(b.y, b.y + b.height);
		const bBottom = Math.max(b.y, b.y + b.height);

		return aLeft <= bRight && aRight >= bLeft && aTop <= bBottom && aBottom >= bTop;
	}

	/**
	 * Intersects two rectangles.
	 *
	 * @param a Rect A.
	 * @param b Rect B.
	 * @returns Intersection rect (zero-area if no overlap).
	 */
	#intersectRects(
		a: { x: number; y: number; width: number; height: number },
		b: { x: number; y: number; width: number; height: number }
	): DOMRect {
		const aLeft = Math.min(a.x, a.x + a.width);
		const aRight = Math.max(a.x, a.x + a.width);
		const aTop = Math.min(a.y, a.y + a.height);
		const aBottom = Math.max(a.y, a.y + a.height);
		const bLeft = Math.min(b.x, b.x + b.width);
		const bRight = Math.max(b.x, b.x + b.width);
		const bTop = Math.min(b.y, b.y + b.height);
		const bBottom = Math.max(b.y, b.y + b.height);

		const left = Math.max(aLeft, bLeft);
		const right = Math.min(aRight, bRight);
		const top = Math.max(aTop, bTop);
		const bottom = Math.min(aBottom, bBottom);

		if (left > right || top > bottom) {
			return new DOMRect(0, 0, 0, 0);
		}

		return new DOMRect(left, top, right - left, bottom - top);
	}
}
