import Window from '../../src/window/Window.js';
import type Document from '../../src/nodes/document/Document.js';
import DOMRect from '../../src/dom/DOMRect.js';
import type IntersectionObserverEntry from '../../src/intersection-observer/IntersectionObserverEntry.js';
import { beforeEach, describe, it, expect, vi } from 'vitest';

describe('IntersectionObserver', () => {
	let window: Window;
	let document: Document;

	/**
	 * @param element Element.
	 * @param rect Rect.
	 * @param rect.x
	 * @param rect.y
	 * @param rect.width
	 * @param rect.height
	 */
	function mockBoundingClientRect(
		element: Element,
		rect: { x: number; y: number; width: number; height: number }
	): void {
		element.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height);
	}

	/**
	 * @param ms Milliseconds.
	 */
	async function wait(ms = 1): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	beforeEach(() => {
		window = new Window({ width: 1024, height: 768 });
		document = window.document;
	});

	describe('constructor()', () => {
		it('Throws when callback argument is missing.', () => {
			expect(() => new (<any>window.IntersectionObserver)()).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': 1 argument required, but only 0 present.`
				)
			);
		});

		it('Throws when callback is missing.', () => {
			expect(() => new window.IntersectionObserver(<any>undefined)).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': The callback provided as parameter 1 is not a function.`
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
			expect(() => new window.IntersectionObserver(() => {}, { root: <any>document })).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': Failed to read the 'root' property from 'IntersectionObserverInit': Failed to convert value to 'Element'.`
				)
			);
		});

		it('Throws when rootMargin cannot be parsed.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: '10em' })).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value from options parameter.`
				)
			);
			expect(
				() => new window.IntersectionObserver(() => {}, { rootMargin: '10px 10px 10px 10px 10px' })
			).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': Failed to parse rootMargin value from options parameter.`
				)
			);
		});

		it('Throws when threshold is outside 0..1.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { threshold: 1.5 })).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				)
			);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: [-0.1, 0.5] })).toThrow(
				new TypeError(
					`Failed to construct 'IntersectionObserver': Threshold values must be between 0 and 1 inclusive.`
				)
			);
		});

		it('Normalizes rootMargin to four values.', () => {
			expect(new window.IntersectionObserver(() => {}).rootMargin).toBe('0px 0px 0px 0px');
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '10px' }).rootMargin).toBe(
				'10px 10px 10px 10px'
			);
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '10px 5%' }).rootMargin).toBe(
				'10px 5% 10px 5%'
			);
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px' }).rootMargin
			).toBe('1px 2px 3px 2px');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '1px 2% 3px 4%' }).rootMargin
			).toBe('1px 2% 3px 4%');
		});

		it('Normalizes thresholds to sorted unique values.', () => {
			expect(new window.IntersectionObserver(() => {}).thresholds).toEqual([0]);
			expect(new window.IntersectionObserver(() => {}, { threshold: 0.5 }).thresholds).toEqual([
				0.5
			]);
			expect(
				new window.IntersectionObserver(() => {}, { threshold: [0.75, 0.25, 0.25, 0] }).thresholds
			).toEqual([0, 0.25, 0.75]);
			expect(new window.IntersectionObserver(() => {}, { threshold: [] }).thresholds).toEqual([0]);
		});

		it('Exposes root.', () => {
			const root = document.createElement('div');
			expect(new window.IntersectionObserver(() => {}).root).toBe(null);
			expect(new window.IntersectionObserver(() => {}, { root }).root).toBe(root);
		});
	});

	describe('observe()', () => {
		it('Throws when target is not an Element.', () => {
			const observer = new window.IntersectionObserver(() => {});
			expect(() => observer.observe(<any>document)).toThrow(
				new TypeError(
					`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
				)
			);
			expect(() => observer.observe(<any>null)).toThrow(
				new TypeError(
					`Failed to execute 'observe' on 'IntersectionObserver': parameter 1 is not of type 'Element'.`
				)
			);
		});

		it('Does not invoke the callback synchronously.', () => {
			const callback = vi.fn();
			const target = document.createElement('div');
			mockBoundingClientRect(target, { x: 0, y: 0, width: 100, height: 100 });
			document.body.appendChild(target);

			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);

			expect(callback).not.toHaveBeenCalled();
		});

		it('Queues an initial entry asynchronously for each newly observed target.', async () => {
			const entries: IntersectionObserverEntry[][] = [];
			const first = document.createElement('div');
			const second = document.createElement('div');
			mockBoundingClientRect(first, { x: 10, y: 10, width: 50, height: 50 });
			mockBoundingClientRect(second, { x: 2000, y: 2000, width: 50, height: 50 });
			document.body.appendChild(first);
			document.body.appendChild(second);

			const observer = new window.IntersectionObserver((batch) => {
				entries.push(batch);
			});

			observer.observe(first);
			observer.observe(second);

			await wait();

			expect(entries).toHaveLength(1);
			expect(entries[0].map((entry) => entry.target)).toEqual([first, second]);
			expect(entries[0][0].isIntersecting).toBe(true);
			expect(entries[0][0].intersectionRatio).toBe(1);
			expect(entries[0][1].isIntersecting).toBe(false);
			expect(entries[0][1].intersectionRatio).toBe(0);
		});

		it('Preserves target observation order in the same callback cycle.', async () => {
			const targets = [
				document.createElement('div'),
				document.createElement('div'),
				document.createElement('div')
			];
			for (const target of targets) {
				mockBoundingClientRect(target, { x: 0, y: 0, width: 10, height: 10 });
				document.body.appendChild(target);
			}

			let received: Element[] = [];
			const observer = new window.IntersectionObserver((batch) => {
				received = batch.map((entry) => entry.target);
			});

			for (const target of targets) {
				observer.observe(target);
			}

			await wait();

			expect(received).toEqual(targets);
		});

		it('Ignores observing the same target twice.', async () => {
			const callback = vi.fn();
			const target = document.createElement('div');
			mockBoundingClientRect(target, { x: 0, y: 0, width: 10, height: 10 });
			document.body.appendChild(target);

			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);
			observer.observe(target);

			await wait();

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0][0]).toHaveLength(1);
		});
	});

	describe('intersection calculations', () => {
		it('Calculates intersections against the viewport root.', async () => {
			const target = document.createElement('div');
			mockBoundingClientRect(target, { x: 924, y: 0, width: 200, height: 100 });
			document.body.appendChild(target);

			let entry: IntersectionObserverEntry | null = null;
			const observer = new window.IntersectionObserver((batch) => {
				entry = batch[0];
			});
			observer.observe(target);

			await wait();

			expect(entry).not.toBeNull();
			expect(entry!.isIntersecting).toBe(true);
			expect(entry!.intersectionRatio).toBeCloseTo(0.5);
			expect(entry!.intersectionRect.width).toBe(100);
			expect(entry!.intersectionRect.height).toBe(100);
			expect(entry!.rootBounds?.width).toBe(1024);
			expect(entry!.rootBounds?.height).toBe(768);
			expect(entry!.boundingClientRect.width).toBe(200);
			expect(entry!.target).toBe(target);
		});

		it('Calculates intersections against an element root.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			mockBoundingClientRect(root, { x: 100, y: 100, width: 100, height: 100 });
			mockBoundingClientRect(target, { x: 150, y: 150, width: 100, height: 100 });
			root.appendChild(target);
			document.body.appendChild(root);

			let entry: IntersectionObserverEntry | null = null;
			const observer = new window.IntersectionObserver(
				(batch) => {
					entry = batch[0];
				},
				{ root }
			);
			observer.observe(target);

			await wait();

			expect(entry!.isIntersecting).toBe(true);
			expect(entry!.intersectionRatio).toBeCloseTo(0.25);
			expect(entry!.intersectionRect.toJSON()).toEqual({
				x: 150,
				y: 150,
				width: 50,
				height: 50,
				top: 150,
				right: 200,
				bottom: 200,
				left: 150
			});
			expect(entry!.rootBounds?.toJSON()).toEqual({
				x: 100,
				y: 100,
				width: 100,
				height: 100,
				top: 100,
				right: 200,
				bottom: 200,
				left: 100
			});
		});

		it('Applies pixel rootMargin to the root bounds.', async () => {
			const target = document.createElement('div');
			mockBoundingClientRect(target, { x: -30, y: 0, width: 20, height: 20 });
			document.body.appendChild(target);

			let withoutMargin: IntersectionObserverEntry | null = null;
			let withMargin: IntersectionObserverEntry | null = null;

			const observerWithout = new window.IntersectionObserver((batch) => {
				withoutMargin = batch[0];
			});
			observerWithout.observe(target);

			const observerWith = new window.IntersectionObserver(
				(batch) => {
					withMargin = batch[0];
				},
				{ rootMargin: '0px 0px 0px 40px' }
			);
			observerWith.observe(target);

			await wait();

			expect(withoutMargin!.isIntersecting).toBe(false);
			expect(withMargin!.isIntersecting).toBe(true);
			expect(withMargin!.intersectionRatio).toBe(1);
			expect(withMargin!.rootBounds?.left).toBe(-40);
			expect(withMargin!.rootBounds?.width).toBe(1064);
		});

		it('Uses ratio 1 for contained zero-area targets and 0 otherwise.', async () => {
			const inside = document.createElement('div');
			const outside = document.createElement('div');
			mockBoundingClientRect(inside, { x: 10, y: 10, width: 0, height: 50 });
			mockBoundingClientRect(outside, { x: 2000, y: 10, width: 0, height: 50 });
			document.body.appendChild(inside);
			document.body.appendChild(outside);

			const entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((batch) => {
				entries.push(...batch);
			});
			observer.observe(inside);
			observer.observe(outside);

			await wait();

			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[1].isIntersecting).toBe(false);
			expect(entries[1].intersectionRatio).toBe(0);
		});

		it('Treats a target outside an element root as not intersecting.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			mockBoundingClientRect(root, { x: 0, y: 0, width: 100, height: 100 });
			mockBoundingClientRect(target, { x: 0, y: 0, width: 50, height: 50 });
			document.body.appendChild(root);
			document.body.appendChild(target);

			let entry: IntersectionObserverEntry | null = null;
			const observer = new window.IntersectionObserver(
				(batch) => {
					entry = batch[0];
				},
				{ root }
			);
			observer.observe(target);

			await wait();

			expect(entry!.isIntersecting).toBe(false);
			expect(entry!.intersectionRatio).toBe(0);
		});
	});

	describe('threshold crossings', () => {
		it('Triggers a new entry when a target crosses a threshold after resize.', async () => {
			const target = document.createElement('div');
			let rect = { x: 0, y: 0, width: 100, height: 100 };
			target.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height);
			document.body.appendChild(target);

			const batches: IntersectionObserverEntry[][] = [];
			const observer = new window.IntersectionObserver(
				(batch) => {
					batches.push(batch);
				},
				{ threshold: [0, 0.5, 1] }
			);
			observer.observe(target);

			await wait();

			expect(batches).toHaveLength(1);
			expect(batches[0][0].intersectionRatio).toBe(1);

			// Half of the target remains inside the viewport (ratio 0.5).
			rect = { x: 974, y: 0, width: 100, height: 100 };
			window.happyDOM.setViewport({ width: 1024, height: 700 });

			await wait();

			expect(batches).toHaveLength(2);
			expect(batches[1][0].intersectionRatio).toBeCloseTo(0.5);
			expect(batches[1][0].isIntersecting).toBe(true);
		});
	});

	describe('unobserve()', () => {
		it('Stops future entries for that target.', async () => {
			const first = document.createElement('div');
			const second = document.createElement('div');
			let firstRect = { x: 0, y: 0, width: 100, height: 100 };
			let secondRect = { x: 0, y: 0, width: 100, height: 100 };
			first.getBoundingClientRect = () =>
				new DOMRect(firstRect.x, firstRect.y, firstRect.width, firstRect.height);
			second.getBoundingClientRect = () =>
				new DOMRect(secondRect.x, secondRect.y, secondRect.width, secondRect.height);
			document.body.appendChild(first);
			document.body.appendChild(second);

			const batches: IntersectionObserverEntry[][] = [];
			const observer = new window.IntersectionObserver(
				(batch) => {
					batches.push(batch);
				},
				{ threshold: [0, 0.5, 1] }
			);

			observer.observe(first);
			observer.observe(second);
			await wait();

			observer.unobserve(first);
			firstRect = { x: 974, y: 0, width: 100, height: 100 };
			secondRect = { x: 974, y: 0, width: 100, height: 100 };
			window.happyDOM.setViewport({ width: 1024, height: 700 });
			await wait();

			expect(batches).toHaveLength(2);
			expect(batches[1].map((entry) => entry.target)).toEqual([second]);
			expect(batches[1][0].intersectionRatio).toBeCloseTo(0.5);
		});
	});

	describe('disconnect()', () => {
		it('Stops future delivery and clears pending records.', async () => {
			const callback = vi.fn();
			const target = document.createElement('div');
			let rect = { x: 0, y: 0, width: 100, height: 100 };
			target.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height);
			document.body.appendChild(target);

			const observer = new window.IntersectionObserver(callback, { threshold: [0, 0.5, 1] });
			observer.observe(target);
			observer.disconnect();

			expect(observer.takeRecords()).toEqual([]);

			await wait();

			expect(callback).not.toHaveBeenCalled();

			rect = { x: 974, y: 0, width: 100, height: 100 };
			window.happyDOM.setViewport({ width: 1024, height: 700 });
			await wait();

			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('takeRecords()', () => {
		it('Returns queued entries and prevents callback delivery for them.', async () => {
			const callback = vi.fn();
			const target = document.createElement('div');
			mockBoundingClientRect(target, { x: 0, y: 0, width: 100, height: 100 });
			document.body.appendChild(target);

			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);

			const records = observer.takeRecords();

			expect(records).toHaveLength(1);
			expect(records[0].target).toBe(target);
			expect(observer.takeRecords()).toEqual([]);

			await wait();

			expect(callback).not.toHaveBeenCalled();
		});
	});
});
