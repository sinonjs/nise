"use strict";

var globalObject = require("@sinonjs/commons").global;
var configureLogError = require("../configure-logger");
var sinonEvent = require("../event");
var extend = require("just-extend");

var supportsProgress = typeof ProgressEvent !== "undefined";
var supportsCustomEvent = typeof CustomEvent !== "undefined";
var supportsArrayBuffer = typeof ArrayBuffer !== "undefined";
var supportsBlob = require("./blob").isSupported;

/** @returns {typeof Blob|undefined} Blob constructor for the current global scope */
function getBlobConstructor() {
    return supportsBlob ? globalObject.Blob : undefined;
}

/** @returns {typeof FormData|undefined} FormData constructor for the current global scope */
function getFormDataConstructor() {
    return globalObject.FormData;
}

/**
 * Resolve the native XHR constructor available in a given global scope.
 * @param {object} globalScope
 * @returns {typeof XMLHttpRequest|function(): XMLHttpRequest|false}
 */
function getWorkingXHR(globalScope) {
    var supportsXHR = typeof globalScope.XMLHttpRequest !== "undefined";
    if (supportsXHR) {
        return globalScope.XMLHttpRequest;
    }

    var supportsActiveX = typeof globalScope.ActiveXObject !== "undefined";
    if (supportsActiveX) {
        return function () {
            return new globalScope.ActiveXObject("MSXML2.XMLHTTP.3.0");
        };
    }

    return false;
}

// Ref: https://fetch.spec.whatwg.org/#forbidden-header-name
var unsafeHeaders = {
    "Accept-Charset": true,
    "Access-Control-Request-Headers": true,
    "Access-Control-Request-Method": true,
    "Accept-Encoding": true,
    Connection: true,
    "Content-Length": true,
    Cookie: true,
    Cookie2: true,
    "Content-Transfer-Encoding": true,
    Date: true,
    DNT: true,
    Expect: true,
    Host: true,
    "Keep-Alive": true,
    Origin: true,
    Referer: true,
    TE: true,
    Trailer: true,
    "Transfer-Encoding": true,
    Upgrade: true,
    "User-Agent": true,
    Via: true,
};

/**
 * Minimal event target wrapper used for FakeXMLHttpRequest and its upload target.
 * @class
 */
function EventTargetHandler() {
    var self = this;
    var events = [
        "loadstart",
        "progress",
        "abort",
        "error",
        "load",
        "timeout",
        "loadend",
    ];

    /**
     * Relay DOM-style `on*` handlers through the EventTarget listener API.
     * @param {string} eventName
     * @returns {void}
     */
    function addEventListener(eventName) {
        self.addEventListener(eventName, function (event) {
            var listener = self[`on${eventName}`];

            if (listener && typeof listener === "function") {
                listener.call(this, event);
            }
        });
    }

    events.forEach(addEventListener);
}

EventTargetHandler.prototype = sinonEvent.EventTarget;

/**
 * Trim HTTP whitespace bytes from a header value.
 * @param {string} value
 * @returns {string}
 */
function normalizeHeaderValue(value) {
    // Ref: https://fetch.spec.whatwg.org/#http-whitespace-bytes
    /*eslint no-control-regex: "off"*/
    return value.replace(/^[\x09\x0A\x0D\x20]+|[\x09\x0A\x0D\x20]+$/g, "");
}

/**
 * Find a header name using case-insensitive matching.
 * @param {object} headers
 * @param {string} header
 * @returns {string|null}
 */
function getHeader(headers, header) {
    var foundHeader = Object.keys(headers).filter(function (h) {
        return h.toLowerCase() === header.toLowerCase();
    });

    return foundHeader[0] || null;
}

/**
 * Exclude Set-Cookie headers from the aggregated response header string.
 * @param {string} header
 * @returns {boolean}
 */
function excludeSetCookie2Header(header) {
    return !/^Set-Cookie2?$/i.test(header);
}

/**
 * Ensure a mocked response body is compatible with the requested responseType.
 * @param {unknown} body
 * @param {string} responseType
 * @returns {void}
 * @throws {Error} If the body cannot be represented as the requested response type.
 */
