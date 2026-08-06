import type IntersectionObserverEntry from './IntersectionObserverEntry.js';
import type IIntersectionObserverInit from './IIntersectionObserverInit.js';
import type Element from '../nodes/element/Element.js';
import * as PropertySymbol from '../PropertySymbol.js';
import type BrowserWindow from '../window/BrowserWindow.js';
import DOMExceptionNameEnum from '../exception/DOMExceptionNameEnum.js';
import IntersectionObserverUtility, {
	type IRootMargin,
	type IRect
} from './IntersectionObserverUtility.js';

interface IObservationState {
	previousThresholdIndex: number;
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
	#root: Element | null;
	#rootMargin: string;
	#parsedRootMargin: IRootMargin;
	#thresholds: number[];
	#observationTargets: Element[] = [];
	#observationStates: Map<Element, IObservationState> = new Map();
	#queuedEntries: IntersectionObserverEntry[] = [];
	#pendingDelivery = false;
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

		const init = options ?? {};
		const root = init.root ?? null;

		if (root !== null && !(root instanceof window.Element)) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': The root specified must be an Element or null.`
			);
		}

		let parsedRootMargin: IRootMargin;
		let rootMargin: string;

		try {
			parsedRootMargin = IntersectionObserverUtility.parseRootMargin(
				init.rootMargin === undefined || init.rootMargin === null
					? '0px'
					: String(init.rootMargin)
			);
			rootMargin = IntersectionObserverUtility.serializeRootMargin(parsedRootMargin);
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new window.DOMException(error.message, DOMExceptionNameEnum.syntaxError);
			}
			throw error;
		}

		let thresholds: number[];

		try {
			thresholds = IntersectionObserverUtility.normalizeThresholds(init.threshold);
		} catch (error) {
			if (error instanceof TypeError) {
				throw new window.TypeError(error.message);
			}
			throw error;
		}

		this.#callback = callback;
		this.#root = root;
		this.#rootMargin = rootMargin;
		this.#parsedRootMargin = parsedRootMargin;
		this.#thresholds = thresholds;
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
	 * Returns the normalized root margin string in four-value form.
	 *
	 * @returns Root margin.
	 */
	public get rootMargin(): string {
		return this.#rootMargin;
	}

	/**
	 * Returns the normalized thresholds.
	 *
	 * @returns Thresholds.
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

		if (!(target instanceof window.Element)) {
			throw new window.TypeError(
				`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		if (this.#observationStates.has(target)) {
			return;
		}

		this.#observationTargets.push(target);
		this.#observationStates.set(target, { previousThresholdIndex: -1 });

		const observers = window[PropertySymbol.intersectionObservers];
		if (!observers.includes(this)) {
			observers.push(this);
		}

		// Initial observation must queue an entry for each newly observed target.
		this.#computeObservation(target, true);
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

		const window = this[PropertySymbol.window];

		if (!(target instanceof window.Element)) {
			throw new window.TypeError(
				`Failed to execute 'unobserve' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
			);
		}

		const index = this.#observationTargets.indexOf(target);

		if (index === -1) {
			return;
		}

		this.#observationTargets.splice(index, 1);
		this.#observationStates.delete(target);

		// Drop pending records for this target so they are not delivered later.
		this.#queuedEntries = this.#queuedEntries.filter((entry) => entry.target !== target);

		if (this.#observationTargets.length === 0) {
			this.#removeFromWindowObservers();
		}
	}

	/**
	 * Disconnects the observer.
	 */
	public disconnect(): void {
		if (this.#destroyed) {
			return;
		}

		this.#observationTargets = [];
		this.#observationStates.clear();
		this.#queuedEntries = [];
		this.#pendingDelivery = false;
		this.#removeFromWindowObservers();
	}

	/**
	 * Returns queued records and clears the queue.
	 *
	 * @returns Records.
	 */
	public takeRecords(): IntersectionObserverEntry[] {
		const records = this.#queuedEntries;
		this.#queuedEntries = [];
		return records;
	}

	/**
	 * Updates intersection observations (e.g. after scroll or geometry change).
	 */
	public [PropertySymbol.updateIntersectionObservers](): void {
		if (this.#destroyed || this.#observationTargets.length === 0) {
			return;
		}

		const queueLengthBefore = this.#queuedEntries.length;

		for (const target of this.#observationTargets) {
			this.#computeObservation(target, false);
		}

		if (this.#queuedEntries.length > queueLengthBefore) {
			this.#scheduleDelivery();
		}
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
	 * Computes intersection for one target and queues an entry when needed.
	 *
	 * @param target Target.
	 * @param isInitial Whether this is the initial observation after observe().
	 */
	#computeObservation(target: Element, isInitial: boolean): void {
		const state = this.#observationStates.get(target);

		if (!state) {
			return;
		}

		const window = this[PropertySymbol.window];
		const entryInit = this.#createEntryInit(target);
		const thresholdIndex = IntersectionObserverUtility.getThresholdIndex(
			entryInit.intersectionRatio!,
			entryInit.isIntersecting!,
			this.#thresholds
		);

		if (!isInitial && thresholdIndex === state.previousThresholdIndex) {
			return;
		}

		state.previousThresholdIndex = thresholdIndex;

		const entry = new window.IntersectionObserverEntry(entryInit);
		this.#queuedEntries.push(entry);
	}

	/**
	 * Creates entry init data for a target.
	 *
	 * @param target Target.
	 * @returns Entry init.
	 */
	#createEntryInit(target: Element): Partial<IntersectionObserverEntry> {
		const window = this[PropertySymbol.window];
		const boundingClientRect = IntersectionObserverUtility.fromDOMRect(
			target.getBoundingClientRect()
		);
		const rootBounds = this.#getRootBounds();
		const targetArea =
			Math.max(0, boundingClientRect.width) * Math.max(0, boundingClientRect.height);
		const emptyRect: IRect = {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			top: 0,
			right: 0,
			bottom: 0,
			left: 0
		};

		let intersectionRect: IRect | null = null;
		let isIntersecting = false;
		let intersectionRatio = 0;

		if (rootBounds && this.#isValidTargetForRoot(target)) {
			if (targetArea === 0) {
				// Zero-area targets: ratio is 1 when contained, otherwise 0.
				isIntersecting = IntersectionObserverUtility.isContained(boundingClientRect, rootBounds);
				intersectionRect = isIntersecting
					? IntersectionObserverUtility.intersect(boundingClientRect, rootBounds)
					: null;
				intersectionRatio = isIntersecting ? 1 : 0;
			} else {
				intersectionRect = IntersectionObserverUtility.intersect(boundingClientRect, rootBounds);
				isIntersecting = intersectionRect !== null;
				intersectionRatio = IntersectionObserverUtility.getIntersectionRatio(
					boundingClientRect,
					intersectionRect
				);
			}
		}

		return {
			time: window.performance.now(),
			rootBounds: IntersectionObserverUtility.toDOMRectReadOnly(rootBounds),
			boundingClientRect: IntersectionObserverUtility.toDOMRectReadOnly(boundingClientRect),
			intersectionRect: IntersectionObserverUtility.toDOMRectReadOnly(
				intersectionRect ?? emptyRect
			),
			isIntersecting,
			intersectionRatio,
			target
		};
	}

	/**
	 * Returns whether the target is valid relative to the observation root.
	 *
	 * @param target Target.
	 * @returns Whether valid.
	 */
	#isValidTargetForRoot(target: Element): boolean {
		if (!this.#root) {
			return target[PropertySymbol.isConnected];
		}

		if (!this.#root[PropertySymbol.isConnected] || !target[PropertySymbol.isConnected]) {
			return false;
		}

		return this.#root !== target && this.#root.contains(target);
	}

	/**
	 * Returns the root bounds after applying rootMargin.
	 *
	 * @returns Root bounds or null.
	 */
	#getRootBounds(): IRect | null {
		const window = this[PropertySymbol.window];

		if (!this.#root) {
			const viewport = IntersectionObserverUtility.createViewportRect(
				window.innerWidth,
				window.innerHeight
			);
			return IntersectionObserverUtility.applyRootMargin(viewport, this.#parsedRootMargin);
		}

		if (!this.#root[PropertySymbol.isConnected]) {
			return null;
		}

		const rootRect = IntersectionObserverUtility.fromDOMRect(this.#root.getBoundingClientRect());
		return IntersectionObserverUtility.applyRootMargin(rootRect, this.#parsedRootMargin);
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

			if (entries.length === 0) {
				return;
			}

			this.#queuedEntries = [];
			this.#callback(entries, this);
		});
	}

	/**
	 * Removes this observer from the window registry.
	 */
	#removeFromWindowObservers(): void {
		const observers = this[PropertySymbol.window][PropertySymbol.intersectionObservers];
		const index = observers.indexOf(this);

		if (index !== -1) {
			observers.splice(index, 1);
		}
	}
}
