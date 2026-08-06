import type Element from '../nodes/element/Element.js';

export default interface IIntersectionObserverInit {
	/**
	 * A specific ancestor of the target element against which the intersection is to be calculated.
	 * If null or omitted, the bounds of the document's viewport are used.
	 */
	root?: Element | null;
	/**
	 * A string which specifies a set of offsets to add to the root's bounding box when calculating intersections.
	 */
	rootMargin?: string;
	/**
	 * A list of thresholds, sorted in increasing numeric order, where each threshold is a ratio of intersection area to bounding box area of the target.
	 */
	threshold?: number | number[];
}