function verifyResponseBodyType(body, responseType) {
    var error = null;
    var isString = typeof body === "string";
    var BlobConstructor = getBlobConstructor();

    if (responseType === "arraybuffer") {
        if (!isString && !(body instanceof ArrayBuffer)) {
            error = new Error(
                `Attempted to respond to fake XMLHttpRequest with ${body}, which is not a string or ArrayBuffer.`,
            );
            error.name = "InvalidBodyException";
        }
    } else if (responseType === "blob") {
        if (
            !isString &&
            !(body instanceof ArrayBuffer) &&
            BlobConstructor &&
            !(body instanceof BlobConstructor)
        ) {
            error = new Error(
                `Attempted to respond to fake XMLHttpRequest with ${body}, which is not a string, ArrayBuffer, or Blob.`,
            );
            error.name = "InvalidBodyException";
        }
    } else if (!isString) {
        error = new Error(
            `Attempted to respond to fake XMLHttpRequest with ${body}, which is not a string.`,
        );
        error.name = "InvalidBodyException";
    }

    if (error) {
        throw error;
    }
}

/**
 * Encode a JavaScript string as a UTF-8 ArrayBuffer.
 * @param {string} input
 * @returns {ArrayBuffer}
 */
function stringToUtf8ArrayBuffer(input) {
    /*eslint no-bitwise: "off"*/
    var bytes = [];

    for (var i = 0; i < input.length; i++) {
        var codePoint = input.charCodeAt(i);

        if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
            var nextCodePoint = input.charCodeAt(i + 1);

            if (nextCodePoint >= 0xdc00 && nextCodePoint <= 0xdfff) {
                codePoint =
                    ((codePoint - 0xd800) << 10) +
                    (nextCodePoint - 0xdc00) +
                    0x10000;
                i += 1;
            } else {
                codePoint = 0xfffd;
            }
        } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
            codePoint = 0xfffd;
        }

        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
            bytes.push(
                0xe0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f),
            );
        } else {
            bytes.push(
                0xf0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3f),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f),
            );
        }
    }

    return new Uint8Array(bytes).buffer;
}

/**
 * Normalize string responses into an ArrayBuffer when required by responseType.
 * @param {string|ArrayBuffer} body
 * @returns {ArrayBuffer}
 */
function convertToArrayBuffer(body) {
    if (body instanceof ArrayBuffer) {
        return body;
    }

    return stringToUtf8ArrayBuffer(body);
}

/**
 * Check whether a content type should be treated as XML.
 * @param {string|null|undefined} contentType
 * @returns {boolean}
 */
function isXmlContentType(contentType) {
    return (
        !contentType ||
        /(text\/xml)|(application\/xml)|(\+xml)/.test(contentType)
    );
}

/**
 * @param {string} contentType
 * @returns {boolean}
 */
function isHtmlContentType(contentType) {
    return /text\/html/i.test(contentType || "");
}

/**
 * Reset the response fields exposed on a fake XHR instance.
 * @param {object} xhr
 * @returns {void}
 */
function clearResponse(xhr) {
    if (xhr.responseType === "" || xhr.responseType === "text") {
        xhr.response = xhr.responseText = "";
    } else {
        xhr.response = xhr.responseText = null;
    }
    xhr.responseXML = null;
}

/**
 * @param {string} text
 * @returns {Document|null}
 */
function parseHTML(text) {
    if (text === "" || typeof DOMParser === "undefined") {
        return null;
    }

    return new DOMParser().parseFromString(text, "text/html");
}

/**
 * @typedef {object} FakeXMLHttpRequestApi
 * @property {object} xhr Native XHR references captured from the provided global scope.
 * @property {typeof FakeXMLHttpRequest} FakeXMLHttpRequest Fake XHR constructor bound to the provided global.
 * @property {typeof useFakeXMLHttpRequest} useFakeXMLHttpRequest Installer for the fake XHR globals.
 */

/**
 * Create the fake XHR API bound to a specific global object.
 * @param {object} globalScope
 * @returns {FakeXMLHttpRequestApi}
 */
