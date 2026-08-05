import Window from '../../src/window/Window.js';
import type Document from '../../src/nodes/document/Document.js';
import DOMRect from '../../src/dom/DOMRect.js';
import type Element from '../../src/nodes/element/Element.js';
import type IntersectionObserverEntry from '../../src/intersection-observer/IntersectionObserverEntry.js';
import { beforeEach, describe, it, expect, vi } from 'vitest';

function setBoundingClientRect(element: Element, rect: DOMRect): void {
	element.getBoundingClientRect = () => rect;
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

async function flushAnimationFrame(window: Window): Promise<void> {
	await new Promise<void>((resolve) => {
		window.requestAnimationFrame(() => resolve());
	});
	await flushMicrotasks();
}

describe('IntersectionObserver', () => {
	let window: Window;
	let document: Document;

	beforeEach(() => {
		window = new Window({ innerWidth: 1024, innerHeight: 768 });
		document = window.document;
	});

	describe('constructor()', () => {
		it('Throws when callback is not a function.', () => {
			expect(() => new window.IntersectionObserver(<any>null)).toThrowError(
				/The callback provided as parameter 1 is not a function/
			);
			expect(() => new window.IntersectionObserver(<any>'callback')).toThrowError(
				/The callback provided as parameter 1 is not a function/
			);
		});

		it('Throws when root is invalid.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { root: <any>123 })).toThrowError(
				/root/
			);
			expect(
				() => new window.IntersectionObserver(() => {}, { root: <any>document.createTextNode('x') })
			).toThrowError(/root/);
		});

		it('Throws when rootMargin is not a string.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: <any>10 })).toThrowError(
				/rootMargin/
			);
		});

		it('Throws SyntaxError when rootMargin cannot be parsed.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: '10em' })).toThrowError(
				/rootMargin/
			);
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: 'auto' })).toThrow();
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: '' })).toThrow();
		});

		it('Throws RangeError when threshold is outside 0..1.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { threshold: -0.1 })).toThrowError(
				/Threshold values must be between 0 and 1 inclusive/
			);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: 1.1 })).toThrowError(
				/Threshold values must be between 0 and 1 inclusive/
			);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: [0, 2] })).toThrowError(
				/Threshold values must be between 0 and 1 inclusive/
			);
		});

		it('Throws TypeError when threshold is not numeric.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { threshold: <any>'x' })).toThrowError(
				/threshold/
			);
		});

		it('Exposes normalized rootMargin in four-value form.', () => {
			expect(new window.IntersectionObserver(() => {}).rootMargin).toBe('0px 0px 0px 0px');
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '10px' }).rootMargin).toBe(
				'10px 10px 10px 10px'
			);
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '10px 20%' }).rootMargin
			).toBe('10px 20% 10px 20%');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px' }).rootMargin
			).toBe('1px 2px 3px 2px');
			expect(
				new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px 4px' }).rootMargin
			).toBe('1px 2px 3px 4px');
		});

		it('Exposes sorted unique thresholds.', () => {
			expect(new window.IntersectionObserver(() => {}).thresholds).toEqual([0]);
			expect(new window.IntersectionObserver(() => {}, { threshold: 0.5 }).thresholds).toEqual([
				0.5
			]);
			expect(
				new window.IntersectionObserver(() => {}, { threshold: [0.75, 0, 0.25, 0.25, 1] }).thresholds
			).toEqual([0, 0.25, 0.75, 1]);
		});

		it('Supports null root as viewport.', () => {
			const observer = new window.IntersectionObserver(() => {}, { root: null });
			expect(observer.root).toBeNull();
		});

		it('Supports an element root.', () => {
			const root = document.createElement('div');
			const observer = new window.IntersectionObserver(() => {}, { root });
			expect(observer.root).toBe(root);
		});
	});

	describe('observe()', () => {
		it('Throws when target is not an Element.', () => {
			const observer = new window.IntersectionObserver(() => {});
			expect(() => observer.observe(<any>null)).toThrowError(/parameter 1 is not of type 'Element'/);
			expect(() => observer.observe(<any>document.createTextNode('x'))).toThrowError(
				/parameter 1 is not of type 'Element'/
			);
		});

		it('Does not invoke the callback synchronously.', () => {
			const callback = vi.fn();
			const target = document.createElement('div');
			document.body.appendChild(target);
			setBoundingClientRect(target, new DOMRect(10, 10, 100, 100));

			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);

			expect(callback).not.toHaveBeenCalled();
		});

		it('Queues an initial entry asynchronously for each newly observed target.', async () => {
			const entriesByCall: IntersectionObserverEntry[][] = [];
			const a = document.createElement('div');
			const b = document.createElement('div');
			document.body.appendChild(a);
			document.body.appendChild(b);
			setBoundingClientRect(a, new DOMRect(0, 0, 50, 50));
			setBoundingClientRect(b, new DOMRect(0, 0, 50, 50));

			const observer = new window.IntersectionObserver((entries) => {
				entriesByCall.push(entries);
			});

			observer.observe(a);
			observer.observe(b);

			expect(entriesByCall).toEqual([]);

			await flushMicrotasks();

			expect(entriesByCall).toHaveLength(1);
			expect(entriesByCall[0].map((entry) => entry.target)).toEqual([a, b]);
			expect(entriesByCall[0][0].isIntersecting).toBe(true);
			expect(entriesByCall[0][0].intersectionRatio).toBe(1);
		});

		it('Preserves observation order in a single callback cycle.', async () => {
			const targets = [1, 2, 3].map(() => {
				const el = document.createElement('div');
				document.body.appendChild(el);
				setBoundingClientRect(el, new DOMRect(0, 0, 10, 10));
				return el;
			});

			let received: Element[] = [];
			const observer = new window.IntersectionObserver((entries) => {
				received = entries.map((entry) => <Element>entry.target);
			});

			for (const target of targets) {
				observer.observe(target);
			}

			await flushMicrotasks();
			expect(received).toEqual(targets);
		});

		it('Ignores observing the same target twice.', async () => {
			const callback = vi.fn();
			const target = document.createElement('div');
			document.body.appendChild(target);
			setBoundingClientRect(target, new DOMRect(0, 0, 20, 20));

			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);
			observer.observe(target);

			await flushMicrotasks();
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0][0]).toHaveLength(1);
		});
	});

	describe('geometry', () => {
		it('Calculates viewport intersection with pixel rootMargin.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			// Fully outside the viewport below the fold.
			setBoundingClientRect(target, new DOMRect(0, 800, 100, 100));

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(next) => {
					entries = next;
				},
				{ rootMargin: '50px' }
			);

			observer.observe(target);
			await flushMicrotasks();

			// Expanded root bottom is 768 + 50 = 818, so 800..818 intersects.
			expect(entries).toHaveLength(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRect?.height).toBe(18);
			expect(entries[0].rootBounds).toEqual(new DOMRect(-50, -50, 1124, 868));
		});

		it('Calculates intersection against an element root.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			document.body.appendChild(root);
			root.appendChild(target);

			setBoundingClientRect(root, new DOMRect(100, 100, 200, 200));
			setBoundingClientRect(target, new DOMRect(150, 150, 50, 50));

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(next) => {
					entries = next;
				},
				{ root }
			);

			observer.observe(target);
			await flushMicrotasks();

			expect(entries).toHaveLength(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].rootBounds).toEqual(new DOMRect(100, 100, 200, 200));
		});

		it('Treats targets outside an element root as not intersecting.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			document.body.appendChild(root);
			document.body.appendChild(target);

			setBoundingClientRect(root, new DOMRect(0, 0, 100, 100));
			setBoundingClientRect(target, new DOMRect(10, 10, 20, 20));

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver(
				(next) => {
					entries = next;
				},
				{ root }
			);

			observer.observe(target);
			await flushMicrotasks();

			expect(entries[0].isIntersecting).toBe(false);
			expect(entries[0].intersectionRatio).toBe(0);
		});

		it('Uses ratio 1 for contained zero-area targets and 0 otherwise.', async () => {
			const inside = document.createElement('div');
			const outside = document.createElement('div');
			document.body.appendChild(inside);
			document.body.appendChild(outside);
			setBoundingClientRect(inside, new DOMRect(10, 10, 0, 0));
			setBoundingClientRect(outside, new DOMRect(2000, 2000, 0, 0));

			const received: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((entries) => {
				received.push(...entries);
			});

			observer.observe(inside);
			observer.observe(outside);
			await flushMicrotasks();

			expect(received[0].intersectionRatio).toBe(1);
			expect(received[0].isIntersecting).toBe(true);
			expect(received[1].intersectionRatio).toBe(0);
			expect(received[1].isIntersecting).toBe(false);
		});

		it('Triggers a new entry when a target crosses a threshold.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);

			let rect = new DOMRect(0, 700, 100, 100);
			target.getBoundingClientRect = () => rect;

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
			await flushMicrotasks();
			expect(ratios).toEqual([0.68]);

			rect = new DOMRect(0, 0, 100, 100);
			await flushAnimationFrame(window);

			expect(ratios).toEqual([0.68, 1]);
		});
	});

	describe('unobserve()', () => {
		it('Stops future entries for that target.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			let rect = new DOMRect(0, 0, 100, 100);
			target.getBoundingClientRect = () => rect;

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback, { threshold: [0, 1] });

			observer.observe(target);
			await flushMicrotasks();
			expect(callback).toHaveBeenCalledTimes(1);

			observer.unobserve(target);
			rect = new DOMRect(2000, 2000, 100, 100);
			await flushAnimationFrame(window);

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('Clears pending records for the unobserved target.', async () => {
			const a = document.createElement('div');
			const b = document.createElement('div');
			document.body.appendChild(a);
			document.body.appendChild(b);
			setBoundingClientRect(a, new DOMRect(0, 0, 10, 10));
			setBoundingClientRect(b, new DOMRect(0, 0, 10, 10));

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);
			observer.observe(a);
			observer.observe(b);
			observer.unobserve(a);

			await flushMicrotasks();

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0][0].map((entry: IntersectionObserverEntry) => entry.target)).toEqual([
				b
			]);
		});
	});

	describe('disconnect()', () => {
		it('Stops future delivery and clears pending records.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			setBoundingClientRect(target, new DOMRect(0, 0, 10, 10));

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);
			observer.disconnect();

			expect(observer.takeRecords()).toEqual([]);
			await flushMicrotasks();
			expect(callback).not.toHaveBeenCalled();

			setBoundingClientRect(target, new DOMRect(0, 0, 20, 20));
			await flushAnimationFrame(window);
			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe('takeRecords()', () => {
		it('Returns and clears queued entries without invoking the callback.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			setBoundingClientRect(target, new DOMRect(0, 0, 10, 10));

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);
			observer.observe(target);

			const records = observer.takeRecords();
			expect(records).toHaveLength(1);
			expect(records[0].target).toBe(target);
			expect(observer.takeRecords()).toEqual([]);

			await flushMicrotasks();
			expect(callback).not.toHaveBeenCalled();
		});
	});
});
