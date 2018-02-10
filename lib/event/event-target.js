"use strict";

var EventTarget = {
    addEventListener: function addEventListener(event, listener) {
        this.eventListeners = this.eventListeners || {};
        this.eventListeners[event] = this.eventListeners[event] || [];

        if (this.eventListeners[event].indexOf(listener) === -1) {
            this.eventListeners[event].push(listener);
        }
    },

    removeEventListener: function removeEventListener(event, listener) {
        var listeners = this.eventListeners && this.eventListeners[event] || [];
        var index = listeners.indexOf(listener);

        if (index === -1) {
            return;
        }

        listeners.splice(index, 1);
    },

    dispatchEvent: function dispatchEvent(event) {
        var self = this;
        var type = event.type;
        var listeners = self.eventListeners && self.eventListeners[type] || [];

        listeners.forEach(function (listener) {
            if (typeof listener === "function") {
                listener.call(self, event);
            } else {
                listener.handleEvent(event);
            }
        });

        return !!event.defaultPrevented;
    }
};

module.exports = EventTarget;