function fakeXMLHttpRequestFor(globalScope) {
    var isReactNative =
        globalScope.navigator &&
        globalScope.navigator.product === "ReactNative";
    var sinonXhr = { XMLHttpRequest: globalScope.XMLHttpRequest };
    sinonXhr.GlobalXMLHttpRequest = globalScope.XMLHttpRequest;
    sinonXhr.GlobalActiveXObject = globalScope.ActiveXObject;
    sinonXhr.supportsActiveX =
        typeof sinonXhr.GlobalActiveXObject !== "undefined";
    sinonXhr.supportsXHR = typeof sinonXhr.GlobalXMLHttpRequest !== "undefined";
    sinonXhr.workingXHR = getWorkingXHR(globalScope);
    sinonXhr.supportsTimeout =
        sinonXhr.supportsXHR &&
        "timeout" in new sinonXhr.GlobalXMLHttpRequest();
    sinonXhr.supportsCORS =
        isReactNative ||
        (sinonXhr.supportsXHR &&
            "withCredentials" in new sinonXhr.GlobalXMLHttpRequest());

    // Note that for FakeXMLHttpRequest to work pre ES5
    // we lose some of the alignment with the spec.
    // To ensure as close a match as possible,
    // set responseType before calling open, send or respond;
    /**
     * Fake `XMLHttpRequest` implementation used by Sinon servers and stubs.
     * @class
     * @param {object} [config] Logger configuration forwarded to `configureLogError`.
     */
    function FakeXMLHttpRequest(config) {
        EventTargetHandler.call(this);
        this.readyState = FakeXMLHttpRequest.UNSENT;
        this.requestHeaders = {};
        this.requestBody = null;
        this.status = 0;
        this.statusText = "";
        this.upload = new EventTargetHandler();
        this.responseType = "";
        this.response = "";
        this.logError = configureLogError(config);

        if (sinonXhr.supportsTimeout) {
            this.timeout = 0;
        }

        if (sinonXhr.supportsCORS) {
            this.withCredentials = false;
        }

        if (typeof FakeXMLHttpRequest.onCreate === "function") {
            FakeXMLHttpRequest.onCreate(this);
        }
    }

    /**
     * Ensure the request is open and not already sending before mutating it.
     * @param {FakeXMLHttpRequest} xhr
     * @returns {void}
     * @throws {Error} If the fake request is not in the OPENED state.
     */
    function verifyState(xhr) {
        if (xhr.readyState !== FakeXMLHttpRequest.OPENED) {
            throw new Error("INVALID_STATE_ERR");
        }

        if (xhr.sendFlag) {
            throw new Error("INVALID_STATE_ERR");
        }
    }

    // largest arity in XHR is 5 - XHR#open
    var apply = function (obj, method, args) {
        switch (args.length) {
            case 0:
                return obj[method]();
            case 1:
                return obj[method](args[0]);
            case 2:
                return obj[method](args[0], args[1]);
            case 3:
                return obj[method](args[0], args[1], args[2]);
            case 4:
                return obj[method](args[0], args[1], args[2], args[3]);
            case 5:
                return obj[method](args[0], args[1], args[2], args[3], args[4]);
            default:
                throw new Error("Unhandled case");
        }
    };

    FakeXMLHttpRequest.filters = [];
    /**
     * Register a predicate that decides whether a request should fall back to the native XHR.
     * @param {function(...unknown): boolean} fn
     * @returns {void}
     */
    FakeXMLHttpRequest.addFilter = function addFilter(fn) {
        this.filters.push(fn);
    };

    /**
     * Replace fake request methods with the native XHR implementation for one request.
     * @param {object} fakeXhr
     * @param {object} xhrArgs
     * @returns {void}
     */
    /**
     * Keep writable request-side properties in sync before delegating send().
     * @param {object} fakeXhr
     * @param {XMLHttpRequest} xhr
     */
    function syncRequestProperties(fakeXhr, xhr) {
        var properties = ["responseType"];
        var isSynchronousRequest =
            fakeXhr.async === false || xhr.async === false;

        if (!isSynchronousRequest) {
            properties.push("withCredentials", "timeout");
        }

        properties.forEach(function (property) {
            if (xhr[property] !== fakeXhr[property]) {
                xhr[property] = fakeXhr[property];
            }
        });
    }
    FakeXMLHttpRequest.defake = function defake(fakeXhr, xhrArgs) {
        var xhr = new sinonXhr.workingXHR(); // eslint-disable-line new-cap

        [
            "open",
            "setRequestHeader",
            "abort",
            "getResponseHeader",
            "getAllResponseHeaders",
            "addEventListener",
            "overrideMimeType",
            "removeEventListener",
        ].forEach(function (method) {
            fakeXhr[method] = function () {
                return apply(xhr, method, arguments);
            };
        });

        fakeXhr.send = function () {
            syncRequestProperties(fakeXhr, xhr);
            return apply(xhr, "send", arguments);
        };

        var copyAttrs = function (args) {
            args.forEach(function (attr) {
                fakeXhr[attr] = xhr[attr];
            });
        };

        var stateChangeStart = function () {
            fakeXhr.readyState = xhr.readyState;
            if (xhr.readyState >= FakeXMLHttpRequest.HEADERS_RECEIVED) {
                copyAttrs(["status", "statusText"]);
            }
            if (xhr.readyState >= FakeXMLHttpRequest.LOADING) {
                copyAttrs(["response"]);
                if (xhr.responseType === "" || xhr.responseType === "text") {
                    copyAttrs(["responseText"]);
                }
            }
            if (
                xhr.readyState === FakeXMLHttpRequest.DONE &&
                (xhr.responseType === "" || xhr.responseType === "document")
            ) {
                copyAttrs(["responseXML"]);
            }
        };

        var stateChangeEnd = function () {
            if (fakeXhr.onreadystatechange) {
                // eslint-disable-next-line no-useless-call
                fakeXhr.onreadystatechange.call(fakeXhr, {
                    target: fakeXhr,
                    currentTarget: fakeXhr,
                });
            }
        };

        var stateChange = function stateChange() {
            stateChangeStart();
            stateChangeEnd();
        };

        if (xhr.addEventListener) {
            xhr.addEventListener("readystatechange", stateChangeStart);

            Object.keys(fakeXhr.eventListeners).forEach(function (event) {
                /*eslint-disable no-loop-func*/
                fakeXhr.eventListeners[event].forEach(function (handler) {
                    xhr.addEventListener(event, handler.listener, {
                        capture: handler.capture,
                        once: handler.once,
                    });
                });
                /*eslint-enable no-loop-func*/
            });

            xhr.addEventListener("readystatechange", stateChangeEnd);
        } else {
            xhr.onreadystatechange = stateChange;
        }
        apply(xhr, "open", xhrArgs);
    };
    FakeXMLHttpRequest.useFilters = false;

    /**
     * Ensure status and response headers are only set after `open`.
     * @param {FakeXMLHttpRequest} xhr
     * @returns {void}
     * @throws {Error} If the request has not been opened.
     */
    function verifyRequestOpened(xhr) {
        if (xhr.readyState !== FakeXMLHttpRequest.OPENED) {
            const errorMessage =
                xhr.readyState === FakeXMLHttpRequest.UNSENT
                    ? "INVALID_STATE_ERR - you might be trying to set the request state for a request that has already been aborted, it is recommended to check 'readyState' first..."
                    : `INVALID_STATE_ERR - ${xhr.readyState}`;
            throw new Error(errorMessage);
        }
    }

    /**
     * Ensure a response body is not written after the request has completed.
     * @param {FakeXMLHttpRequest} xhr
     * @returns {void}
     * @throws {Error} If the request is already done.
     */
    function verifyRequestSent(xhr) {
        if (xhr.readyState === FakeXMLHttpRequest.DONE) {
            throw new Error("Request done");
        }
    }

    /**
     * Ensure headers are available before a response body is written asynchronously.
     * @param {FakeXMLHttpRequest} xhr
     * @returns {void}
     * @throws {Error} If response headers have not been received yet.
     */
    function verifyHeadersReceived(xhr) {
        if (
            xhr.async &&
            xhr.readyState !== FakeXMLHttpRequest.HEADERS_RECEIVED
        ) {
            throw new Error("No headers received");
        }
    }

    /**
     * Convert a mocked response body to the representation requested by `responseType`.
     * @param {string} responseType
     * @param {string|null|undefined} contentType
     * @param {string|ArrayBuffer|Blob} body
     * @returns {string|ArrayBuffer|Blob|Document|object|null}
     */
    function convertResponseBody(responseType, contentType, body) {
        var BlobConstructor = getBlobConstructor();

        if (responseType === "" || responseType === "text") {
            return body;
        } else if (supportsArrayBuffer && responseType === "arraybuffer") {
            return convertToArrayBuffer(body);
        } else if (responseType === "json") {
            try {
                return JSON.parse(body);
            } catch (e) {
                // Return parsing failure as null
                return null;
            }
        } else if (BlobConstructor && responseType === "blob") {
            if (body instanceof BlobConstructor) {
                return body;
            }

            var blobOptions = {};
            if (contentType) {
                blobOptions.type = contentType;
            }
            return new BlobConstructor(
                [convertToArrayBuffer(body)],
                blobOptions,
            );
        } else if (responseType === "document") {
            if (isXmlContentType(contentType)) {
                return FakeXMLHttpRequest.parseXML(body);
            }
            if (isHtmlContentType(contentType)) {
                return parseHTML(body);
            }
            return null;
        }
        throw new Error(`Invalid responseType ${responseType}`);
    }

    /**
     * Steps to follow when there is an error, according to:
     * https://xhr.spec.whatwg.org/#request-error-steps
     * @param {FakeXMLHttpRequest} xhr
     * @returns {void}
     */
    function requestErrorSteps(xhr) {
        clearResponse(xhr);
        xhr.errorFlag = true;
        xhr.requestHeaders = {};
        xhr.responseHeaders = {};

        if (
            xhr.readyState !== FakeXMLHttpRequest.UNSENT &&
            xhr.sendFlag &&
            xhr.readyState !== FakeXMLHttpRequest.DONE
        ) {
            xhr.readyStateChange(FakeXMLHttpRequest.DONE);
            xhr.sendFlag = false;
        }
    }

    /**
     * Parse a response body as XML, returning null when parsing fails.
     * @param {string} text
     * @returns {Document|null}
     */
    FakeXMLHttpRequest.parseXML = function parseXML(text) {
        // Treat empty string as parsing failure
        if (text !== "") {
            try {
                if (typeof DOMParser !== "undefined") {
                    var parser = new DOMParser();
                    var parsererrorNS = "";

                    try {
                        var parsererrors = parser
                            .parseFromString("INVALID", "text/xml")
                            .getElementsByTagName("parsererror");
                        if (parsererrors.length) {
                            parsererrorNS = parsererrors[0].namespaceURI;
                        }
                    } catch (e) {
                        // passing invalid XML makes IE11 throw
                        // so no namespace needs to be determined
                    }

                    var result;
                    try {
                        result = parser.parseFromString(text, "text/xml");
                    } catch (err) {
                        return null;
                    }

                    return result.getElementsByTagNameNS(
                        parsererrorNS,
                        "parsererror",
                    ).length
                        ? null
                        : result;
                }
                var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
                xmlDoc.async = "false";
                xmlDoc.loadXML(text);
                return xmlDoc.parseError.errorCode !== 0 ? null : xmlDoc;
            } catch (e) {
                // Unable to parse XML - no biggie
            }
        }

        return null;
    };

    FakeXMLHttpRequest.statusCodes = {
        100: "Continue",
        101: "Switching Protocols",
        200: "OK",
        201: "Created",
        202: "Accepted",
        203: "Non-Authoritative Information",
        204: "No Content",
        205: "Reset Content",
        206: "Partial Content",
        207: "Multi-Status",
        300: "Multiple Choice",
        301: "Moved Permanently",
        302: "Found",
        303: "See Other",
        304: "Not Modified",
        305: "Use Proxy",
        307: "Temporary Redirect",
        400: "Bad Request",
        401: "Unauthorized",
        402: "Payment Required",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        406: "Not Acceptable",
        407: "Proxy Authentication Required",
        408: "Request Timeout",
        409: "Conflict",
        410: "Gone",
        411: "Length Required",
        412: "Precondition Failed",
        413: "Request Entity Too Large",
        414: "Request-URI Too Long",
        415: "Unsupported Media Type",
        416: "Requested Range Not Satisfiable",
        417: "Expectation Failed",
        422: "Unprocessable Entity",
        500: "Internal Server Error",
        501: "Not Implemented",
        502: "Bad Gateway",
        503: "Service Unavailable",
        504: "Gateway Timeout",
        505: "HTTP Version Not Supported",
    };

    extend(FakeXMLHttpRequest.prototype, sinonEvent.EventTarget, {
        async: true,

        /**
         * Initialize the fake request and transition it to OPENED.
         * @param {string} method
         * @param {string} url
         * @param {boolean} [async]
         * @param {string} [username]
         * @param {string} [password]
         * @returns {void}
         */
        open: function open(method, url, async, username, password) {
            this.method = method;
            this.url = url;
            this.async = typeof async === "boolean" ? async : true;
            this.username = username;
            this.password = password;
            clearResponse(this);
            this.requestHeaders = {};
            this.sendFlag = false;

            if (FakeXMLHttpRequest.useFilters === true) {
                var xhrArgs = arguments;
                var defake = FakeXMLHttpRequest.filters.some(function (filter) {
                    return filter.apply(this, xhrArgs);
                });
                if (defake) {
                    FakeXMLHttpRequest.defake(this, arguments);
                    return;
                }
            }
            this.readyStateChange(FakeXMLHttpRequest.OPENED);
        },

        /**
         * Update `readyState` and dispatch the matching XHR events.
         * @param {number} state
         * @returns {void}
         */
        readyStateChange: function readyStateChange(state) {
            this.readyState = state;

            var readyStateChangeEvent = new sinonEvent.Event(
                "readystatechange",
                false,
                false,
                this,
            );
            if (typeof this.onreadystatechange === "function") {
                try {
                    this.onreadystatechange(readyStateChangeEvent);
                } catch (e) {
                    this.logError("Fake XHR onreadystatechange handler", e);
                }
            }

            if (this.readyState !== FakeXMLHttpRequest.DONE) {
                this.dispatchEvent(readyStateChangeEvent);
            } else {
                var event, progress;

                if (this.timedOut || this.aborted || this.status === 0) {
                    progress = { loaded: 0, total: 0 };
                    event =
                        (this.timedOut && "timeout") ||
                        (this.aborted && "abort") ||
                        "error";
                } else {
                    progress = { loaded: 100, total: 100 };
                    event = "load";
                }

                if (supportsProgress) {
                    this.upload.dispatchEvent(
                        new sinonEvent.ProgressEvent(
                            "progress",
                            progress,
                            this,
                        ),
                    );
                    this.upload.dispatchEvent(
                        new sinonEvent.ProgressEvent(event, progress, this),
                    );
                    this.upload.dispatchEvent(
                        new sinonEvent.ProgressEvent("loadend", progress, this),
                    );
                }

                this.dispatchEvent(
                    new sinonEvent.ProgressEvent("progress", progress, this),
                );
                this.dispatchEvent(
                    new sinonEvent.ProgressEvent(event, progress, this),
                );
                this.dispatchEvent(readyStateChangeEvent);
                this.dispatchEvent(
                    new sinonEvent.ProgressEvent("loadend", progress, this),
                );
            }
        },

        // Ref https://xhr.spec.whatwg.org/#the-setrequestheader()-method
        /**
         * Add or merge a request header unless it is forbidden by the XHR spec.
         * @param {string} header
         * @param {string} value
         * @returns {void}
         */
        setRequestHeader: function setRequestHeader(header, value) {
            if (typeof value !== "string") {
                throw new TypeError(
                    `By RFC7230, section 3.2.4, header values should be strings. Got ${typeof value}`,
                );
            }
            verifyState(this);

            var checkUnsafeHeaders = true;
            if (typeof this.unsafeHeadersEnabled === "function") {
                checkUnsafeHeaders = this.unsafeHeadersEnabled();
            }

            if (
                checkUnsafeHeaders &&
                (getHeader(unsafeHeaders, header) !== null ||
                    /^(Sec-|Proxy-)/i.test(header))
            ) {
                return;
            }

            // eslint-disable-next-line no-param-reassign
            value = normalizeHeaderValue(value);

            var existingHeader = getHeader(this.requestHeaders, header);
            if (existingHeader) {
                this.requestHeaders[existingHeader] += `, ${value}`;
            } else {
                this.requestHeaders[header] = value;
            }
        },

        /**
         * Set the HTTP status code used by `respond`.
         * @param {number} status
         * @returns {void}
         */
        setStatus: function setStatus(status) {
            var sanitizedStatus = typeof status === "number" ? status : 200;

            verifyRequestOpened(this);
            this.status = sanitizedStatus;
            this.statusText = FakeXMLHttpRequest.statusCodes[sanitizedStatus];
        },

        // Helps testing
        /**
         * Store response headers and move the request to HEADERS_RECEIVED.
         * @param {object} headers
         * @returns {void}
         */
        setResponseHeaders: function setResponseHeaders(headers) {
            verifyRequestOpened(this);

            var responseHeaders = (this.responseHeaders = {});

            Object.keys(headers).forEach(function (header) {
                responseHeaders[header] = headers[header];
            });

            if (this.async) {
                this.readyStateChange(FakeXMLHttpRequest.HEADERS_RECEIVED);
            } else {
                this.readyState = FakeXMLHttpRequest.HEADERS_RECEIVED;
            }
        },

        // Currently treats ALL data as a DOMString (i.e. no Document)
        /**
         * Send the fake request and normalize default request headers.
         * @param {string|ArrayBuffer|Blob|FormData|null|undefined} data
         * @returns {void}
         */
        send: function send(data) {
            verifyState(this);

            if (!/^(head)$/i.test(this.method)) {
                var contentType = getHeader(
                    this.requestHeaders,
                    "Content-Type",
                );
                var FormDataConstructor = getFormDataConstructor();
                if (this.requestHeaders[contentType]) {
                    var value = this.requestHeaders[contentType].split(";");
                    this.requestHeaders[contentType] =
                        `${value[0]};charset=utf-8`;
                } else if (
                    !(
                        FormDataConstructor &&
                        data instanceof FormDataConstructor
                    )
                ) {
                    this.requestHeaders["Content-Type"] =
                        "text/plain;charset=utf-8";
                }

                this.requestBody = data;
            }

            this.errorFlag = false;
            this.sendFlag = this.async;
            clearResponse(this);

            if (typeof this.onSend === "function") {
                this.onSend(this);
            }

            // Only listen if setInterval and Date are a stubbed.
            if (
                sinonXhr.supportsTimeout &&
                typeof setInterval.clock === "object" &&
                typeof Date.clock === "object"
            ) {
                var initiatedTime = Date.now();
                var self = this;

                // Listen to any possible tick by fake timers and check to see if timeout has
                // been exceeded. It's important to note that timeout can be changed while a request
                // is in flight, so we must check anytime the end user forces a clock tick to make
                // sure timeout hasn't changed.
                // https://xhr.spec.whatwg.org/#dfnReturnLink-2
                var clearIntervalId = setInterval(function () {
                    // Check if the readyState has been reset or is done. If this is the case, there
                    // should be no timeout. This will also prevent aborted requests and
                    // fakeServerWithClock from triggering unnecessary responses.
                    if (
                        self.readyState === FakeXMLHttpRequest.UNSENT ||
                        self.readyState === FakeXMLHttpRequest.DONE
                    ) {
                        clearInterval(clearIntervalId);
                    } else if (
                        typeof self.timeout === "number" &&
                        self.timeout > 0
                    ) {
                        if (Date.now() >= initiatedTime + self.timeout) {
                            self.triggerTimeout();
                            clearInterval(clearIntervalId);
                        }
                    }
                }, 1);
            }

            this.dispatchEvent(
                new sinonEvent.Event("loadstart", false, false, this),
            );
        },

        abort: function abort() {
            this.aborted = true;
            requestErrorSteps(this);
            this.readyState = FakeXMLHttpRequest.UNSENT;
        },

        error: function () {
            clearResponse(this);
            this.errorFlag = true;
            this.requestHeaders = {};
            this.responseHeaders = {};

            this.readyStateChange(FakeXMLHttpRequest.DONE);
        },

        triggerTimeout: function triggerTimeout() {
            if (sinonXhr.supportsTimeout) {
                this.timedOut = true;
                requestErrorSteps(this);
            }
        },

        getResponseHeader: function getResponseHeader(header) {
            if (this.readyState < FakeXMLHttpRequest.HEADERS_RECEIVED) {
                return null;
            }

            if (/^Set-Cookie2?$/i.test(header)) {
                return null;
            }

            // eslint-disable-next-line no-param-reassign
            header = getHeader(this.responseHeaders, header);

            return this.responseHeaders[header] || null;
        },

        getAllResponseHeaders: function getAllResponseHeaders() {
            if (this.readyState < FakeXMLHttpRequest.HEADERS_RECEIVED) {
                return "";
            }

            var responseHeaders = this.responseHeaders;
            var headers = Object.keys(responseHeaders)
                .filter(excludeSetCookie2Header)
                .reduce(function (prev, header) {
                    var value = responseHeaders[header];

                    return `${prev}${header}: ${value}\r\n`;
                }, "");

            return headers;
        },

        setResponseBody: function setResponseBody(body) {
            verifyRequestSent(this);
            verifyHeadersReceived(this);
            verifyResponseBodyType(body, this.responseType);
            var contentType =
                this.overriddenMimeType ||
                this.getResponseHeader("Content-Type");

            var isTextResponse =
                this.responseType === "" || this.responseType === "text";
            clearResponse(this);
            if (this.async) {
                var chunkSize = this.chunkSize || 10;
                var index = 0;

                do {
                    this.readyStateChange(FakeXMLHttpRequest.LOADING);

                    if (isTextResponse) {
                        this.responseText = this.response += body.substring(
                            index,
                            index + chunkSize,
                        );
                    }
                    index += chunkSize;
                } while (index < body.length);
            }

            this.response = convertResponseBody(
                this.responseType,
                contentType,
                body,
            );
            if (isTextResponse) {
                this.responseText = this.response;
            }

            if (this.responseType === "document") {
                this.responseXML = this.response;
            } else if (
                this.responseType === "" &&
                isXmlContentType(contentType)
            ) {
                this.responseXML = FakeXMLHttpRequest.parseXML(
                    this.responseText,
                );
            }
            this.readyStateChange(FakeXMLHttpRequest.DONE);
        },

        respond: function respond(status, headers, body) {
            this.responseURL = this.url;

            this.setStatus(status);
            this.setResponseHeaders(headers || {});
            this.setResponseBody(body || "");
        },

        uploadProgress: function uploadProgress(progressEventRaw) {
            if (supportsProgress) {
                this.upload.dispatchEvent(
                    new sinonEvent.ProgressEvent(
                        "progress",
                        progressEventRaw,
                        this.upload,
                    ),
                );
            }
        },

        downloadProgress: function downloadProgress(progressEventRaw) {
            if (supportsProgress) {
                this.dispatchEvent(
                    new sinonEvent.ProgressEvent(
                        "progress",
                        progressEventRaw,
                        this,
                    ),
                );
            }
        },

        uploadError: function uploadError(error) {
            if (supportsCustomEvent) {
                this.upload.dispatchEvent(
                    new sinonEvent.CustomEvent("error", { detail: error }),
                );
            }
        },

        overrideMimeType: function overrideMimeType(type) {
            if (this.readyState >= FakeXMLHttpRequest.LOADING) {
                throw new Error("INVALID_STATE_ERR");
            }
            this.overriddenMimeType = type;
        },
    });

    var states = {
        UNSENT: 0,
        OPENED: 1,
        HEADERS_RECEIVED: 2,
        LOADING: 3,
        DONE: 4,
    };

    extend(FakeXMLHttpRequest, states);
    extend(FakeXMLHttpRequest.prototype, states);

    /**
     * Install FakeXMLHttpRequest into the provided global scope.
     * @returns {typeof FakeXMLHttpRequest} The fake XMLHttpRequest constructor.
     */
    function useFakeXMLHttpRequest() {
        FakeXMLHttpRequest.restore = function restore(keepOnCreate) {
            if (sinonXhr.supportsXHR) {
                globalScope.XMLHttpRequest = sinonXhr.GlobalXMLHttpRequest;
            }

            if (sinonXhr.supportsActiveX) {
                globalScope.ActiveXObject = sinonXhr.GlobalActiveXObject;
            }

            delete FakeXMLHttpRequest.restore;

            if (keepOnCreate !== true) {
                delete FakeXMLHttpRequest.onCreate;
            }
        };
        if (sinonXhr.supportsXHR) {
            globalScope.XMLHttpRequest = FakeXMLHttpRequest;
        }

        if (sinonXhr.supportsActiveX) {
            globalScope.ActiveXObject = function ActiveXObject(objId) {
                if (
                    objId === "Microsoft.XMLHTTP" ||
                    /^Msxml2\.XMLHTTP/i.test(objId)
                ) {
                    return new FakeXMLHttpRequest();
                }

                return new sinonXhr.GlobalActiveXObject(objId);
            };
        }

        return FakeXMLHttpRequest;
    }

    return {
        xhr: sinonXhr,
        FakeXMLHttpRequest: FakeXMLHttpRequest,
        useFakeXMLHttpRequest: useFakeXMLHttpRequest,
    };
}

module.exports = extend(fakeXMLHttpRequestFor(globalObject), {
    fakeXMLHttpRequestFor: fakeXMLHttpRequestFor,
});
