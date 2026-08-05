import * as PropertySymbol from '../PropertySymbol.js';
import type BrowserWindow from '../window/BrowserWindow.js';
import DOMRect from '../dom/DOMRect.js';
import type Element from '../nodes/element/Element.js';
import NodeTypeEnum from '../nodes/node/NodeTypeEnum.js';
import IntersectionObserverEntry from './IntersectionObserverEntry.js';
import type IIntersectionObserverInit from './IIntersectionObserverInit.js';

interface IRootMargin {
	top: { value: number; unit: 'px' | '%' };
	right: { value: number; unit: 'px' | '%' };
	bottom: { value: number; unit: 'px' | '%' };
	left: { value: number; unit: 'px' | '%' };
}

interface IObservedTarget {
	target: Element;
	previousThresholdIndex: number;
	isFirstObservation: boolean;
}

interface IRect {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/**
 * The IntersectionObserver interface of the Intersection Observer API provides a way to asynchronously observe changes in the intersection of a target element with an ancestor element or with a top-level document's viewport.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
 */
export default class IntersectionObserver {
	// Injected by WindowContextClassExtender
	protected declare [PropertySymbol.window]: BrowserWindow;

	public readonly root: Element | null;
	public readonly rootMargin: string;
	public readonly thresholds: number[];

	#callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;
	#rootMargins: IRootMargin;
	#targets: IObservedTarget[] = [];
	#queuedEntries: IntersectionObserverEntry[] = [];
	#pendingDelivery = false;
	#pendingUpdate = false;
	#destroyed = false;
	#boundViewportChange: (() => void) | null = null;

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

		const init = options ?? {};
		const root = init.root ?? null;

		if (
			root !== null &&
			(!(root instanceof window.Node) ||
				(<Element>root)[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode)
		) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
			);
		}

		let rootMargins: IRootMargin;
		let rootMarginString: string;

