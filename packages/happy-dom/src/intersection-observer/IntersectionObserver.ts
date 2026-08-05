import IntersectionObserverEntry from './IntersectionObserverEntry.js';
import type IIntersectionObserverInit from './IIntersectionObserverInit.js';
import type Element from '../nodes/element/Element.js';
import * as PropertySymbol from '../PropertySymbol.js';
import type BrowserWindow from '../window/BrowserWindow.js';
import IntersectionObserverUtility from './IntersectionObserverUtility.js';
import type { IParsedRootMargin } from './IntersectionObserverUtility.js';
import NodeTypeEnum from '../nodes/node/NodeTypeEnum.js';
import DOMExceptionNameEnum from '../exception/DOMExceptionNameEnum.js';

interface IIntersectionObservation {
	target: Element;
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

	readonly #callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;
	readonly #root: Element | null;
	readonly #rootMargin: string;
	readonly #parsedRootMargin: IParsedRootMargin;
	readonly #thresholds: number[];
	#observations: IIntersectionObservation[] = [];
	#queuedEntries: IntersectionObserverEntry[] = [];
	#deliveryQueued = false;
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

		if (typeof callback !== 'function') {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': The callback provided as parameter 1 is not a function.`
			);
		}

		const init = options ?? {};

		if (
			init.root != null &&
			(!(init.root instanceof window.Element) ||
				(<Element>init.root)[PropertySymbol.nodeType] !== NodeTypeEnum.elementNode)
		) {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
			);
		}

		if (init.rootMargin !== undefined && init.rootMargin !== null && typeof init.rootMargin !== 'string') {
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Failed to read the 'rootMargin' property from 'IntersectionObserverInit': The provided value is not of type 'string'.`
			);
		}

		let parsedRootMargin: IParsedRootMargin;
		try {
			parsedRootMargin = IntersectionObserverUtility.parseRootMargin(init.rootMargin ?? '0px');
		} catch (error) {
			throw new window.DOMException(
				`Failed to construct 'IntersectionObserver': ${(error as Error).message}`,
				DOMExceptionNameEnum.syntaxError
			);
		}

		let thresholds: number[];
		try {
			thresholds = IntersectionObserverUtility.normalizeThresholds(init.threshold);
		} catch (error) {
			if (error instanceof RangeError) {
				throw new window.RangeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				);
			}
			throw new window.TypeError(
				`Failed to construct 'IntersectionObserver': Failed to read the 'threshold' property from 'IntersectionObserverInit': The provided value is not of type 'unrestricted double'.`
			);
		}

		this.#callback = callback;
		this.#root = init.root ?? null;
		this.#parsedRootMargin = parsedRootMargin;
		this.#rootMargin = parsedRootMargin.serialized;
		this.#thresholds = Object.freeze(thresholds) as number[];
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
	 * Returns the normalized root margin.
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
			!target ||
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
			previousThresholdIndex: -1
		});

		if (!window[PropertySymbol.intersectionObservers].includes(this)) {
			window[PropertySymbol.intersectionObservers].push(this);
		}

		this[PropertySymbol.updateIntersectionObservations]();
	}

	/**
	 * Unobserves a target element.
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
		this.#queuedEntries = this.#queuedEntries.filter((entry) => entry.target !== target);

		if (this.#observations.length === 0) {
			this.#removeFromWindow();
		}
	}

	/**
	 * Disconnects the observer.
	 */
	public disconnect(): void {
		if (this.#destroyed) {
			return;
		}

		this.#observations = [];
		this.#queuedEntries = [];
		this.#deliveryQueued = false;
		this.#removeFromWindow();
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
	 * Updates intersection observations and queues entries when thresholds are crossed.
	 */
	public [PropertySymbol.updateIntersectionObservations](): void {
		if (this.#destroyed || this.#observations.length === 0) {
			return;
		}

		const window = this[PropertySymbol.window];
		const time = window.performance.now();
		let queuedNewEntry = false;

		for (const observation of this.#observations) {
			const result = IntersectionObserverUtility.computeIntersection(
				window,
				observation.target,
				this.#root,
				this.#parsedRootMargin
			);
			const thresholdIndex = IntersectionObserverUtility.getThresholdIndex(
				this.#thresholds,
				result.intersectionRatio
			);

			if (thresholdIndex === observation.previousThresholdIndex) {
				continue;
			}

			observation.previousThresholdIndex = thresholdIndex;
			this.#queuedEntries.push(
				new IntersectionObserverEntry({
					boundingClientRect: result.boundingClientRect,
					intersectionRatio: result.intersectionRatio,
					intersectionRect: result.intersectionRect,
					isIntersecting: result.isIntersecting,
					rootBounds: result.rootBounds,
					target: observation.target,
					time
				})
			);
			queuedNewEntry = true;
		}

		if (queuedNewEntry) {
			this.#scheduleDelivery();
		}
	}

	/**
	 * Destroys the observer.
	 */
	public [PropertySymbol.destroy](): void {
		this.#destroyed = true;
		this.disconnect();
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
	#removeFromWindow(): void {
		const observers = this[PropertySymbol.window][PropertySymbol.intersectionObservers];
		const index = observers.indexOf(this);
		if (index !== -1) {
			observers.splice(index, 1);
		}
	}
}
