import Window from '../../src/window/Window.js';
import type Document from '../../src/nodes/document/Document.js';
import type Element from '../../src/nodes/element/Element.js';
import DOMRect from '../../src/dom/DOMRect.js';
import type IntersectionObserverEntry from '../../src/intersection-observer/IntersectionObserverEntry.js';
import { beforeEach, describe, it, expect, vi } from 'vitest';

async function flushAsync(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 1));
}

function mockBoundingClientRect(
	element: Element,
	rect: { x: number; y: number; width: number; height: number }
): void {
	element.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height);
}

describe('IntersectionObserver', () => {
	let window: Window;
	let document: Document;

	beforeEach(() => {
		window = new Window();
		document = window.document;
	});

	describe('constructor()', () => {
		it('Throws when callback is missing.', () => {
			expect(() => new (<any>window.IntersectionObserver)()).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': 1 argument required, but only 0 present.`
				)
			);
		});

		it('Throws when callback is not a function.', () => {
			expect(() => new window.IntersectionObserver(<any>'callback')).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': The callback provided as parameter 1 is not a function.`
				)
			);
		});

		it('Throws when root is not an Element.', () => {
			expect(
				() =>
					new window.IntersectionObserver(() => {}, {
						root: <any>document.createTextNode('text')
					})
			).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
				)
			);
		});

		it('Throws when rootMargin is invalid.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: '10em' })).toThrow();
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: 'auto' })).toThrow();
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px 4px 5px' })).toThrow();
		});

		it('Throws when threshold is out of range.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { threshold: 1.5 })).toThrow(
				new RangeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				)
			);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: -0.1 })).toThrow(
				new RangeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				)
			);
		});

		it('Normalizes rootMargin to four values.', () => {
			expect(new window.IntersectionObserver(() => {}).rootMargin).toBe('0px 0px 0px 0px');
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '10px' }).rootMargin).toBe(
				'10px 10px 10px 10px'
			);
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '10px 20%' }).rootMargin).toBe(
				'10px 20% 10px 20%'
			);
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px' }).rootMargin
			).toBe('1px 2px 3px 2px');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px 4px' }).rootMargin
			).toBe('1px 2px 3px 4px');
		});

		it('Normalizes thresholds to sorted unique values.', () => {
			expect(new window.IntersectionObserver(() => {}).thresholds).toEqual([0]);
			expect(new window.IntersectionObserver(() => {}, { threshold: 0.5 }).thresholds).toEqual([
				0.5
			]);
			expect(
				new window.IntersectionObserver(() => {}, { threshold: [0.75, 0, 0.25, 0.25, 1] }).thresholds
			).toEqual([0, 0.25, 0.75, 1]);
		});

		it('Exposes root.', () => {
			const root = document.createElement('div');
			expect(new window.IntersectionObserver(() => {}).root).toBe(null);
			expect(new window.IntersectionObserver(() => {}, { root }).root).toBe(root);
		});
	});

	describe('observe()', () => {
		it('Throws for invalid target.', () => {
			const observer = new window.IntersectionObserver(() => {});
			expect(() => observer.observe(<any>null)).toThrow(
				new TypeError(
					`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
				)
			);
			expect(() => observer.observe(<any>document.createTextNode('x'))).toThrow(
				new TypeError(
					`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
				)
			);
		});

		it('Does not invoke callback synchronously.', () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockBoundingClientRect(target, { x: 0, y: 0, width: 100, height: 100 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			expect(callback).not.toHaveBeenCalled();
		});

		it('Queues an initial entry asynchronously.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockBoundingClientRect(target, { x: 10, y: 20, width: 100, height: 50 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observedEntries) => {
				entries = observedEntries;
			});

			observer.observe(target);
			expect(entries).toEqual([]);

			await flushAsync();

			expect(entries).toHaveLength(1);
			expect(entries[0].target).toBe(target);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].boundingClientRect?.width).toBe(100);
			expect(entries[0].boundingClientRect?.height).toBe(50);
			expect(entries[0].rootBounds?.width).toBe(window.innerWidth);
			expect(entries[0].rootBounds?.height).toBe(window.innerHeight);
			observer.disconnect();
		});

		it('Preserves observation order for entries in the same callback cycle.', async () => {
			const first = document.createElement('div');
			const second = document.createElement('div');
			const third = document.createElement('div');
			document.body.append(first, second, third);
			mockBoundingClientRect(first, { x: 0, y: 0, width: 10, height: 10 });
			mockBoundingClientRect(second, { x: 0, y: 0, width: 10, height: 10 });
			mockBoundingClientRect(third, { x: 0, y: 0, width: 10, height: 10 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observedEntries) => {
				entries = observedEntries;
			});

			observer.observe(first);
			observer.observe(second);
			observer.observe(third);

			await flushAsync();

			expect(entries.map((entry) => entry.target)).toEqual([first, second, third]);
			observer.disconnect();
		});

		it('Supports an element root.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			const outside = document.createElement('div');
			document.body.append(root, outside);
			root.appendChild(target);

			mockBoundingClientRect(root, { x: 0, y: 0, width: 100, height: 100 });
			mockBoundingClientRect(target, { x: 10, y: 10, width: 20, height: 20 });
			mockBoundingClientRect(outside, { x: 10, y: 10, width: 20, height: 20 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(observedEntries) => {
					entries = observedEntries;
				},
				{ root }
			);

			observer.observe(target);
			observer.observe(outside);

			await flushAsync();

			expect(entries).toHaveLength(2);
			expect(entries[0].target).toBe(target);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[1].target).toBe(outside);
			expect(entries[1].isIntersecting).toBe(false);
			expect(entries[1].intersectionRatio).toBe(0);
			observer.disconnect();
		});

		it('Applies pixel rootMargin when calculating intersections.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			// Target is 50px below the viewport bottom (768).
			mockBoundingClientRect(target, { x: 0, y: 800, width: 50, height: 50 });

			let withoutMargin: IntersectionObserverEntry[] = [];
			const observerWithoutMargin = new window.IntersectionObserver((observedEntries) => {
				withoutMargin = observedEntries;
			});
			observerWithoutMargin.observe(target);

			let withMargin: IntersectionObserverEntry[] = [];
			const observerWithMargin = new window.IntersectionObserver(
				(observedEntries) => {
					withMargin = observedEntries;
				},
				{ rootMargin: '0px 0px 100px 0px' }
			);
			observerWithMargin.observe(target);

			await flushAsync();

			expect(withoutMargin[0].isIntersecting).toBe(false);
			expect(withMargin[0].isIntersecting).toBe(true);
			expect(withMargin[0].rootBounds?.bottom).toBe(window.innerHeight + 100);

			observerWithoutMargin.disconnect();
			observerWithMargin.disconnect();
		});

		it('Handles zero-area targets (ratio 1 when contained, otherwise 0).', async () => {
			const contained = document.createElement('div');
			const outside = document.createElement('div');
			document.body.append(contained, outside);
			mockBoundingClientRect(contained, { x: 10, y: 10, width: 0, height: 0 });
			mockBoundingClientRect(outside, { x: -10, y: -10, width: 0, height: 0 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observedEntries) => {
				entries = observedEntries;
			});

			observer.observe(contained);
			observer.observe(outside);

			await flushAsync();

			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[1].intersectionRatio).toBe(0);
			expect(entries[1].isIntersecting).toBe(false);
			observer.disconnect();
		});

		it('Triggers a new entry when a threshold is crossed.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockBoundingClientRect(target, { x: 0, y: 0, width: 100, height: 100 });

			const calls: IntersectionObserverEntry[][] = [];
			const observer = new window.IntersectionObserver(
				(observedEntries) => {
					calls.push(observedEntries);
				},
				{ threshold: [0, 0.5, 1] }
			);

			observer.observe(target);
			await flushAsync();
			expect(calls).toHaveLength(1);
			expect(calls[0][0].intersectionRatio).toBe(1);

			// Half visible.
			mockBoundingClientRect(target, { x: 0, y: window.innerHeight - 50, width: 100, height: 100 });
			window.dispatchEvent(new window.Event('resize'));
			await flushAsync();

			expect(calls.length).toBeGreaterThanOrEqual(2);
			expect(calls[calls.length - 1][0].intersectionRatio).toBe(0.5);
			expect(calls[calls.length - 1][0].isIntersecting).toBe(true);

			// Fully outside.
			mockBoundingClientRect(target, { x: 0, y: window.innerHeight + 10, width: 100, height: 100 });
			window.dispatchEvent(new window.Event('resize'));
			await flushAsync();

			expect(calls[calls.length - 1][0].intersectionRatio).toBe(0);
			expect(calls[calls.length - 1][0].isIntersecting).toBe(false);

			observer.disconnect();
		});
	});

	describe('unobserve()', () => {
		it('Stops future entries for the target.', async () => {
			const first = document.createElement('div');
			const second = document.createElement('div');
			document.body.append(first, second);
			mockBoundingClientRect(first, { x: 0, y: 0, width: 10, height: 10 });
			mockBoundingClientRect(second, { x: 0, y: 0, width: 10, height: 10 });

			const calls: IntersectionObserverEntry[][] = [];
			const observer = new window.IntersectionObserver((observedEntries) => {
				calls.push(observedEntries);
			});

			observer.observe(first);
			observer.observe(second);
			observer.unobserve(first);

			await flushAsync();

			expect(calls).toHaveLength(1);
			expect(calls[0].map((entry) => entry.target)).toEqual([second]);

			mockBoundingClientRect(first, { x: 0, y: 0, width: 20, height: 20 });
			mockBoundingClientRect(second, { x: 0, y: window.innerHeight - 5, width: 10, height: 10 });
			window.dispatchEvent(new window.Event('resize'));
			await flushAsync();

			const lastTargets = calls[calls.length - 1].map((entry) => entry.target);
			expect(lastTargets).not.toContain(first);
			expect(lastTargets).toContain(second);
			observer.disconnect();
		});
	});

	describe('disconnect()', () => {
		it('Stops future delivery and clears pending records.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockBoundingClientRect(target, { x: 0, y: 0, width: 10, height: 10 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			observer.disconnect();

			await flushAsync();

			expect(callback).not.toHaveBeenCalled();
			expect(observer.takeRecords()).toEqual([]);

			mockBoundingClientRect(target, { x: 0, y: 0, width: 20, height: 20 });
			window.dispatchEvent(new window.Event('resize'));
			await flushAsync();

			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('takeRecords()', () => {
		it('Returns queued entries and clears the queue without invoking the callback.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockBoundingClientRect(target, { x: 0, y: 0, width: 10, height: 10 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);

			// Flush the observation update microtask so an entry is queued, then take it
			// before the delivery microtask invokes the callback.
			await Promise.resolve();

			const records = observer.takeRecords();
			expect(records).toHaveLength(1);
			expect(records[0].target).toBe(target);
			expect(observer.takeRecords()).toEqual([]);

			await flushAsync();
			expect(callback).not.toHaveBeenCalled();
			observer.disconnect();
		});
	});
});
