"use strict";

var globalObject = require("@sinonjs/commons").global;

exports.isSupported = (function () {
    try {
        return (
            typeof globalObject.Blob !== "undefined" &&
            Boolean(new globalObject.Blob())
        );
    } catch (e) {
        return false;
    }
})();
