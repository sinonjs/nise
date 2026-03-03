"use strict";

var Event = require("./event");

/**
 * Creates an event that exposes transfer progress information.
 * @param {string} type Event type.
 * @param {object} progressEventRaw Source progress values.
 * @param {object} [target] Event target.
 * @class
 */
function ProgressEvent(type, progressEventRaw, target) {
    this.initEvent(type, false, false, target);
    this.loaded =
        typeof progressEventRaw.loaded === "number"
            ? progressEventRaw.loaded
            : null;
    this.total =
        typeof progressEventRaw.total === "number"
            ? progressEventRaw.total
            : null;
    this.lengthComputable = Boolean(progressEventRaw.total);
}

ProgressEvent.prototype = new Event();

ProgressEvent.prototype.constructor = ProgressEvent;

module.exports = ProgressEvent;
