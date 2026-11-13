"use strict";

var assert = require("assert");
var browserify = require("browserify");
var path = require("path");
var vm = require("vm");

describe("published bundle", function () {
    it("loads in a browser-like environment without process", function (done) {
        this.timeout(30000);

        var root = path.join(__dirname, "..");
        var bundler = browserify({
            entries: [path.join(root, "lib/index.js")],
            basedir: root,
            detectGlobals: false,
            standalone: "nise",
        });

        // Match the package bundle flags without writing the ignored nise.js file.
        bundler.exclude("timers");
        bundler.exclude("timers/promises");

        bundler.bundle(function (error, bundle) {
            if (error) {
                done(error);
                return;
            }

            var nextTimerId = 0;
            var context = vm.createContext({
                setTimeout: function () {
                    return ++nextTimerId;
                },
                clearTimeout: function () {
                    // Browser timer cleanup has no effect in this VM smoke test.
                },
                setInterval: function () {
                    return ++nextTimerId;
                },
                clearInterval: function () {
                    // Browser timer cleanup has no effect in this VM smoke test.
                },
            });
            context.self = context;
            context.window = context;

            try {
                vm.runInContext(bundle.toString(), context, { timeout: 5000 });

                assert.strictEqual(
                    vm.runInContext(
                        "self === globalThis && window === globalThis",
                        context,
                    ),
                    true,
                );
                assert.strictEqual(
                    vm.runInContext("typeof process", context),
                    "undefined",
                );
                assert.ok(context.nise);
                assert.ok(context.nise.fakeServer);
                assert.ok(context.nise.fakeServerWithClock);
                assert.ok(context.nise.fakeXhr);

                done();
            } catch (assertionError) {
                done(assertionError);
            }
        });
    });
});
