import Window from '../../src/window/Window.js';
import type Document from '../../src/nodes/document/Document.js';
import DOMRect from '../../src/dom/DOMRect.js';
import type IntersectionObserverEntry from '../../src/intersection-observer/IntersectionObserverEntry.js';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

describe('IntersectionObserver', () => {
	let window: Window;
	let document: Document;

	beforeEach(() => {
		window = new Window({ width: 1024, height: 768 });
		document = window.document;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/**
	 * Waits for observer microtask delivery.
	 */
	async function waitForDelivery(): Promise<void> {
		await new Promise((resolve) => window.queueMicrotask(() => resolve(undefined)));
	}

	/**
	 * Waits for one animation frame.
	 */
	async function waitForFrame(): Promise<void> {
		await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
	}

	/**
	 * Mocks getBoundingClientRect on an element.
	 *
	 * @param element Element.
	 * @param rect Rect.
	 */
	function mockRect(
		element: {
			getBoundingClientRect: () => DOMRect;
		},
		rect: { x: number; y: number; width: number; height: number }
	): void {
		element.getBoundingClientRect = () =>
			new DOMRect(rect.x, rect.y, rect.width, rect.height);
	}

	describe('constructor()', () => {
		it('Throws when callback is missing.', () => {
			expect(() => new (<any>window.IntersectionObserver)()).toThrow(window.TypeError);
		});

		it('Throws when callback is not a function.', () => {
			expect(() => new window.IntersectionObserver(<any>null)).toThrow(window.TypeError);
			expect(() => new window.IntersectionObserver(<any>123)).toThrow(window.TypeError);
		});

		it('Throws when root is not an Element.', () => {
			expect(
				() =>
					new window.IntersectionObserver(() => {}, {
						root: <any>document.createTextNode('x')
					})
			).toThrow(window.TypeError);
			expect(
				() =>
					new window.IntersectionObserver(() => {}, {
						root: <any>{}
					})
			).toThrow(window.TypeError);
		});

		it('Throws SyntaxError for invalid rootMargin.', () => {
			expect(
				() => new window.IntersectionObserver(() => {}, { rootMargin: '10em' })
			).toThrow(window.SyntaxError);
			expect(
				() => new window.IntersectionObserver(() => {}, { rootMargin: '10' })
			).toThrow(window.SyntaxError);
			expect(
				() => new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px 4px 5px' })
			).toThrow(window.SyntaxError);
		});

		it('Throws RangeError for out-of-range thresholds.', () => {
			expect(
				() => new window.IntersectionObserver(() => {}, { threshold: -0.1 })
			).toThrow(window.RangeError);
			expect(
				() => new window.IntersectionObserver(() => {}, { threshold: 1.1 })
			).toThrow(window.RangeError);
			expect(
				() => new window.IntersectionObserver(() => {}, { threshold: [0, 2] })
			).toThrow(window.RangeError);
		});

		it('Throws TypeError for non-finite thresholds.', () => {
			expect(
				() => new window.IntersectionObserver(() => {}, { threshold: Infinity })
			).toThrow(window.TypeError);
			expect(
				() => new window.IntersectionObserver(() => {}, { threshold: NaN })
			).toThrow(window.TypeError);
		});

		it('Normalizes rootMargin to four values.', () => {
			expect(new window.IntersectionObserver(() => {}).rootMargin).toBe('0px 0px 0px 0px');
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '10px' }).rootMargin).toBe(
				'10px 10px 10px 10px'
			);
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '10px 20px' }).rootMargin
			).toBe('10px 20px 10px 20px');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '10px 20px 30px' }).rootMargin
			).toBe('10px 20px 30px 20px');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '10px 20px 30px 40px' }).rootMargin
			).toBe('10px 20px 30px 40px');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '5% 10%' }).rootMargin
			).toBe('5% 10% 5% 10%');
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '0' }).rootMargin).toBe(
				'0px 0px 0px 0px'
			);
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '-10px 5%' }).rootMargin
			).toBe('-10px 5% -10px 5%');
		});

		it('Normalizes thresholds to sorted unique values.', () => {
			expect(new window.IntersectionObserver(() => {}).thresholds).toEqual([0]);
			expect(new window.IntersectionObserver(() => {}, { threshold: 0.5 }).thresholds).toEqual([
				0.5
			]);
			expect(
				new window.IntersectionObserver(() => {}, { threshold: [0.75, 0, 0.25, 0.25, 1] })
					.thresholds
			).toEqual([0, 0.25, 0.75, 1]);
		});

		it('Exposes root.', () => {
			const root = document.createElement('div');
			expect(new window.IntersectionObserver(() => {}).root).toBeNull();
			expect(new window.IntersectionObserver(() => {}, { root }).root).toBe(root);
			expect(new window.IntersectionObserver(() => {}, { root: null }).root).toBeNull();
		});
	});

	describe('observe()', () => {
		it('Throws when target is missing or invalid.', () => {
			const observer = new window.IntersectionObserver(() => {});
			expect(() => (<any>observer).observe()).toThrow(window.TypeError);
			expect(() => observer.observe(<any>null)).toThrow(window.TypeError);
			expect(() => observer.observe(<any>document.createTextNode('x'))).toThrow(window.TypeError);
			observer.disconnect();
		});

		it('Does not invoke callback synchronously.', () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			mockRect(div, { x: 0, y: 0, width: 100, height: 100 });

			let called = false;
			const observer = new window.IntersectionObserver(() => {
				called = true;
			});

			observer.observe(div);
			expect(called).toBe(false);
			observer.disconnect();
		});

		it('Queues an initial entry asynchronously.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			mockRect(div, { x: 10, y: 20, width: 100, height: 50 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observed) => {
				entries = observed;
			});

			observer.observe(div);
			expect(entries).toEqual([]);

			await waitForDelivery();

			expect(entries).toHaveLength(1);
			expect(entries[0].target).toBe(div);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].boundingClientRect.width).toBe(100);
			expect(entries[0].boundingClientRect.height).toBe(50);
			expect(entries[0].rootBounds?.width).toBe(1024);
			expect(entries[0].rootBounds?.height).toBe(768);

			observer.disconnect();
		});

		it('Preserves target observation order in the same callback cycle.', async () => {
			const a = document.createElement('div');
			const b = document.createElement('div');
			const c = document.createElement('div');
			document.body.appendChild(a);
			document.body.appendChild(b);
			document.body.appendChild(c);
			mockRect(a, { x: 0, y: 0, width: 10, height: 10 });
			mockRect(b, { x: 0, y: 0, width: 10, height: 10 });
			mockRect(c, { x: 0, y: 0, width: 10, height: 10 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observed) => {
				entries = observed;
			});

			observer.observe(a);
			observer.observe(b);
			observer.observe(c);

			await waitForDelivery();

			expect(entries.map((entry) => entry.target)).toEqual([a, b, c]);
			observer.disconnect();
		});

		it('Ignores observing the same target twice.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			mockRect(div, { x: 0, y: 0, width: 10, height: 10 });

			let calls = 0;
			let entryCount = 0;
			const observer = new window.IntersectionObserver((observed) => {
				calls++;
				entryCount += observed.length;
			});

			observer.observe(div);
			observer.observe(div);

			await waitForDelivery();

			expect(calls).toBe(1);
			expect(entryCount).toBe(1);
			observer.disconnect();
		});
	});

	describe('takeRecords()', () => {
		it('Returns and clears pending records before callback delivery.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			mockRect(div, { x: 0, y: 0, width: 10, height: 10 });

			let callbackEntries: IntersectionObserverEntry[] | null = null;
			const observer = new window.IntersectionObserver((observed) => {
				callbackEntries = observed;
			});

			observer.observe(div);

			const records = observer.takeRecords();
			expect(records).toHaveLength(1);
			expect(records[0].target).toBe(div);
			expect(observer.takeRecords()).toEqual([]);

			await waitForDelivery();
			expect(callbackEntries).toBeNull();

			observer.disconnect();
		});
	});

	describe('unobserve()', () => {
		it('Stops future entries for that target.', async () => {
			const a = document.createElement('div');
			const b = document.createElement('div');
			document.body.appendChild(a);
			document.body.appendChild(b);

			let rectA = { x: 0, y: 0, width: 100, height: 100 };
			let rectB = { x: 0, y: 0, width: 100, height: 100 };
			a.getBoundingClientRect = () => new DOMRect(rectA.x, rectA.y, rectA.width, rectA.height);
			b.getBoundingClientRect = () => new DOMRect(rectB.x, rectB.y, rectB.width, rectB.height);

			const batches: IntersectionObserverEntry[][] = [];
			const observer = new window.IntersectionObserver(
				(observed) => {
					batches.push(observed);
				},
				{ threshold: [0, 0.5, 1] }
			);

			observer.observe(a);
			observer.observe(b);
			await waitForDelivery();
			expect(batches).toHaveLength(1);

			observer.unobserve(a);

			// Move both outside the viewport so ratio crosses thresholds; only b should notify.
			rectA = { x: 2000, y: 2000, width: 100, height: 100 };
			rectB = { x: 2000, y: 2000, width: 100, height: 100 };

			await waitForFrame();
			await waitForDelivery();

			const targetsAfterUnobserve = batches.slice(1).flatMap((batch) =>
				batch.map((entry) => entry.target)
			);
			expect(targetsAfterUnobserve).not.toContain(a);
			expect(targetsAfterUnobserve).toContain(b);

			observer.disconnect();
		});
	});

	describe('disconnect()', () => {
		it('Stops future delivery and clears pending records.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			mockRect(div, { x: 0, y: 0, width: 100, height: 100 });

			let calls = 0;
			const observer = new window.IntersectionObserver(() => {
				calls++;
			});

			observer.observe(div);
			observer.disconnect();

			expect(observer.takeRecords()).toEqual([]);

			await waitForDelivery();
			expect(calls).toBe(0);

			mockRect(div, { x: 0, y: 0, width: 1, height: 1 });
			await waitForFrame();
			await waitForDelivery();
			expect(calls).toBe(0);
		});

		it('Clears pending records that would have been delivered.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			mockRect(div, { x: 0, y: 0, width: 100, height: 100 });

			let calls = 0;
			const observer = new window.IntersectionObserver(() => {
				calls++;
			});

			observer.observe(div);
			expect(observer.takeRecords().length).toBe(1);
			observer.disconnect();
			expect(observer.takeRecords()).toEqual([]);

			await waitForDelivery();
			expect(calls).toBe(0);
		});
	});

	describe('intersection calculations', () => {
		it('Supports viewport root with pixel rootMargin.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			// Outside the normal viewport but inside with 50px margin
			mockRect(div, { x: 0, y: 780, width: 20, height: 20 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(observed) => {
					entries = observed;
				},
				{ rootMargin: '50px' }
			);

			observer.observe(div);
			await waitForDelivery();

			expect(entries).toHaveLength(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].rootBounds?.y).toBe(-50);
			expect(entries[0].rootBounds?.height).toBe(768 + 100);

			observer.disconnect();
		});

		it('Supports an element root.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			document.body.appendChild(root);
			root.appendChild(target);

			mockRect(root, { x: 0, y: 0, width: 200, height: 200 });
			mockRect(target, { x: 50, y: 50, width: 100, height: 100 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(observed) => {
					entries = observed;
				},
				{ root }
			);

			observer.observe(target);
			await waitForDelivery();

			expect(entries).toHaveLength(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].rootBounds?.width).toBe(200);
			expect(entries[0].rootBounds?.height).toBe(200);

			observer.disconnect();
		});

		it('Returns no intersection when target is not a descendant of element root.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			document.body.appendChild(root);
			document.body.appendChild(target);

			mockRect(root, { x: 0, y: 0, width: 200, height: 200 });
			mockRect(target, { x: 50, y: 50, width: 100, height: 100 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(observed) => {
					entries = observed;
				},
				{ root }
			);

			observer.observe(target);
			await waitForDelivery();

			expect(entries[0].isIntersecting).toBe(false);
			expect(entries[0].intersectionRatio).toBe(0);

			observer.disconnect();
		});

		it('Handles zero-area targets (ratio 1 when contained, otherwise 0).', async () => {
			const inside = document.createElement('div');
			const outside = document.createElement('div');
			document.body.appendChild(inside);
			document.body.appendChild(outside);

			mockRect(inside, { x: 10, y: 10, width: 0, height: 0 });
			mockRect(outside, { x: 2000, y: 2000, width: 0, height: 0 });

			const insideEntries: IntersectionObserverEntry[] = [];
			const outsideEntries: IntersectionObserverEntry[] = [];

			const insideObserver = new window.IntersectionObserver((observed) => {
				insideEntries.push(...observed);
			});
			const outsideObserver = new window.IntersectionObserver((observed) => {
				outsideEntries.push(...observed);
			});

			insideObserver.observe(inside);
			outsideObserver.observe(outside);
			await waitForDelivery();

			expect(insideEntries[0].isIntersecting).toBe(true);
			expect(insideEntries[0].intersectionRatio).toBe(1);
			expect(outsideEntries[0].isIntersecting).toBe(false);
			expect(outsideEntries[0].intersectionRatio).toBe(0);

			insideObserver.disconnect();
			outsideObserver.disconnect();
		});

		it('Computes partial intersection ratios.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);
			// Half of the 100x100 box is outside the bottom of the 768-tall viewport
			mockRect(div, { x: 0, y: 718, width: 100, height: 100 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observed) => {
				entries = observed;
			});

			observer.observe(div);
			await waitForDelivery();

			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBeCloseTo(0.5, 5);
			expect(entries[0].intersectionRect?.height).toBeCloseTo(50, 5);

			observer.disconnect();
		});

		it('Triggers new entries when a target crosses a threshold.', async () => {
			const div = document.createElement('div');
			document.body.appendChild(div);

			let rect = { x: 0, y: 0, width: 100, height: 100 };
			div.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height);

			const batches: IntersectionObserverEntry[][] = [];
			const observer = new window.IntersectionObserver(
				(observed) => {
					batches.push(observed.map((entry) => entry));
				},
				{ threshold: [0, 0.5, 1] }
			);

			observer.observe(div);
			await waitForDelivery();
			expect(batches).toHaveLength(1);
			expect(batches[0][0].intersectionRatio).toBe(1);

			// Shrink so only 25% remains visible relative to full box area against viewport —
			// place box half outside to get 0.25 ratio: 50x50 visible of 100x100
			rect = { x: 0, y: 718, width: 100, height: 100 };
			// Visible height = 768-718 = 50 => ratio 0.5 — cross below 1 towards 0.5

			await waitForFrame();
			await waitForDelivery();

			expect(batches.length).toBeGreaterThanOrEqual(2);
			expect(batches[batches.length - 1][0].intersectionRatio).toBeCloseTo(0.5, 5);

			observer.disconnect();
		});
	});
});
