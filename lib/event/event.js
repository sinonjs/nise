"use strict";

/**
 * Creates a minimal DOM-like event object.
 * @param {string} type Event type.
 * @param {boolean} bubbles Whether the event bubbles.
 * @param {boolean} cancelable Whether the default action can be prevented.
 * @param {object} [target] Event target.
 * @class
 */
function Event(type, bubbles, cancelable, target) {
    this.initEvent(type, bubbles, cancelable, target);
}

Event.prototype = {
    /**
     * Reinitializes the event instance with new values.
     * @param {string} type Event type.
     * @param {boolean} bubbles Whether the event bubbles.
     * @param {boolean} cancelable Whether the default action can be prevented.
     * @param {object} [target] Event target.
     * @returns {void}
     */
    initEvent: function (type, bubbles, cancelable, target) {
        this.type = type;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
        this.target = target;
        this.currentTarget = target;
    },

    /** Included for API compatibility with DOM events. */
    // eslint-disable-next-line no-empty-function
    stopPropagation: function () {},

    /**
     * Marks the event as prevented.
     *
     * Unlike DOM events, this implementation sets `defaultPrevented` even when
     * the event is not cancelable.
     * @returns {void}
     */
    preventDefault: function () {
        this.defaultPrevented = true;
    },
};

module.exports = Event;
