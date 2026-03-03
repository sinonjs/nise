"use strict";

var fakeXhr = require("../fake-xhr");
var push = [].push;
var log = require("./log");
var configureLogError = require("../configure-logger");
var pathToRegexp = require("path-to-regexp").pathToRegexp;

var supportsArrayBuffer = typeof ArrayBuffer !== "undefined";

/**
 * @typedef {[number, object, string|ArrayBuffer]} FakeServerResponse
 */

/**
 * @callback FakeServerResponder
 * @param {object} request Fake XMLHttpRequest instance.
 * @returns {FakeServerResponse|boolean}
 */

/**
 * Normalize shorthand response values into `[status, headers, body]`.
 * @param {string|ArrayBuffer|FakeServerResponse} handler Response shorthand or tuple.
 * @returns {FakeServerResponse}
 */
function responseArray(handler) {
    var response = handler;

    if (Object.prototype.toString.call(handler) !== "[object Array]") {
        response = [200, {}, handler];
    }

    if (typeof response[2] !== "string") {
        if (!supportsArrayBuffer) {
            throw new TypeError(
                `Fake server response body should be a string, but was ${typeof response[2]}`,
            );
        } else if (!(response[2] instanceof ArrayBuffer)) {
            throw new TypeError(
                `Fake server response body should be a string or ArrayBuffer, but was ${typeof response[2]}`,
            );
        }
    }

    return response;
}

/**
 * Return the fallback location used when no browser location is available.
 * @returns {{hostname: string, port: string | number, protocol: string, host: string}}
 */
function getDefaultWindowLocation() {
    var winloc = {
        hostname: "localhost",
        port: process.env.PORT || 80,
        protocol: "http:",
    };
    winloc.host =
        winloc.hostname +
        (String(winloc.port) === "80" ? "" : `:${winloc.port}`);
    return winloc;
}

/**
 * Resolve the active window location across supported environments.
 * @returns {{hostname: string, port: string | number, protocol: string, host: string}}
 */
function getWindowLocation() {
    if (typeof window === "undefined") {
        // Fallback
        return getDefaultWindowLocation();
    }

    if (typeof window.location !== "undefined") {
        // Browsers place location on window
        return window.location;
    }

    if (
        typeof window.window !== "undefined" &&
        typeof window.window.location !== "undefined"
    ) {
        // React Native on Android places location on window.window
        return window.window.location;
    }

    return getDefaultWindowLocation();
}

/**
 * Check whether a response definition matches a method/url pair.
 * @param {{method?: string, url?: string | RegExp | ((url: string) => boolean)}} response
 * Response definition.
 * @param {string} reqMethod Request method.
 * @param {string} reqUrl Request URL.
 * @returns {boolean}
 */
function matchOne(response, reqMethod, reqUrl) {
    var rmeth = response.method;
    var matchMethod = !rmeth || rmeth.toLowerCase() === reqMethod.toLowerCase();
    var url = response.url;
    var matchUrl =
        !url ||
        url === reqUrl ||
        (typeof url.test === "function" && url.test(reqUrl)) ||
        (typeof url === "function" && url(reqUrl) === true);

    return matchMethod && matchUrl;
}

/**
 * Resolve and optionally execute a matching response definition.
 * @this {typeof fakeServer}
 * @param {{method?: string, url?: string|RegExp|function(string): boolean|{exec?: function(string): Array<string>|null}, response?: FakeServerResponder}} response
 * Response definition.
 * @param {{url: string}} request Fake XHR request.
 * @returns {boolean|FakeServerResponse}
 */
function match(response, request) {
    var wloc = getWindowLocation();

    var rCurrLoc = new RegExp(`^${wloc.protocol}//${wloc.host}/`);

    var requestUrl = request.url;

    if (!/^https?:\/\//.test(requestUrl) || rCurrLoc.test(requestUrl)) {
        requestUrl = requestUrl.replace(rCurrLoc, "/");
    }

    if (matchOne(response, this.getHTTPMethod(request), requestUrl)) {
        if (typeof response.response === "function") {
            var ru = response.url;
            var args = [request].concat(
                ru && typeof ru.exec === "function"
                    ? ru.exec(requestUrl).slice(1)
                    : [],
            );
            return response.response.apply(response, args);
        }

        return true;
    }

    return false;
}

