"use strict";

/**
 * Normalizes boolean and object listener options to a DOM-like shape.
 * @param {boolean|object} options Listener options or capture flag.
 * @returns {{capture: boolean, once: boolean, passive: boolean}} Normalized listener options.
 */
function flattenOptions(options) {
    if (options !== Object(options)) {
        return {
            capture: Boolean(options),
            once: false,
            passive: false,
        };
    }
    return {
        capture: Boolean(options.capture),
        once: Boolean(options.once),
        passive: Boolean(options.passive),
    };
}
/**
 * Inverts a predicate used while filtering listener registrations.
 * @param {function(...object): boolean} fn Predicate to invert.
 * @returns {function(...object): boolean} Inverted predicate.
 */
function not(fn) {
    return function () {
        return !fn.apply(this, arguments);
    };
}
/**
 * Matches a listener registration by callback identity and capture mode.
 * @param {function(object): void|{handleEvent: function(object): void}} listener Listener to match.
 * @param {boolean} capture Expected capture mode.
 * @returns {function({capture: boolean, listener: (function(object): void|{handleEvent: function(object): void})}): boolean} Listener matcher.
 */
function hasListenerFilter(listener, capture) {
    return function (listenerSpec) {
        return (
            listenerSpec.capture === capture &&
            listenerSpec.listener === listener
        );
    };
}

/**
 * Mixin with a DOM-like event target API.
 */
var EventTarget = {
    // https://dom.spec.whatwg.org/#dom-eventtarget-addeventlistener
    /**
     * Registers a listener for the given event type.
     * @param {string} event Event type.
     * @param {function(object): void|{handleEvent: function(object): void}} listener Callback or object with `handleEvent`.
     * @param {boolean|object} [providedOptions] Listener options or capture flag.
     * @returns {void}
     */
    addEventListener: function addEventListener(
        event,
        listener,
        providedOptions,
    ) {
        // 3. Let capture, passive, and once be the result of flattening more options.
        // Flatten property before executing step 2,
        // feture detection is usually based on registering handler with options object,
        // that has getter defined
        // addEventListener("load", () => {}, {
        //    get once() { supportsOnce = true; }
        // });
        var options = flattenOptions(providedOptions);

        // 2. If callback is null, then return.
        if (listener === null || listener === undefined) {
            return;
        }

        this.eventListeners = this.eventListeners || {};
        this.eventListeners[event] = this.eventListeners[event] || [];

        // 4. If context object’s associated list of event listener
        //    does not contain an event listener whose type is type,
        //    callback is callback, and capture is capture, then append
        //    a new event listener to it, whose type is type, callback is
        //    callback, capture is capture, passive is passive, and once is once.
        if (
            !this.eventListeners[event].some(
                hasListenerFilter(listener, options.capture),
            )
        ) {
            this.eventListeners[event].push({
                listener: listener,
                capture: options.capture,
                once: options.once,
            });
        }
    },

    // https://dom.spec.whatwg.org/#dom-eventtarget-removeeventlistener
    /**
     * Removes a listener previously added for the given event type.
     * @param {string} event Event type.
     * @param {function(object): void|{handleEvent: function(object): void}} listener Callback or object with `handleEvent`.
     * @param {boolean|object} [providedOptions] Listener options or capture flag.
     * @returns {void}
     */
    removeEventListener: function removeEventListener(
        event,
        listener,
        providedOptions,
    ) {
        if (!this.eventListeners || !this.eventListeners[event]) {
            return;
        }

        // 2. Let capture be the result of flattening options.
        var options = flattenOptions(providedOptions);

        // 3. If there is an event listener in the associated list of
        //    event listeners whose type is type, callback is callback,
        //    and capture is capture, then set that event listener’s
        //    removed to true and remove it from the associated list of event listeners.
        this.eventListeners[event] = this.eventListeners[event].filter(
            not(hasListenerFilter(listener, options.capture)),
        );
    },

    /**
     * Dispatches an event to the registered listeners.
     * @param {object} event Event object with a `type` property.
     * @returns {boolean} Whether the event was prevented.
     */
    dispatchEvent: function dispatchEvent(event) {
        if (!this.eventListeners || !this.eventListeners[event.type]) {
            return Boolean(event.defaultPrevented);
        }

        var self = this;
        var type = event.type;
        var listeners = self.eventListeners[type];

        // Remove listeners, that should be dispatched once
        // before running dispatch loop to avoid nested dispatch issues
        self.eventListeners[type] = listeners.filter(function (listenerSpec) {
            return !listenerSpec.once;
        });
        listeners.forEach(function (listenerSpec) {
            var listener = listenerSpec.listener;
            if (typeof listener === "function") {
                listener.call(self, event);
            } else {
                listener.handleEvent(event);
            }
        });

        return Boolean(event.defaultPrevented);
    },
};

module.exports = EventTarget;
