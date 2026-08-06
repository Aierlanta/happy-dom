import type IntersectionObserverEntry from './IntersectionObserverEntry.js';
import IntersectionObserverEntryConstructor from './IntersectionObserverEntry.js';
import type IIntersectionObserverInit from './IIntersectionObserverInit.js';
import type Element from '../nodes/element/Element.js';
import * as PropertySymbol from '../PropertySymbol.js';
import type BrowserWindow from '../window/BrowserWindow.js';
import NodeTypeEnum from '../nodes/node/NodeTypeEnum.js';
import DOMRect from '../dom/DOMRect.js';
import DOMExceptionNameEnum from '../exception/DOMExceptionNameEnum.js';

interface IRootMargin {
	top: { value: number; unit: 'px' | '%' };
	right: { value: number; unit: 'px' | '%' };
	bottom: { value: number; unit: 'px' | '%' };
	left: { value: number; unit: 'px' | '%' };
}

interface IObservedTarget {
	target: Element;
	lastThresholdIndex: number;
	lastIsIntersecting: boolean | null;
	isInitial: boolean;
}

interface IComputedRect {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
}

const ROOT_MARGIN_REGEXP = /^(-?\d+(\.\d+)?)(px|%)$/;

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
	#parsedRootMargin: IRootMargin = {
		top: { value: 0, unit: 'px' },
		right: { value: 0, unit: 'px' },
		bottom: { value: 0, unit: 'px' },
		left: { value: 0, unit: 'px' }
	};
	#thresholds: number[] = [0];
	#observedTargets: IObservedTarget[] = [];
	#queuedEntries: IntersectionObserverEntry[] = [];
	#pendingDelivery = false;
	#pendingUpdate = false;
	#destroyed = false;
	#resizeListener: (() => void) | null = null;

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

		if (arguments.length < 1) {
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

			if (options.root !== undefined && options.root !== null) {
				if (!this.#isElement(options.root)) {
					throw new window.TypeError(
						`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
					);
				}
				this.#root = options.root;
			}

			if (options.rootMargin !== undefined && options.rootMargin !== null) {
				const parsed = this.#parseRootMargin(String(options.rootMargin));
				this.#parsedRootMargin = parsed.margins;
				this.#rootMargin = parsed.normalized;
			}

			if (options.threshold !== undefined && options.threshold !== null) {
				this.#thresholds = this.#normalizeThresholds(options.threshold);
			}
		}
	}

	/**
	 * Returns the root element.
	 */
	public get root(): Element | null {
		return this.#root;
	}

	/**
	 * Returns the normalized root margin string (top right bottom left).
	 */
	public get rootMargin(): string {
		return this.#rootMargin;
	}

	/**
	 * Returns the list of thresholds in increasing order.
	 */
	public get thresholds(): number[] {
		return this.#thresholds.slice();
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

		if (arguments.length < 1) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': 1 argument required, but only 0 present.`
			);
		}

		if (!this.#isElement(target)) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		for (const observed of this.#observedTargets) {
			if (observed.target === target) {
				return;
			}
		}

		this.#observedTargets.push({
			target,
			lastThresholdIndex: -1,
			lastIsIntersecting: null,
			isInitial: true
		});

		const observers = this[PropertySymbol.window][PropertySymbol.intersectionObservers];
		if (!observers.includes(this)) {
			observers.push(this);
		}

		this.#ensureResizeListener();
		this.#scheduleUpdate();
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

		const window = this[PropertySymbol.window];

		if (arguments.length < 1) {
			throw new window.TypeError(
				`Failed to execute 'unobserve' on 'IntersectionObserver': 1 argument required, but only 0 present.`
			);
		}

		if (!this.#isElement(target)) {
			throw new window.TypeError(
				`Failed to execute 'unobserve' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		const index = this.#observedTargets.findIndex((observed) => observed.target === target);
		if (index === -1) {
			return;
		}

		this.#observedTargets.splice(index, 1);
		this.#queuedEntries = this.#queuedEntries.filter((entry) => entry.target !== target);

		if (this.#observedTargets.length === 0) {
			this.#removeResizeListener();
		}
	}

	/**
	 * Stops observing all targets and clears pending records.
	 */
	public disconnect(): void {
		this.#observedTargets = [];
		this.#queuedEntries = [];
		this.#pendingDelivery = false;
		this.#pendingUpdate = false;
		this.#removeResizeListener();

		const window = this[PropertySymbol.window];
		if (window) {
			const observers = window[PropertySymbol.intersectionObservers];
			const index = observers.indexOf(this);
			if (index !== -1) {
				observers.splice(index, 1);
			}
		}
	}

	/**
	 * Returns queued entries and clears the queue.
	 *
	 * @returns Records.
	 */
	public takeRecords(): IntersectionObserverEntry[] {
		const records = this.#queuedEntries.slice();
		this.#queuedEntries = [];
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
	 * Returns whether the value is an Element.
	 *
	 * @param value Value.
	 * @returns True if Element.
	 */
	#isElement(value: unknown): value is Element {
		return (
			value !== null &&
			typeof value === 'object' &&
			(<Element>value)[PropertySymbol.nodeType] === NodeTypeEnum.elementNode
		);
	}

	/**
	 * Parses and normalizes rootMargin.
	 *
	 * @param rootMargin Root margin string.
	 * @returns Parsed margins and normalized string.
	 */
	#parseRootMargin(rootMargin: string): { margins: IRootMargin; normalized: string } {
		const window = this[PropertySymbol.window];
		const parts = rootMargin.trim().split(/\s+/).filter(Boolean);

		if (parts.length === 0 || parts.length > 4) {
			throw new window.DOMException(
				`Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.`,
				DOMExceptionNameEnum.syntaxError
			);
		}

		const parsedParts: { value: number; unit: 'px' | '%' }[] = [];

		for (const part of parts) {
			const match = ROOT_MARGIN_REGEXP.exec(part);
			if (!match) {
				throw new window.DOMException(
					`Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.`,
					DOMExceptionNameEnum.syntaxError
				);
			}
			parsedParts.push({
				value: Number(match[1]),
				unit: <'px' | '%'>match[3]
			});
		}

		let top: { value: number; unit: 'px' | '%' };
		let right: { value: number; unit: 'px' | '%' };
		let bottom: { value: number; unit: 'px' | '%' };
		let left: { value: number; unit: 'px' | '%' };

		switch (parsedParts.length) {
			case 1:
				top = right = bottom = left = parsedParts[0];
				break;
			case 2:
				top = bottom = parsedParts[0];
				right = left = parsedParts[1];
				break;
			case 3:
				top = parsedParts[0];
				right = left = parsedParts[1];
				bottom = parsedParts[2];
				break;
			default:
				top = parsedParts[0];
				right = parsedParts[1];
				bottom = parsedParts[2];
				left = parsedParts[3];
				break;
		}

		const format = (margin: { value: number; unit: 'px' | '%' }): string =>
			`${margin.value}${margin.unit}`;

		return {
			margins: { top, right, bottom, left },
			normalized: `${format(top)} ${format(right)} ${format(bottom)} ${format(left)}`
		};
	}

	/**
	 * Normalizes threshold option to a sorted unique list.
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
			const number = Number(value);
			if (!Number.isFinite(number)) {
				throw new window.TypeError(
					`Failed to construct 'IntersectionObserver': Failed to read the 'threshold' property from 'IntersectionObserverInit': The provided double value is non-finite.`
				);
			}
			if (number < 0 || number > 1) {
				throw new window.RangeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				);
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

		return unique;
	}

	/**
	 * Schedules an asynchronous observation update.
	 */
	#scheduleUpdate(): void {
		if (this.#pendingUpdate || this.#destroyed) {
			return;
		}

		this.#pendingUpdate = true;
		this[PropertySymbol.window].queueMicrotask(() => {
			this.#pendingUpdate = false;
			if (this.#destroyed) {
				return;
			}
			this.#updateObservations();
			this.#scheduleDelivery();
		});
	}

	/**
	 * Schedules asynchronous callback delivery.
	 */
	#scheduleDelivery(): void {
		if (this.#pendingDelivery || this.#queuedEntries.length === 0 || this.#destroyed) {
			return;
		}

		this.#pendingDelivery = true;
		this[PropertySymbol.window].queueMicrotask(() => {
			this.#pendingDelivery = false;
			if (this.#destroyed) {
				return;
			}

			const entries = this.#queuedEntries.slice();
			this.#queuedEntries = [];

			if (entries.length > 0) {
				this.#callback(entries, this);
			}
		});
	}

	/**
	 * Updates intersection observations for all observed targets.
	 */
	#updateObservations(): void {
		for (const observed of this.#observedTargets) {
			this.#updateObservedTarget(observed);
		}
	}

	/**
	 * Updates intersection observation for a single target.
	 *
	 * @param observed Observed target state.
	 */
	#updateObservedTarget(observed: IObservedTarget): void {
		const entryData = this.#computeIntersection(observed.target);
		const thresholdIndex = this.#computeThresholdIndex(
			entryData.intersectionRatio,
			entryData.isIntersecting
		);

		const shouldQueue =
			observed.isInitial ||
			thresholdIndex !== observed.lastThresholdIndex ||
			entryData.isIntersecting !== observed.lastIsIntersecting;

		observed.lastThresholdIndex = thresholdIndex;
		observed.lastIsIntersecting = entryData.isIntersecting;
		observed.isInitial = false;

		if (!shouldQueue) {
			return;
		}

		this.#queuedEntries.push(
			new IntersectionObserverEntryConstructor({
				boundingClientRect: entryData.boundingClientRect,
				intersectionRatio: entryData.intersectionRatio,
				intersectionRect: entryData.intersectionRect,
				isIntersecting: entryData.isIntersecting,
				rootBounds: entryData.rootBounds,
				target: observed.target,
				time: this[PropertySymbol.window].performance.now()
			})
		);
	}

	/**
	 * Computes the threshold index for a given intersection ratio.
	 *
	 * @param intersectionRatio Intersection ratio.
	 * @param isIntersecting Whether the target is intersecting.
	 * @returns Threshold index.
	 */
	#computeThresholdIndex(intersectionRatio: number, isIntersecting: boolean): number {
		const thresholds = this.#thresholds;

		if (!isIntersecting && intersectionRatio === 0) {
			return -1;
		}

		let index = -1;
		for (let i = 0; i < thresholds.length; i++) {
			if (intersectionRatio >= thresholds[i]) {
				index = i;
			} else {
				break;
			}
		}
		return index;
	}

	/**
	 * Computes intersection geometry between the target and the root.
	 *
	 * @param target Target element.
	 * @returns Intersection data.
	 */
	#computeIntersection(target: Element): {
		boundingClientRect: DOMRect;
		intersectionRect: DOMRect;
		rootBounds: DOMRect;
		intersectionRatio: number;
		isIntersecting: boolean;
	} {
		const boundingClientRect = this.#domRectFromClientRect(target.getBoundingClientRect());
		const rootBounds = this.#getRootBounds();

		if (this.#root !== null && !this.#root.contains(target)) {
			return {
				boundingClientRect,
				intersectionRect: new DOMRect(0, 0, 0, 0),
				rootBounds,
				intersectionRatio: 0,
				isIntersecting: false
			};
		}

		const intersectionRect = this.#intersect(boundingClientRect, rootBounds);
		const targetArea = Math.abs(boundingClientRect.width * boundingClientRect.height);
		let intersectionRatio = 0;
		let isIntersecting = false;

		if (targetArea === 0) {
			const contained = this.#contains(rootBounds, boundingClientRect);
			intersectionRatio = contained ? 1 : 0;
			isIntersecting = contained;
		} else {
			const intersectionArea = Math.abs(intersectionRect.width * intersectionRect.height);
			intersectionRatio = intersectionArea / targetArea;
			isIntersecting = intersectionArea > 0;
		}

		// Clamp floating point noise into [0, 1].
		if (intersectionRatio < 0) {
			intersectionRatio = 0;
		} else if (intersectionRatio > 1) {
			intersectionRatio = 1;
		}

		return {
			boundingClientRect,
			intersectionRect,
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
		const window = this[PropertySymbol.window];
		let base: IComputedRect;

		if (this.#root === null) {
			base = {
				x: 0,
				y: 0,
				width: window.innerWidth,
				height: window.innerHeight,
				top: 0,
				right: window.innerWidth,
				bottom: window.innerHeight,
				left: 0
			};
		} else {
			base = this.#toComputedRect(this.#root.getBoundingClientRect());
		}

		const top = this.#resolveMargin(this.#parsedRootMargin.top, base.height);
		const right = this.#resolveMargin(this.#parsedRootMargin.right, base.width);
		const bottom = this.#resolveMargin(this.#parsedRootMargin.bottom, base.height);
		const left = this.#resolveMargin(this.#parsedRootMargin.left, base.width);

		const x = base.left - left;
		const y = base.top - top;
		const width = base.width + left + right;
		const height = base.height + top + bottom;

		return new DOMRect(x, y, width, height);
	}

	/**
	 * Resolves a margin value to pixels.
	 *
	 * @param margin Margin.
	 * @param referenceSize Reference size for percent margins.
	 * @returns Pixel value.
	 */
	#resolveMargin(margin: { value: number; unit: 'px' | '%' }, referenceSize: number): number {
		if (margin.unit === '%') {
			return (margin.value / 100) * referenceSize;
		}
		return margin.value;
	}

	/**
	 * Creates a DOMRect copy from a client rect-like object.
	 *
	 * @param rect Client rect.
	 * @returns DOMRect.
	 */
	#domRectFromClientRect(rect: {
		x: number;
		y: number;
		width: number;
		height: number;
	}): DOMRect {
		return new DOMRect(rect.x, rect.y, rect.width, rect.height);
	}

	/**
	 * Converts a client rect into a computed rect with edges.
	 *
	 * @param rect Client rect.
	 * @returns Computed rect.
	 */
	#toComputedRect(rect: {
		x: number;
		y: number;
		width: number;
		height: number;
		top?: number;
		right?: number;
		bottom?: number;
		left?: number;
	}): IComputedRect {
		const x = rect.x;
		const y = rect.y;
		const width = rect.width;
		const height = rect.height;
		return {
			x,
			y,
			width,
			height,
			top: rect.top ?? Math.min(y, y + height),
			right: rect.right ?? Math.max(x, x + width),
			bottom: rect.bottom ?? Math.max(y, y + height),
			left: rect.left ?? Math.min(x, x + width)
		};
	}

	/**
	 * Intersects two rectangles.
	 *
	 * @param a First rect.
	 * @param b Second rect.
	 * @returns Intersection rect (zero-size when empty).
	 */
	#intersect(
		a: { top: number; right: number; bottom: number; left: number },
		b: { top: number; right: number; bottom: number; left: number }
	): DOMRect {
		const left = Math.max(a.left, b.left);
		const top = Math.max(a.top, b.top);
		const right = Math.min(a.right, b.right);
		const bottom = Math.min(a.bottom, b.bottom);

		if (left >= right || top >= bottom) {
			return new DOMRect(0, 0, 0, 0);
		}

		return new DOMRect(left, top, right - left, bottom - top);
	}

	/**
	 * Returns whether container fully contains target.
	 *
	 * @param container Container rect.
	 * @param target Target rect.
	 * @returns True when contained.
	 */
	#contains(
		container: { top: number; right: number; bottom: number; left: number },
		target: { top: number; right: number; bottom: number; left: number }
	): boolean {
		return (
			target.left >= container.left &&
			target.right <= container.right &&
			target.top >= container.top &&
			target.bottom <= container.bottom
		);
	}

	/**
	 * Ensures a resize listener is registered while observing.
	 */
	#ensureResizeListener(): void {
		if (this.#resizeListener) {
			return;
		}

		this.#resizeListener = (): void => {
			this.#scheduleUpdate();
		};
		this[PropertySymbol.window].addEventListener('resize', this.#resizeListener);
	}

	/**
	 * Removes the resize listener.
	 */
	#removeResizeListener(): void {
		if (!this.#resizeListener) {
			return;
		}
		this[PropertySymbol.window].removeEventListener('resize', this.#resizeListener);
		this.#resizeListener = null;
	}
}