/**
 * Update request counters and convenience references on the server.
 * @this {typeof fakeServer}
 * @returns {void}
 */
function incrementRequestCount() {
    var count = ++this.requestCount;

    this.requested = true;

    this.requestedOnce = count === 1;
    this.requestedTwice = count === 2;
    this.requestedThrice = count === 3;

    this.firstRequest = this.getRequest(0);
    this.secondRequest = this.getRequest(1);
    this.thirdRequest = this.getRequest(2);

    this.lastRequest = this.getRequest(count - 1);
}

var fakeServer = {
    /**
     * Creates a fake server instance backed by fake XMLHttpRequest.
     * @param {object} [config] Server configuration.
     * @returns {object} Fake server instance.
     */
    create: function (config) {
        var server = Object.create(this);
        server.configure(config);
        this.xhr = fakeXhr.useFakeXMLHttpRequest();
        server.requests = [];
        server.requestCount = 0;
        server.queue = [];
        server.responses = [];

        this.xhr.onCreate = function (xhrObj) {
            xhrObj.unsafeHeadersEnabled = function () {
                return !(server.unsafeHeadersEnabled === false);
            };
            server.addRequest(xhrObj);
        };

        return server;
    },

    /**
     * Applies supported runtime options to the server instance.
     * @param {object} [config] Server configuration.
     * @returns {void}
     */
    configure: function (config) {
        var self = this;
        var allowlist = {
            autoRespond: true,
            autoRespondAfter: true,
            respondImmediately: true,
            fakeHTTPMethods: true,
            logger: true,
            unsafeHeadersEnabled: true,
        };

        // eslint-disable-next-line no-param-reassign
        config = config || {};

        Object.keys(config).forEach(function (setting) {
            if (setting in allowlist) {
                self[setting] = config[setting];
            }
        });

        self.logError = configureLogError(config);
    },

    /**
     * Registers a fake XHR instance so the server can observe and respond to it.
     * @param {object} xhrObj Fake XMLHttpRequest instance.
     * @returns {void}
     */
    addRequest: function addRequest(xhrObj) {
        var server = this;
        push.call(this.requests, xhrObj);

        incrementRequestCount.call(this);

        xhrObj.onSend = function () {
            server.handleRequest(this);

            if (server.respondImmediately) {
                server.respond();
            } else if (server.autoRespond && !server.responding) {
                setTimeout(function () {
                    server.responding = false;
                    server.respond();
                }, server.autoRespondAfter || 10);

                server.responding = true;
            }
        };
    },

    /**
     * Resolves the effective HTTP method for a request.
     * @param {object} request Request object created by fake XHR.
     * @returns {string} HTTP method used for route matching.
     */
    getHTTPMethod: function getHTTPMethod(request) {
        if (this.fakeHTTPMethods && /post/i.test(request.method)) {
            var matches = (request.requestBody || "").match(
                /_method=([^\b;]+)/,
            );
            return matches ? matches[1] : request.method;
        }

        return request.method;
    },

    /**
     * Queues or processes a request depending on whether it is asynchronous.
     * @param {object} xhr Fake XMLHttpRequest instance.
     * @returns {void}
     */
    handleRequest: function handleRequest(xhr) {
        if (xhr.async) {
            push.call(this.queue, xhr);
        } else {
            this.processRequest(xhr);
        }
    },

    logger: function () {
        // no-op; override via configure()
    },

    logError: configureLogError({}),

    log: log,

    /**
     * Adds a canned response definition to the server.
     * @param {string|FakeServerResponder|FakeServerResponse} [method] HTTP method, response body, or responder.
     * @param {string|RegExp|function(string): boolean|FakeServerResponse} [url] URL matcher or response payload.
     * @param {FakeServerResponse|FakeServerResponder|string|ArrayBuffer} [body] Response tuple or responder.
     * @returns {void}
     */
    respondWith: function respondWith(method, url, body) {
        if (arguments.length === 1 && typeof method !== "function") {
            this.response = responseArray(method);
            return;
        }

        if (arguments.length === 1) {
            // eslint-disable-next-line no-param-reassign
            body = method;
            // eslint-disable-next-line no-param-reassign
            url = method = null;
        }

        if (arguments.length === 2) {
            // eslint-disable-next-line no-param-reassign
            body = url;
            // eslint-disable-next-line no-param-reassign
            url = method;
            // eslint-disable-next-line no-param-reassign
            method = null;
        }

        // Escape port number to prevent "named" parameters in 'path-to-regexp' module
        if (typeof url === "string" && url !== "") {
            if (/:[0-9]+\//.test(url)) {
                var m = url.match(/^(https?:\/\/.*?):([0-9]+\/.*)$/);
                // eslint-disable-next-line no-param-reassign
                url = `${m[1]}\\:${m[2]}`;
            }
            if (/:\/\//.test(url)) {
                // eslint-disable-next-line no-param-reassign
                url = url.replace("://", "\\://");
            }
            if (/\*/.test(url)) {
                // Uses the new syntax for repeating parameters in path-to-regexp,
                // see https://github.com/pillarjs/path-to-regexp#unexpected--or-
                // eslint-disable-next-line no-param-reassign
                url = url.replace(/\/\*/g, "/*path");
            }
        }
        push.call(this.responses, {
            method: method,
            url:
                typeof url === "string" && url !== ""
                    ? pathToRegexp(url).regexp
                    : url,
            response: typeof body === "function" ? body : responseArray(body),
        });
    },

    /**
     * Responds to queued asynchronous requests.
     * @returns {void}
     */
    respond: function respond() {
        if (arguments.length > 0) {
            this.respondWith.apply(this, arguments);
        }

        var queue = this.queue || [];
        var requests = queue.splice(0, queue.length);
        var self = this;

        requests.forEach(function (request) {
            self.processRequest(request);
        });
    },

    /**
     * Responds to all recorded requests, including ones already seen synchronously.
     * @returns {void}
     */
    respondAll: function respondAll() {
        if (this.respondImmediately) {
            return;
        }

        this.queue = this.requests.slice(0);

        var request;
        while ((request = this.queue.shift())) {
            this.processRequest(request);
        }
    },

    /**
     * Resolves a matching fake response and applies it to a request.
     * @param {object} request Fake XMLHttpRequest instance.
     * @returns {void}
     */
    processRequest: function processRequest(request) {
        try {
            if (request.aborted) {
                return;
            }

            var response = this.response || [404, {}, ""];

            if (this.responses) {
                for (var l = this.responses.length, i = l - 1; i >= 0; i--) {
                    if (match.call(this, this.responses[i], request)) {
                        response = this.responses[i].response;
                        break;
                    }
                }
            }

            if (request.readyState !== 4) {
                this.log(response, request);

                request.respond(response[0], response[1], response[2]);
            }
        } catch (e) {
            this.logError("Fake server request processing", e);
        }
    },

    /**
     * Restores the original XMLHttpRequest implementation.
     * @returns {void}
     */
    restore: function restore() {
        return this.xhr.restore && this.xhr.restore.apply(this.xhr, arguments);
    },

    /**
     * Retrieves a request by index from the request history.
     * @param {number} index Request index.
     * @returns {object|null} Matching request or `null`.
     */
    getRequest: function getRequest(index) {
        return this.requests[index] || null;
    },

    /**
     * Clears both response definitions and request history.
     * @returns {void}
     */
    reset: function reset() {
        this.resetBehavior();
        this.resetHistory();
    },

    /**
     * Removes configured responses and queued requests.
     * @returns {void}
     */
    resetBehavior: function resetBehavior() {
        this.responses.length = this.queue.length = 0;
    },

    /**
     * Clears recorded requests and derived request state flags.
     * @returns {void}
     */
    resetHistory: function resetHistory() {
        this.requests.length = this.requestCount = 0;

        this.requestedOnce =
            this.requestedTwice =
            this.requestedThrice =
            this.requested =
                false;

        this.firstRequest =
            this.secondRequest =
            this.thirdRequest =
            this.lastRequest =
                null;
    },
};

module.exports = fakeServer;
