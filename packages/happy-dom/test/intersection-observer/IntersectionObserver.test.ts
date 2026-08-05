import Window from '../../src/window/Window.js';
import type Document from '../../src/nodes/document/Document.js';
import DOMRect from '../../src/dom/DOMRect.js';
import type IntersectionObserverEntry from '../../src/intersection-observer/IntersectionObserverEntry.js';
import IntersectionObserverImplementation from '../../src/intersection-observer/IntersectionObserver.js';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const flushMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
};

const waitForAnimationFrame = (window: Window): Promise<void> =>
	new Promise((resolve) => {
		window.requestAnimationFrame(() => resolve());
	});

describe('IntersectionObserver', () => {
	let window: Window;
	let document: Document;

	beforeEach(() => {
		window = new Window({ width: 1024, height: 768 });
		document = window.document;
	});

	afterEach(() => {
		window.close();
	});

	describe('constructor()', () => {
		it('Throws when callback is not a function.', () => {
			expect(() => new window.IntersectionObserver(<any>null)).toThrow(TypeError);
			expect(() => new window.IntersectionObserver(<any>'callback')).toThrow(TypeError);
		});

		it('Throws when constructed outside a Window context.', () => {
			expect(() => new IntersectionObserverImplementation(() => {})).toThrow(TypeError);
		});

		it('Throws for invalid root.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { root: <any>document })).toThrow(
				TypeError
			);
			expect(() => new window.IntersectionObserver(() => {}, { root: <any>'root' })).toThrow(
				TypeError
			);
		});

		it('Throws for invalid rootMargin.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: '10em' })).toThrow(
				TypeError
			);
			expect(() => new window.IntersectionObserver(() => {}, { rootMargin: 'auto' })).toThrow(
				TypeError
			);
			expect(
				() => new window.IntersectionObserver(() => {}, { rootMargin: '1px 2px 3px 4px 5px' })
			).toThrow(TypeError);
		});

		it('Throws for invalid threshold.', () => {
			expect(() => new window.IntersectionObserver(() => {}, { threshold: 1.5 })).toThrow(TypeError);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: -0.1 })).toThrow(
				TypeError
			);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: <any>NaN })).toThrow(
				TypeError
			);
			expect(() => new window.IntersectionObserver(() => {}, { threshold: [0, 2] })).toThrow(
				TypeError
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
			expect(new window.IntersectionObserver(() => {}, { rootMargin: '-10px' }).rootMargin).toBe(
				'-10px -10px -10px -10px'
			);
		});

		it('Exposes normalized sorted unique thresholds.', () => {
			expect(new window.IntersectionObserver(() => {}).thresholds).toEqual([0]);
			expect(new window.IntersectionObserver(() => {}, { threshold: 0.5 }).thresholds).toEqual([
				0.5
			]);
			expect(
				new window.IntersectionObserver(() => {}, { threshold: [0.75, 0, 0.25, 0.25] }).thresholds
			).toEqual([0, 0.25, 0.75]);
		});

		it('Supports null root (viewport) and element root.', () => {
			const root = document.createElement('div');
			expect(new window.IntersectionObserver(() => {}, { root: null }).root).toBe(null);
			expect(new window.IntersectionObserver(() => {}, { root }).root).toBe(root);
		});
	});

	describe('observe()', () => {
		it('Throws for invalid target.', () => {
			const observer = new window.IntersectionObserver(() => {});
			expect(() => observer.observe(<any>null)).toThrow(TypeError);
			expect(() => observer.observe(<any>document.createTextNode('text'))).toThrow(TypeError);
		});

		it('Does not invoke the callback synchronously.', () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			expect(callback).not.toHaveBeenCalled();
			observer.disconnect();
		});

		it('Queues an initial entry asynchronously for each newly observed target.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			target.getBoundingClientRect = () => new DOMRect(10, 10, 100, 100);

			let entries: IntersectionObserverEntry[] | null = null;
			const observer = new window.IntersectionObserver((observedEntries) => {
				entries = observedEntries;
			});

			observer.observe(target);
			expect(entries).toBe(null);

			await flushMicrotasks();

			expect(entries).not.toBe(null);
			expect(entries!.length).toBe(1);
			expect(entries![0].target).toBe(target);
			expect(entries![0].isIntersecting).toBe(true);
			expect(entries![0].intersectionRatio).toBe(1);
			observer.disconnect();
		});

		it('Preserves observation order for entries delivered in the same callback cycle.', async () => {
			const first = document.createElement('div');
			const second = document.createElement('div');
			const third = document.createElement('div');
			document.body.append(first, second, third);

			for (const element of [first, second, third]) {
				element.getBoundingClientRect = () => new DOMRect(0, 0, 50, 50);
			}

			let entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observedEntries) => {
				entries = observedEntries;
			});

			observer.observe(first);
			observer.observe(second);
			observer.observe(third);

			await flushMicrotasks();

			expect(entries.map((entry) => entry.target)).toEqual([first, second, third]);
			observer.disconnect();
		});

		it('Does nothing when observing the same target again.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			target.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			observer.observe(target);
			await flushMicrotasks();

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback.mock.calls[0][0].length).toBe(1);
			observer.disconnect();
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
			await waitForAnimationFrame(window);
			await flushMicrotasks();

			expect(callback).toHaveBeenCalledTimes(1);
			observer.disconnect();
		});
	});

	describe('disconnect()', () => {
		it('Stops future delivery and clears pending records.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			target.getBoundingClientRect = () => new DOMRect(0, 0, 40, 40);

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			expect(observer.takeRecords().length).toBe(1);
			observer.disconnect();

			await flushMicrotasks();
			expect(callback).not.toHaveBeenCalled();
			expect(observer.takeRecords()).toEqual([]);
		});
	});

	describe('takeRecords()', () => {
		it('Returns and clears pending records without invoking the callback.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			target.getBoundingClientRect = () => new DOMRect(0, 0, 40, 40);

			const callback = vi.fn();
			const observer = new window.IntersectionObserver(callback);

			observer.observe(target);
			const records = observer.takeRecords();

			expect(records.length).toBe(1);
			expect(records[0].target).toBe(target);
			expect(observer.takeRecords()).toEqual([]);

			await flushMicrotasks();
			expect(callback).not.toHaveBeenCalled();
			observer.disconnect();
		});
	});

	describe('intersection calculations', () => {
		it('Calculates intersection against the viewport root.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);
			target.getBoundingClientRect = () => new DOMRect(924, 0, 200, 100);

			let entry: IntersectionObserverEntry | null = null;
			const observer = new window.IntersectionObserver((entries) => {
				entry = entries[0];
			});

			observer.observe(target);
			await flushMicrotasks();

			expect(entry).not.toBe(null);
			expect(entry!.rootBounds?.toJSON()).toEqual({
				x: 0,
				y: 0,
				width: 1024,
				height: 768,
				top: 0,
				right: 1024,
				bottom: 768,
				left: 0
			});
			expect(entry!.intersectionRect?.toJSON()).toEqual({
				x: 924,
				y: 0,
				width: 100,
				height: 100,
				top: 0,
				right: 1024,
				bottom: 100,
				left: 924
			});
			expect(entry!.intersectionRatio).toBe(0.5);
			expect(entry!.isIntersecting).toBe(true);
			observer.disconnect();
		});

		it('Calculates intersection against an element root with pixel rootMargin.', async () => {
			const root = document.createElement('div');
			const target = document.createElement('div');
			document.body.appendChild(root);
			root.appendChild(target);

			root.getBoundingClientRect = () => new DOMRect(100, 100, 100, 100);
			target.getBoundingClientRect = () => new DOMRect(50, 100, 50, 50);

			let entry: IntersectionObserverEntry | null = null;
			const observer = new window.IntersectionObserver(
				(entries) => {
					entry = entries[0];
				},
				{ root, rootMargin: '0px 0px 0px 50px' }
			);

			observer.observe(target);
			await flushMicrotasks();

			expect(entry).not.toBe(null);
			expect(entry!.rootBounds?.toJSON()).toEqual({
				x: 50,
				y: 100,
				width: 150,
				height: 100,
				top: 100,
				right: 200,
				bottom: 200,
				left: 50
			});
			expect(entry!.isIntersecting).toBe(true);
			expect(entry!.intersectionRatio).toBe(1);
			observer.disconnect();
		});

		it('Uses ratio 1 for zero-area targets when contained, otherwise 0.', async () => {
			const contained = document.createElement('div');
			const outside = document.createElement('div');
			document.body.append(contained, outside);

			contained.getBoundingClientRect = () => new DOMRect(10, 10, 0, 0);
			outside.getBoundingClientRect = () => new DOMRect(2000, 2000, 0, 0);

			const entries: IntersectionObserverEntry[] = [];
			const observer = new window.IntersectionObserver((observedEntries) => {
				entries.push(...observedEntries);
			});

			observer.observe(contained);
			observer.observe(outside);
			await flushMicrotasks();

			expect(entries[0].intersectionRatio).toBe(1);
			expect(entries[0].isIntersecting).toBe(true);
			expect(entries[1].intersectionRatio).toBe(0);
			expect(entries[1].isIntersecting).toBe(false);
			observer.disconnect();
		});

		it('Triggers a new entry when a target crosses a threshold.', async () => {
			const target = document.createElement('div');
			document.body.appendChild(target);

			let rect = new DOMRect(0, 0, 100, 100);
			target.getBoundingClientRect = () => rect;

			const ratios: number[] = [];
			const observer = new window.IntersectionObserver(
				(observedEntries) => {
					for (const entry of observedEntries) {
						ratios.push(entry.intersectionRatio);
					}
				},
				{ threshold: [0, 0.5, 1] }
			);

			observer.observe(target);
			await flushMicrotasks();
			expect(ratios).toEqual([1]);

			rect = new DOMRect(974, 0, 100, 100);
			await waitForAnimationFrame(window);
			await flushMicrotasks();

			expect(ratios.length).toBe(2);
			expect(ratios[1]).toBe(0.5);
			observer.disconnect();
		});
	});
});
