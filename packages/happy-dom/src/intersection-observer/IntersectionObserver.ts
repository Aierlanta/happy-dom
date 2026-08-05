import * as PropertySymbol from '../PropertySymbol.js';
import DOMRect from '../dom/DOMRect.js';
import type Element from '../nodes/element/Element.js';
import NodeTypeEnum from '../nodes/node/NodeTypeEnum.js';
import type BrowserWindow from '../window/BrowserWindow.js';
import IntersectionObserverEntry from './IntersectionObserverEntry.js';
import type IIntersectionObserverInit from './IIntersectionObserverInit.js';

interface IRootMarginValue {
	value: number;
	unit: 'px' | '%';
}

interface IObservation {
	target: Element;
	/**
	 * Index of the first threshold greater than the last delivered intersection ratio,
	 * or thresholds.length when none are greater. Null means no observation has been delivered yet.
	 */
	previousThresholdIndex: number | null;
}

const ROOT_MARGIN_REGEXP = /^(-?\d+(?:\.\d+)?)(px|%)$/;

/**
 * The IntersectionObserver interface of the Intersection Observer API provides a way to asynchronously observe changes in the intersection of a target element with an ancestor element or with a top-level document's viewport.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
 */
export default class IntersectionObserver {
	// Injected by WindowContextClassExtender
	protected declare [PropertySymbol.window]: BrowserWindow;

