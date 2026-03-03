"use strict";

// cache a reference to setTimeout, so that our reference won't be stubbed out
// when using fake timers and errors will still get logged
// https://github.com/cjohansen/Sinon.JS/issues/381
var realSetTimeout = setTimeout;

/**
 * Creates an error logger for asynchronous callbacks.
 * @param {object} [config] Logger configuration.
 * @param {function(string): void} [config.logger] Receives formatted error messages.
 * @param {boolean} [config.useImmediateExceptions] Throws in the current
 * execution frame when `true`.
 * @param {function(function(): void, number): (number|object)} [config.setTimeout] Timer function used for deferred
 * exceptions.
 * @returns {function(string, Error|object): void} Function that logs and rethrows callback errors.
 */
function configureLogger(config) {
    // eslint-disable-next-line no-param-reassign
    config = config || {};
    // Function which prints errors.
    if (!config.hasOwnProperty("logger")) {
        // eslint-disable-next-line no-empty-function
        config.logger = function () {};
    }
    // When set to true, any errors logged will be thrown immediately;
    // If set to false, the errors will be thrown in separate execution frame.
    if (!config.hasOwnProperty("useImmediateExceptions")) {
        config.useImmediateExceptions = true;
    }
    // wrap realSetTimeout with something we can stub in tests
    if (!config.hasOwnProperty("setTimeout")) {
        config.setTimeout = realSetTimeout;
    }

    return function logError(label, e) {
        var msg = `${label} threw exception: `;
        var err = {
            name: e.name || label,
            message: e.message || e.toString(),
            stack: e.stack,
        };

        /** Throws the normalized error after the logger has been called. */
        function throwLoggedError() {
            err.message = msg + err.message;
            throw err;
        }

        config.logger(`${msg}[${err.name}] ${err.message}`);

        if (err.stack) {
            config.logger(err.stack);
        }

        if (config.useImmediateExceptions) {
            throwLoggedError();
        } else {
            config.setTimeout(throwLoggedError, 0);
        }
    };
}

module.exports = configureLogger;
