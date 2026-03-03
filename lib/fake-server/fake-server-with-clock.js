"use strict";

var FakeTimers = require("@sinonjs/fake-timers");
var fakeServer = require("./index");

/**
 * Internal constructor used to create a clock-aware fake server variant.
 */
// eslint-disable-next-line no-empty-function
function Server() {}
Server.prototype = fakeServer;

/**
 * Fake server variant that advances fake timers while processing responses.
 * @type {object}
 */
var fakeServerWithClock = new Server();

/**
 * Registers a request and installs fake timers for async request handling.
 * @param {object} xhr Fake XMLHttpRequest instance.
 * @returns {void}
 */
fakeServerWithClock.addRequest = function addRequest(xhr) {
    if (xhr.async) {
        if (typeof setTimeout.clock === "object") {
            this.clock = setTimeout.clock;
        } else {
            this.clock = FakeTimers.install();
            this.resetClock = true;
        }

        if (!this.longestTimeout) {
            var clockSetTimeout = this.clock.setTimeout;
            var clockSetInterval = this.clock.setInterval;
            var server = this;

            this.clock.setTimeout = function (fn, timeout) {
                server.longestTimeout = Math.max(
                    timeout,
                    server.longestTimeout || 0,
                );

                return clockSetTimeout.apply(this, arguments);
            };

            this.clock.setInterval = function (fn, timeout) {
                server.longestTimeout = Math.max(
                    timeout,
                    server.longestTimeout || 0,
                );

                return clockSetInterval.apply(this, arguments);
            };
        }
    }

    return fakeServer.addRequest.call(this, xhr);
};

/**
 * Responds to queued requests and advances the fake clock to flush timers.
 * @returns {void}
 */
fakeServerWithClock.respond = function respond() {
    var returnVal = fakeServer.respond.apply(this, arguments);

    if (this.clock) {
        this.clock.tick(this.longestTimeout || 0);
        this.longestTimeout = 0;

        if (this.resetClock) {
            this.clock.uninstall();
            this.resetClock = false;
        }
    }

    return returnVal;
};

/**
 * Restores the server and uninstalls any fake clock created for it.
 * @returns {void}
 */
fakeServerWithClock.restore = function restore() {
    if (this.clock) {
        this.clock.uninstall();
    }

    return fakeServer.restore.apply(this, arguments);
};

module.exports = fakeServerWithClock;