	#callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;
	#root: Element | null;
	#rootMargin: string;
	#rootMarginValues: [IRootMarginValue, IRootMarginValue, IRootMarginValue, IRootMarginValue];
	#thresholds: readonly number[];
	#observations: IObservation[] = [];
	#queuedEntries: IntersectionObserverEntry[] = [];
	#pendingDelivery = false;
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
			(!(root instanceof window.Element) ||
				root[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode)
		) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
			);
		}

		const rootMarginValues = parseRootMargin(window, init.rootMargin);
		const thresholds = normalizeThresholds(window, init.threshold);

		this.#callback = callback;
		this.#root = root;
		this.#rootMarginValues = rootMarginValues;
		this.#rootMargin = serializeRootMargin(rootMarginValues);
		this.#thresholds = Object.freeze(thresholds);
	}

	/**
	 * A specific ancestor of the target element against which the intersection is calculated.
	 * Null means the viewport.
	 *
	 * @returns Root.
	 */
	public get root(): Element | null {
		return this.#root;
	}

	/**
	 * Offset rectangle applied to the root, in four-value CSS margin form.
	 *
	 * @returns Root margin.
	 */
	public get rootMargin(): string {
		return this.#rootMargin;
	}

	/**
	 * Sorted unique threshold ratios.
	 *
	 * @returns Thresholds.
	 */
	public get thresholds(): readonly number[] {
		return this.#thresholds;
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

		if (
			!(target instanceof window.Element) ||
			target[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode
		) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		for (const observation of this.#observations) {
			if (observation.target === target) {
				return;
			}
		}

		this.#observations.push({
			target,
			previousThresholdIndex: null
		});

		this.#register();
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

		const index = this.#observations.findIndex((observation) => observation.target === target);

		if (index === -1) {
			return;
		}

		this.#observations.splice(index, 1);

		if (this.#observations.length === 0) {
			this.#unregister();
		}
	}

	/**
	 * Stops observing all targets and clears pending records.
	 */
	public disconnect(): void {
		if (this.#destroyed) {
			return;
		}

		this.#observations = [];
		this.#queuedEntries = [];
		this.#pendingDelivery = false;
		this.#unregister();
	}

	/**
	 * Returns pending records and clears the queue.
	 *
	 * @returns Records.
	 */
	public takeRecords(): IntersectionObserverEntry[] {
		const records = this.#queuedEntries;
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
	 * Recalculates intersections for all observed targets.
	 */
	public [PropertySymbol.updateIntersectionObservations](): void {
		this.#scheduleUpdate();
	}

	/**
	 * Registers this observer on the window.
	 */
	#register(): void {
		const window = this[PropertySymbol.window];
		const observers = window[PropertySymbol.intersectionObservers];

		if (!observers.includes(this)) {
			observers.push(this);
		}

		if (!this.#resizeListener) {
			this.#resizeListener = (): void => {
				this.#scheduleUpdate();
			};
			window.addEventListener('resize', this.#resizeListener);
		}
	}

	/**
	 * Unregisters this observer from the window.
	 */
	#unregister(): void {
		const window = this[PropertySymbol.window];
		const observers = window[PropertySymbol.intersectionObservers];
		const index = observers.indexOf(this);

		if (index !== -1) {
			observers.splice(index, 1);
		}

		if (this.#resizeListener) {
			window.removeEventListener('resize', this.#resizeListener);
			this.#resizeListener = null;
		}
	}

	/**
	 * Computes intersections and queues delivery asynchronously.
	 */
	#scheduleUpdate(): void {
		if (this.#destroyed) {
			return;
		}

		this.#computeObservations();

		if (this.#queuedEntries.length === 0 || this.#pendingDelivery) {
			return;
		}

		this.#pendingDelivery = true;

		this[PropertySymbol.window].queueMicrotask(() => {
			this.#pendingDelivery = false;

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
	 * Computes intersection state for each observed target in observation order.
	 */
	#computeObservations(): void {
		const window = this[PropertySymbol.window];
		const time = window.performance.now();
		const rootBounds = this.#getRootBounds();

		for (const observation of this.#observations) {
			const entry = this.#createEntry(observation.target, rootBounds, time);
			const thresholdIndex = getThresholdIndex(entry.intersectionRatio, this.#thresholds);
			const isInitial = observation.previousThresholdIndex === null;

			if (isInitial || thresholdIndex !== observation.previousThresholdIndex) {
				this.#queuedEntries.push(entry);
				observation.previousThresholdIndex = thresholdIndex;
			}
		}
	}

	/**
	 * Creates an intersection entry for a target.
	 *
	 * @param target Target.
	 * @param rootBounds Root bounds including margin.
	 * @param time Timestamp.
	 * @returns Entry.
	 */
	#createEntry(target: Element, rootBounds: DOMRect, time: number): IntersectionObserverEntry {
		const boundingClientRect = DOMRect.fromRect(target.getBoundingClientRect());
		const hasExplicitRoot = this.#root !== null;
		const isDescendant =
			!hasExplicitRoot || (this.#root !== target && this.#root!.contains(target));

		let intersectionRect = new DOMRect(0, 0, 0, 0);
		let isIntersecting = false;
		let intersectionRatio = 0;

		if (isDescendant) {
			const intersection = intersectRects(boundingClientRect, rootBounds);
			isIntersecting = intersection !== null;

			if (intersection) {
				intersectionRect = intersection;
			}

			const targetArea = Math.abs(boundingClientRect.width * boundingClientRect.height);

			if (targetArea === 0) {
				intersectionRatio = isIntersecting ? 1 : 0;
			} else if (intersection) {
				const intersectionArea = Math.abs(intersection.width * intersection.height);
				intersectionRatio = clampRatio(intersectionArea / targetArea);
			}
		}

		return new IntersectionObserverEntry({
			time,
			target,
			boundingClientRect,
			intersectionRect,
			intersectionRatio,
			isIntersecting,
			rootBounds: DOMRect.fromRect(rootBounds)
		});
	}

	/**
	 * Returns the root intersection rectangle including rootMargin.
	 *
	 * @returns Root bounds.
	 */
	#getRootBounds(): DOMRect {
		const window = this[PropertySymbol.window];
		let rootRect: DOMRect;

		if (this.#root === null) {
			rootRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
		} else {
			rootRect = DOMRect.fromRect(this.#root.getBoundingClientRect());
		}

		const [topMargin, rightMargin, bottomMargin, leftMargin] = this.#rootMarginValues;
		const top = resolveMargin(topMargin, rootRect.height);
		const right = resolveMargin(rightMargin, rootRect.width);
		const bottom = resolveMargin(bottomMargin, rootRect.height);
		const left = resolveMargin(leftMargin, rootRect.width);

		return new DOMRect(
			rootRect.left - left,
			rootRect.top - top,
			rootRect.width + left + right,
			rootRect.height + top + bottom
		);
	}
}

/**
 * Parses rootMargin into four {value, unit} pairs.
 *
 * @param window Window.
 * @param rootMargin Root margin string.
 * @returns Parsed margins.
 */
function parseRootMargin(
	window: BrowserWindow,
	rootMargin: string | undefined
): [IRootMarginValue, IRootMarginValue, IRootMarginValue, IRootMarginValue] {
	const value = rootMargin === undefined || rootMargin === null ? '0px' : String(rootMargin);
	const parts = value.trim().split(/\s+/).filter(Boolean);

	if (parts.length === 0 || parts.length > 4) {
		throw new window.TypeError(
			`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value from options parameter.`
		);
	}

	const parsed: IRootMarginValue[] = [];

	for (const part of parts) {
		const match = ROOT_MARGIN_REGEXP.exec(part);

		if (!match) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value from options parameter.`
			);
		}

		parsed.push({
			value: Number(match[1]),
			unit: <'px' | '%'>match[2]
		});
	}

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
 * Serializes root margin values to a four-value string.
 *
 * @param values Values.
 * @returns Serialized root margin.
 */
function serializeRootMargin(
	values: [IRootMarginValue, IRootMarginValue, IRootMarginValue, IRootMarginValue]
): string {
	return values.map((margin) => `${margin.value}${margin.unit}`).join(' ');
}

/**
 * Normalizes threshold option into a sorted unique list.
 *
 * @param window Window.
 * @param threshold Threshold option.
 * @returns Thresholds.
 */
function normalizeThresholds(
	window: BrowserWindow,
	threshold: number | number[] | undefined
): number[] {
	let list: number[];

	if (threshold === undefined || threshold === null) {
		list = [0];
	} else if (Array.isArray(threshold)) {
		list = threshold.length === 0 ? [0] : threshold.map((value) => Number(value));
	} else {
		list = [Number(threshold)];
	}

	for (const value of list) {
		if (!Number.isFinite(value) || value < 0 || value > 1) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
			);
		}
	}

	return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * Resolves a margin against a root dimension.
 *
 * @param margin Margin.
 * @param dimension Root width or height.
 * @returns Pixel offset.
 */
function resolveMargin(margin: IRootMarginValue, dimension: number): number {
	if (margin.unit === '%') {
		return (dimension * margin.value) / 100;
	}
	return margin.value;
}

/**
 * Returns intersection of two rects, or null when empty.
 *
 * @param a Rect A.
 * @param b Rect B.
 * @returns Intersection rect or null.
 */
function intersectRects(a: DOMRect, b: DOMRect): DOMRect | null {
	const left = Math.max(a.left, b.left);
	const top = Math.max(a.top, b.top);
	const right = Math.min(a.right, b.right);
	const bottom = Math.min(a.bottom, b.bottom);

	if (right < left || bottom < top) {
		return null;
	}

	return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Finds the threshold index for a ratio.
 *
 * @param ratio Intersection ratio.
 * @param thresholds Thresholds.
 * @returns Index.
 */
function getThresholdIndex(ratio: number, thresholds: readonly number[]): number {
	for (let i = 0; i < thresholds.length; i++) {
		if (thresholds[i] > ratio) {
			return i;
		}
	}
	return thresholds.length;
}

/**
 * Clamps an intersection ratio into [0, 1].
 *
 * @param ratio Ratio.
 * @returns Clamped ratio.
 */
function clampRatio(ratio: number): number {
	if (ratio < 0) {
		return 0;
	}
	if (ratio > 1) {
		return 1;
	}
	return ratio;
}
