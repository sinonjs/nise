"use strict";

var fakeServer = require("./fake-server");
var fakeServerWithClock = require("./fake-server/fake-server-with-clock");
var fakeXhr = require("./fake-xhr");

module.exports = {
    fakeServer: fakeServer,
    fakeServerWithClock: fakeServerWithClock,
    fakeXhr: fakeXhr,
};
