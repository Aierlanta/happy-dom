import Window from '../../src/window/Window.js';
import type Document from '../../src/nodes/document/Document.js';
import type Element from '../../src/nodes/element/Element.js';
import type IntersectionObserverEntry from '../../src/intersection-observer/IntersectionObserverEntry.js';
import DOMRect from '../../src/dom/DOMRect.js';
import { beforeEach, describe, it, expect, vi } from 'vitest';

describe('IntersectionObserver', () => {
	let window: Window;
	let document: Document;

	beforeEach(() => {
		window = new Window({ width: 1024, height: 768 });
		document = window.document;
	});

	/**
	 * Flushes microtasks.
	 */
	async function flush(): Promise<void> {
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	}

	/**
	 * Mocks getBoundingClientRect.
	 *
	 * @param element Element.
	 * @param rect Rect.
	 * @param rect.x X.
	 * @param rect.y Y.
	 * @param rect.width Width.
	 * @param rect.height Height.
	 */
	function mockRect(
		element: Element,
		rect: { x: number; y: number; width: number; height: number }
	): void {
		element.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height);
	}

	describe('constructor()', () => {
		it('Throws when callback is missing.', () => {
			expect(() => new (<any>window.IntersectionObserver)()).toThrow(
				/1 argument required, but only 0 present/
			);
		});

		it('Throws when callback is not a function.', () => {
			expect(() => new window.IntersectionObserver(<any>'callback')).toThrow(
				/The callback provided as parameter 1 is not a function/
			);
		});

		it('Throws when root is invalid.', () => {
			expect(
				() =>
					new window.IntersectionObserver(() => {}, {
						root: <any>{}
					})
			).toThrow(/root specified must be an Element or null/);
		});

		it('Throws when rootMargin is invalid.', () => {
			expect(
				() =>
					new window.IntersectionObserver(() => {}, {
						rootMargin: '10em'
					})
			).toThrow(/rootMargin/);
		});

		it('Throws when threshold is out of range.', () => {
			expect(
				() =>
					new window.IntersectionObserver(() => {}, {
						threshold: 1.5
					})
			).toThrow(/Threshold values must be numbers between 0 and 1 inclusive/);
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
				new window.IntersectionObserver(() => {}, { rootMargin: '10px 20% 30px 40%' }).rootMargin
			).toBe('10px 20% 30px 40%');
		});

		it('Normalizes thresholds to sorted unique values.', () => {
			expect(new window.IntersectionObserver(() => {}).thresholds).toEqual([0]);
			expect(new window.IntersectionObserver(() => {}, { threshold: 0.5 }).thresholds).toEqual([
				0.5
			]);
			expect(
				new window.IntersectionObserver(() => {}, { threshold: [0.5, 0, 1, 0.5] }).thresholds
			).toEqual([0, 0.5, 1]);
		});

		it('Exposes root.', () => {
			const root = document.createElement('div');
			expect(new window.IntersectionObserver(() => {}, { root }).root).toBe(root);
			expect(new window.IntersectionObserver(() => {}).root).toBe(null);
		});
	});

	describe('observe()', () => {
		it('Throws for invalid target.', () => {
			const observer = new window.IntersectionObserver(() => {});
			expect(() => observer.observe(<any>null)).toThrow(/parameter 1 is not of type 'Element'/);
			expect(() => observer.observe(<any>{})).toThrow(/parameter 1 is not of type 'Element'/);
		});

		it('Does not invoke callback synchronously.', () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 0, y: 0, width: 100, height: 100 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);

			expect(callback).not.toHaveBeenCalled();
		});

		it('Queues an initial entry asynchronously.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 10, y: 10, width: 100, height: 100 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((e) => {
				entries = e;
			});

			observer.observe(target);
			expect(entries).toEqual([]);

			await flush();

			expect(entries).toHaveLength(1);
			expect(entries[0].target).toBe(target);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].boundingClientRect?.width).toBe(100);
			expect(entries[0].rootBounds?.width).toBe(1024);
			expect(entries[0].rootBounds?.height).toBe(768);
		});

		it('Preserves observation order for entries in the same callback cycle.', async () => {
			const targets = [
				document.createElement('div'),
				document.createElement('div'),
				document.createElement('div')
			];

			for (const target of targets) {
				document.body.appendChild(target);
				mockRect(target, { x: 0, y: 0, width: 50, height: 50 });
			}

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((e) => {
				entries = e;
			});

			observer.observe(targets[0]);
			observer.observe(targets[1]);
			observer.observe(targets[2]);

			await flush();

			expect(entries.map((entry) => entry.target)).toEqual(targets);
		});

		it('Supports an element root.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			document.body.appendChild(root);
			root.appendChild(target);

			mockRect(root, { x: 0, y: 0, width: 200, height: 200 });
			mockRect(target, { x: 50, y: 50, width: 50, height: 50 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(e) => {
					entries = e;
				},
				{ root }
			);

			observer.observe(target);
			await flush();

			expect(entries).toHaveLength(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].rootBounds?.width).toBe(200);
		});

		it('Applies pixel rootMargin to the root bounds.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			// Just outside the viewport to the right, but inside after +50px right margin.
			mockRect(target, { x: 1040, y: 0, width: 20, height: 20 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(e) => {
					entries = e;
				},
				{ rootMargin: '0px 50px 0px 0px' }
			);

			observer.observe(target);
			await flush();

			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].rootBounds?.width).toBe(1074);
			expect(entries[0].rootBounds?.x).toBe(0);
		});

		it('Handles zero-area targets as ratio 1 when contained.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 10, y: 10, width: 0, height: 0 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((e) => {
				entries = e;
			});

			observer.observe(target);
			await flush();

			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
		});

		it('Handles zero-area targets as ratio 0 when not contained.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 2000, y: 2000, width: 0, height: 0 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((e) => {
				entries = e;
			});

			observer.observe(target);
			await flush();

			expect(entries[0].isIntersecting).toBe(false);
			expect(entries[0].intersectionRatio).toBe(0);
		});

		it('Computes partial intersection ratios.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			// Half inside viewport horizontally.
			mockRect(target, { x: 974, y: 0, width: 100, height: 100 });

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((e) => {
				entries = e;
			});

			observer.observe(target);
			await flush();

			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(0.5);
			expect(entries[0].intersectionRect?.width).toBe(50);
		});

		it('Ignores observing the same target twice.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 0, y: 0, width: 10, height: 10 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			observer.observe(target);

			await flush();

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0][0]).toHaveLength(1);
		});
	});

	describe('unobserve()', () => {
		it('Stops future entries for that target.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);

			let y = 0;
			target.getBoundingClientRect = () => new DOMRect(0, y, 100, 100);

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback, { threshold: [0, 1] });

			observer.observe(target);
			await flush();
			expect(callback).toHaveBeenCalledTimes(1);

			observer.unobserve(target);
			y = 2000;
			window.scrollTo(0, 1);
			await flush();

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('Removes pending records for the target.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 0, y: 0, width: 10, height: 10 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			observer.unobserve(target);

			await flush();

			expect(callback).not.toHaveBeenCalled();
			expect(observer.takeRecords()).toEqual([]);
		});
	});

	describe('disconnect()', () => {
		it('Stops future delivery and clears pending records.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 0, y: 0, width: 10, height: 10 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			observer.disconnect();

			await flush();

			expect(callback).not.toHaveBeenCalled();
			expect(observer.takeRecords()).toEqual([]);
		});
	});

	describe('takeRecords()', () => {
		it('Returns and clears queued entries before callback delivery.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			mockRect(target, { x: 0, y: 0, width: 10, height: 10 });

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);

			const records = observer.takeRecords();
			expect(records).toHaveLength(1);
			expect(records[0].target).toBe(target);
			expect(observer.takeRecords()).toEqual([]);

			await flush();

			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('threshold crossing', () => {
		it('Triggers new entries when a target crosses a threshold.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);

			let x = 0;
			target.getBoundingClientRect = () => new DOMRect(x, 0, 100, 100);

			const ratios: number[] = [];
			const observer = new window.IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						ratios.push(entry.intersectionRatio);
					}
				},
				{ threshold: [0, 0.5, 1] }
			);

			observer.observe(target);
			await flush();
			expect(ratios).toEqual([1]);

			// Move half out of the viewport to cross the 0.5 and 1 thresholds.
			x = 974;
			window.scrollTo(0, 0);
			await flush();

			expect(ratios).toEqual([1, 0.5]);

			// Move completely out.
			x = 2000;
			window.scrollTo(0, 1);
			await flush();

			expect(ratios[ratios.length - 1]).toBe(0);
		});
	});
});
