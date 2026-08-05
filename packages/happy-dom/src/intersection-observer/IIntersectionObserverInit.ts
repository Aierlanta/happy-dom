import type Element from '../nodes/element/Element.js';

export default interface IIntersectionObserverInit {
	/**
	 * A specific ancestor of the target element against which the intersection is to be calculated.
	 * Null means the viewport.
	 */
	root?: Element | null;
	/**
	 * Margin around the root. Can have values similar to the CSS margin property.
	 */
	rootMargin?: string;
	/**
	 * A list of thresholds, sorted in increasing numeric order, where each threshold is a ratio of intersection area to bounding box area of the target.
	 */
	threshold?: number | number[];
}
