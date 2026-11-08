"use strict";

var assert = require("@sinonjs/referee").assert;
var api = require("./index");

describe("api", function () {
    it("should export 'fake-server/' as fakeServer", function () {
        var expected = require("./fake-server");
        var actual = api.fakeServer;

        assert.equals(actual, expected);
    });

    it("should export 'fake-server/fake-server-with-clock' as fakeServerWithClock", function () {
        var expected = require("./fake-server/fake-server-with-clock");
        var actual = api.fakeServerWithClock;

        assert.equals(actual, expected);
    });

    it("should export 'fake-xhr/' as fakeXhr", function () {
        var expected = require("./fake-xhr");
        var actual = api.fakeXhr;

        assert.equals(actual, expected);
    });

    it("should provide all three named exports when imported as an ES module", function () {
        return import("./index.js").then(function (esm) {
            assert.equals(esm.fakeServer, require("./fake-server"));
            assert.equals(
                esm.fakeServerWithClock,
                require("./fake-server/fake-server-with-clock"),
            );
            assert.equals(esm.fakeXhr, require("./fake-xhr"));
        });
    });

    it("should configure package.json exports without invalid module entrypoint", function () {
        var pkg = require("../package.json");
        assert.isUndefined(pkg.module);
        assert.isObject(pkg.exports);
        assert.isObject(pkg.exports["."]);
    });
});
