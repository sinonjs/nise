"use strict";

var Event = require("./event");

/**
 * Creates an event with an additional `detail` payload.
 * @param {string} type Event type.
 * @param {{detail?: unknown}} customData Source object for the `detail`
 * payload.
 * @param {object} [target] Event target.
 * @class
 */
function CustomEvent(type, customData, target) {
    this.initEvent(type, false, false, target);
    this.detail = customData.detail || null;
}

CustomEvent.prototype = new Event();

CustomEvent.prototype.constructor = CustomEvent;

module.exports = CustomEvent;