		try {
			const parsed = this.#parseRootMargin(init.rootMargin ?? '0px');
			rootMargins = parsed.margins;
			rootMarginString = parsed.normalized;
		} catch (error) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': ${(error as Error).message}`
			);
		}

		let thresholds: number[];

		try {
			thresholds = this.#normalizeThresholds(init.threshold);
		} catch (error) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': ${(error as Error).message}`
			);
		}

		this.#callback = callback;
		this.root = root;
		this.rootMargin = rootMarginString;
		this.thresholds = <number[]>Object.freeze(thresholds);
		this.#rootMargins = rootMargins;
	}

	/**
	 * Starts observing.
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
			!(target instanceof window.Node) ||
			target[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode
		) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		for (const observed of this.#targets) {
			if (observed.target === target) {
				return;
			}
		}

		this.#targets.push({
			target,
			previousThresholdIndex: -1,
			isFirstObservation: true
		});

		if (!window[PropertySymbol.intersectionObservers].includes(this)) {
			window[PropertySymbol.intersectionObservers].push(this);
		}

		this.#ensureViewportListeners();
		this.#updateTarget(this.#targets[this.#targets.length - 1]);
		this.#scheduleDelivery();
	}

	/**
	 * Unobserves an element.
	 *
	 * @param target Target.
	 */
	public unobserve(target: Element): void {
		if (this.#destroyed) {
			return;
		}

		const index = this.#targets.findIndex((observed) => observed.target === target);

		if (index === -1) {
			return;
		}

		this.#targets.splice(index, 1);

		if (this.#targets.length === 0) {
			this.#removeViewportListeners();
			this.#removeFromWindow();
		}
	}

	/**
	 * Disconnects.
	 */
	public disconnect(): void {
		if (this.#destroyed) {
			return;
		}

		this.#targets = [];
		this.#queuedEntries = [];
		this.#pendingDelivery = false;
		this.#pendingUpdate = false;
		this.#removeViewportListeners();
		this.#removeFromWindow();
	}

	/**
	 * Returns an array of IntersectionObserverEntry objects for all observed targets.
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
	 * Parses rootMargin with CSS shorthand expansion.
	 *
	 * @param rootMargin Root margin string.
	 * @returns Parsed margins and normalized string.
	 */
	#parseRootMargin(rootMargin: string): { margins: IRootMargin; normalized: string } {
		if (typeof rootMargin !== 'string') {
			throw new Error(`Failed to parse rootMargin value.`);
		}

		const parts = rootMargin.trim().split(/\s+/).filter(Boolean);

		if (parts.length === 0 || parts.length > 4) {
			throw new Error(`Failed to parse rootMargin value '${rootMargin}'.`);
		}

		const parsedParts = parts.map((part) => this.#parseMarginToken(part, rootMargin));

		let top: IRootMargin['top'];
		let right: IRootMargin['right'];
		let bottom: IRootMargin['bottom'];
		let left: IRootMargin['left'];

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
	 * Parses a single rootMargin token.
	 *
	 * @param token Token.
	 * @param rootMargin Full rootMargin string for errors.
	 * @returns Parsed token.
	 */
	#parseMarginToken(
		token: string,
		rootMargin: string
	): { value: number; unit: 'px' | '%' } {
		const match = /^([+-]?[\d.]+)(px|%)$/.exec(token);

		if (!match) {
			throw new Error(`Failed to parse rootMargin value '${rootMargin}'.`);
		}

		const value = Number(match[1]);

		if (!Number.isFinite(value)) {
			throw new Error(`Failed to parse rootMargin value '${rootMargin}'.`);
		}

		return { value, unit: <'px' | '%'>match[2] };
	}

	/**
	 * Normalizes threshold option.
	 *
	 * @param threshold Threshold.
	 * @returns Sorted unique thresholds.
	 */
	#normalizeThresholds(threshold: number | number[] | undefined): number[] {
		const values = threshold === undefined ? [0] : Array.isArray(threshold) ? threshold : [threshold];

		if (values.length === 0) {
			return [0];
		}

		const normalized: number[] = [];

		for (const value of values) {
			const number = Number(value);

			if (typeof value === 'symbol' || !Number.isFinite(number)) {
				throw new Error(`Threshold values must be numbers between 0 and 1 inclusive.`);
			}

			if (number < 0 || number > 1) {
				throw new Error(`Threshold values must be numbers between 0 and 1 inclusive.`);
			}

			if (!normalized.includes(number)) {
				normalized.push(number);
			}
		}

		normalized.sort((a, b) => a - b);
		return normalized;
	}

	/**
	 * Updates intersection state for a single observed target.
	 *
	 * @param observed Observed target state.
	 */
	#updateTarget(observed: IObservedTarget): void {
		const entry = this.#computeEntry(observed.target);
		const thresholdIndex = this.#computeThresholdIndex(entry.intersectionRatio, entry.isIntersecting);

		if (observed.isFirstObservation || thresholdIndex !== observed.previousThresholdIndex) {
			this.#queuedEntries.push(entry);
			observed.previousThresholdIndex = thresholdIndex;
			observed.isFirstObservation = false;
		}
	}

	/**
	 * Updates all observed targets.
	 */
	#updateAllTargets(): void {
		for (const observed of this.#targets) {
			this.#updateTarget(observed);
		}
	}

	/**
	 * Computes threshold index for an intersection ratio.
	 *
	 * @param intersectionRatio Intersection ratio.
	 * @param isIntersecting Whether intersecting.
	 * @returns Threshold index.
	 */
	#computeThresholdIndex(intersectionRatio: number, isIntersecting: boolean): number {
		if (!isIntersecting) {
			return -1;
		}

		let thresholdIndex = 0;

		for (let i = 0; i < this.thresholds.length; i++) {
			if (intersectionRatio >= this.thresholds[i]) {
				thresholdIndex = i;
			} else {
				break;
			}
		}

		return thresholdIndex;
	}

	/**
	 * Computes an intersection entry for a target.
	 *
	 * @param target Target.
	 * @returns Entry.
	 */
	#computeEntry(target: Element): IntersectionObserverEntry {
		const window = this[PropertySymbol.window];
		const boundingClientRect = this.#toRect(target.getBoundingClientRect());
		const rootBounds = this.#getRootBounds();
		const intersectionRect = this.#calculateIntersectionRect(
			boundingClientRect,
			rootBounds,
			target
		);
		const targetArea = Math.max(0, boundingClientRect.width) * Math.max(0, boundingClientRect.height);
		const isZeroArea = targetArea === 0;
		const canIntersect =
			target[PropertySymbol.isConnected] &&
			(!this.root ||
				(this.root[PropertySymbol.isConnected] && this.#isDescendantOf(target, this.root)));
		const contained =
			canIntersect &&
			boundingClientRect.left >= rootBounds.left &&
			boundingClientRect.right <= rootBounds.right &&
			boundingClientRect.top >= rootBounds.top &&
			boundingClientRect.bottom <= rootBounds.bottom;

		let intersectionRatio: number;
		let isIntersecting: boolean;

		if (!canIntersect) {
			intersectionRatio = 0;
			isIntersecting = false;
		} else if (isZeroArea) {
			intersectionRatio = contained ? 1 : 0;
			isIntersecting = contained;
		} else {
			const intersectionArea =
				Math.max(0, intersectionRect.width) * Math.max(0, intersectionRect.height);
			intersectionRatio = intersectionArea / targetArea;
			isIntersecting = intersectionRatio > 0;
		}

		return new IntersectionObserverEntry({
			time: window.performance.now(),
			rootBounds: this.#toDOMRect(rootBounds),
			boundingClientRect: this.#toDOMRect(boundingClientRect),
			intersectionRect: this.#toDOMRect(
				!canIntersect
					? { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 }
					: intersectionRect
			),
			isIntersecting,
			intersectionRatio,
			target
		});
	}

	/**
	 * Returns the intersection root bounds with rootMargin applied.
	 *
	 * @returns Root bounds.
	 */
	#getRootBounds(): IRect {
		const window = this[PropertySymbol.window];
		let base: IRect;

		if (this.root) {
			base = this.#toRect(this.root.getBoundingClientRect());
		} else {
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
		}

		const top = this.#resolveMargin(this.#rootMargins.top, base.height);
		const right = this.#resolveMargin(this.#rootMargins.right, base.width);
		const bottom = this.#resolveMargin(this.#rootMargins.bottom, base.height);
		const left = this.#resolveMargin(this.#rootMargins.left, base.width);

		const x = base.left - left;
		const y = base.top - top;
		const width = base.width + left + right;
		const height = base.height + top + bottom;

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

	/**
	 * Resolves a margin to pixels.
	 *
	 * @param margin Margin.
	 * @param reference Reference dimension.
	 * @returns Pixel value.
	 */
	#resolveMargin(margin: { value: number; unit: 'px' | '%' }, reference: number): number {
		if (margin.unit === '%') {
			return (margin.value / 100) * reference;
		}
		return margin.value;
	}

	/**
	 * Calculates intersection rectangle between target and root.
	 *
	 * @param targetRect Target bounding rect.
	 * @param rootBounds Root bounds.
	 * @param target Target element.
	 * @returns Intersection rect.
	 */
	#calculateIntersectionRect(targetRect: IRect, rootBounds: IRect, target: Element): IRect {
		const empty = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 };

		if (!target[PropertySymbol.isConnected]) {
			return empty;
		}

		if (this.root) {
			if (!this.root[PropertySymbol.isConnected] || !this.#isDescendantOf(target, this.root)) {
				return empty;
			}
		}

		const left = Math.max(targetRect.left, rootBounds.left);
		const top = Math.max(targetRect.top, rootBounds.top);
		const right = Math.min(targetRect.right, rootBounds.right);
		const bottom = Math.min(targetRect.bottom, rootBounds.bottom);
		const width = Math.max(0, right - left);
		const height = Math.max(0, bottom - top);

		if (width === 0 && height === 0) {
			const targetArea = targetRect.width * targetRect.height;
			if (targetArea !== 0) {
				return empty;
			}
		}

		return {
			x: left,
			y: top,
			width,
			height,
			top,
			right,
			bottom,
			left
		};
	}

	/**
	 * Returns whether node is a descendant of ancestor.
	 *
	 * @param node Node.
	 * @param ancestor Ancestor.
	 * @returns True if descendant.
	 */
	#isDescendantOf(node: Element, ancestor: Element): boolean {
		return ancestor.contains(node);
	}

	/**
	 * Converts a DOMRect-like object to a plain rect.
	 *
	 * @param rect Rect.
	 * @returns Plain rect.
	 */
	#toRect(rect: {
		x: number;
		y: number;
		width: number;
		height: number;
		top: number;
		right: number;
		bottom: number;
		left: number;
	}): IRect {
		return {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
			left: rect.left
		};
	}

	/**
	 * Creates a DOMRect from a plain rect.
	 *
	 * @param rect Rect.
	 * @returns DOMRect.
	 */
	#toDOMRect(rect: IRect): DOMRect {
		return new DOMRect(rect.x, rect.y, rect.width, rect.height);
	}

	/**
	 * Schedules asynchronous callback delivery.
	 */
	#scheduleDelivery(): void {
		if (this.#pendingDelivery || this.#destroyed) {
			return;
		}

		this.#pendingDelivery = true;

		this[PropertySymbol.window].queueMicrotask(() => {
			this.#pendingDelivery = false;

			if (this.#destroyed) {
				return;
			}

			const entries = this.#queuedEntries;
			this.#queuedEntries = [];

			if (entries.length > 0) {
				this.#callback(entries, this);
			}
		});
	}

	/**
	 * Runs intersection updates (invoked from the window animation frame cycle).
	 */
	public [PropertySymbol.updateIntersectionObservations](): void {
		if (this.#destroyed || this.#targets.length === 0) {
			return;
		}

		const queuedBefore = this.#queuedEntries.length;
		this.#updateAllTargets();

		if (this.#queuedEntries.length > queuedBefore) {
			this.#scheduleDelivery();
		}
	}

	/**
	 * Schedules an intersection update (e.g. after scroll/resize).
	 */
	#scheduleUpdate(): void {
		if (this.#pendingUpdate || this.#destroyed || this.#targets.length === 0) {
			return;
		}

		this.#pendingUpdate = true;

		this[PropertySymbol.window].queueMicrotask(() => {
			this.#pendingUpdate = false;

			if (this.#destroyed || this.#targets.length === 0) {
				return;
			}

			this[PropertySymbol.updateIntersectionObservations]();
		});
	}

	/**
	 * Starts listening for viewport changes that can affect intersections.
	 */
	#ensureViewportListeners(): void {
		if (this.#boundViewportChange) {
			return;
		}

		this.#boundViewportChange = () => {
			this.#scheduleUpdate();
		};

		const window = this[PropertySymbol.window];
		window.addEventListener('scroll', this.#boundViewportChange);
		window.addEventListener('resize', this.#boundViewportChange);

		if (this.root) {
			this.root.addEventListener('scroll', this.#boundViewportChange);
		}
	}

	/**
	 * Removes viewport change listeners.
	 */
	#removeViewportListeners(): void {
		if (!this.#boundViewportChange) {
			return;
		}

		const window = this[PropertySymbol.window];
		window.removeEventListener('scroll', this.#boundViewportChange);
		window.removeEventListener('resize', this.#boundViewportChange);

		if (this.root) {
			this.root.removeEventListener('scroll', this.#boundViewportChange);
		}

		this.#boundViewportChange = null;
	}

	/**
	 * Removes this observer from the window tracking list.
	 */
	#removeFromWindow(): void {
		const observers = this[PropertySymbol.window][PropertySymbol.intersectionObservers];
		const index = observers.indexOf(this);

		if (index !== -1) {
			observers.splice(index, 1);
		}
	}
}
