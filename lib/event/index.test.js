"use strict";

var assert = require("@sinonjs/referee").assert;
var extend = require("just-extend");
var sinon = require("sinon");

var Event = require("./index").Event;
var EventTarget = require("./index").EventTarget;
var ProgressEvent = require("./index").ProgressEvent;
var CustomEvent = require("./index").CustomEvent;

describe("EventTarget", function() {
    beforeEach(function() {
        this.target = extend({}, EventTarget);
    });

    it("notifies event listener", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener);

        var event = new Event("dummy");
        this.target.dispatchEvent(event);

        assert(listener.calledOnce);
        assert(listener.calledWith(event));
    });

    it("notifies event listener with target as this", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener);

        var event = new Event("dummy");
        this.target.dispatchEvent(event);

        assert(listener.calledOn(this.target));
    });

    it("notifies all event listeners", function() {
        var listeners = [sinon.spy(), sinon.spy()];
        this.target.addEventListener("dummy", listeners[0]);
        this.target.addEventListener("dummy", listeners[1]);

        var event = new Event("dummy");
        this.target.dispatchEvent(event);

        assert(listeners[0].calledOnce);
        assert(listeners[0].calledOnce);
    });

    it("notifies event listener of type listener", function() {
        var listener = { handleEvent: sinon.spy() };
        this.target.addEventListener("dummy", listener);

        this.target.dispatchEvent(new Event("dummy"));

        assert(listener.handleEvent.calledOnce);
    });

    it("notifies event listener once if added twice without useCapture flag", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener);
        this.target.addEventListener("dummy", listener);

        var event = new Event("dummy");
        this.target.dispatchEvent(event);

        assert.equals(listener.callCount, 1, "listener only called once");
        assert(listener.calledWith(event));
    });

    it("notifies event listener twice if added with different capture flag values, ignores other flags", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener, { capture: false });
        this.target.addEventListener("dummy", listener, { capture: true });
        this.target.addEventListener("dummy", listener, {
            capture: true,
            once: true
        });
        this.target.addEventListener("dummy", listener, {
            capture: true,
            passive: true
        });

        var event = new Event("dummy");
        this.target.dispatchEvent(event);

        assert.equals(listener.callCount, 2, "listener only called twice");
        assert(listener.calledWith(event));
    });

    it("uses options of first listener registration", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener, {
            capture: false,
            once: false
        });
        // this registration should be ignored
        this.target.addEventListener("dummy", listener, {
            capture: false,
            once: true
        });

        var firstEvent = new Event("dummy");
        this.target.dispatchEvent(firstEvent);

        assert.equals(listener.callCount, 1, "listener only called once");
        assert(listener.lastCall.calledWith(sinon.match.same(firstEvent)));

        var secondEvent = new Event("dummy");
        this.target.dispatchEvent(secondEvent);

        assert.equals(listener.callCount, 2, "listener only called twice");
        assert(listener.lastCall.calledWith(sinon.match.same(secondEvent)));
    });

    it("feature detection for 'once' flag works", function() {
        var onceSupported = false;

        this.target.addEventListener(
            "dummy",
            null,
            Object.defineProperty({}, "once", {
                get: function() {
                    onceSupported = true;
                    return;
                }
            })
        );

        assert(onceSupported);
    });

    it("supports registering event handler with 'once' flag", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener, { once: true });

        var firstEvent = new Event("dummy");
        this.target.dispatchEvent(firstEvent);

        assert.equals(listener.callCount, 1, "listener only called once");
        assert(listener.calledWith(sinon.match.same(firstEvent)));

        var secondEvent = new Event("dummy");
        this.target.dispatchEvent(secondEvent);

        assert.equals(
            listener.callCount,
            1,
            "listener was not called second time"
        );
        assert(!listener.calledWith(sinon.match.same(secondEvent)));
    });

    it("supports re-registering event handler with 'once' flag after dispatch", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener, { once: true });

        var firstEvent = new Event("dummy");
        this.target.dispatchEvent(firstEvent);

        assert.equals(listener.callCount, 1, "listener only called once");
        assert(listener.calledWith(sinon.match.same(firstEvent)));

        var secondEvent = new Event("dummy");
        this.target.dispatchEvent(secondEvent);

        this.target.addEventListener("dummy", listener, { once: true });

        var thirdEvent = new Event("dummy");
        this.target.dispatchEvent(thirdEvent);

        assert.equals(
            listener.callCount,
            2,
            "listener called second time after re-registration"
        );
        assert(listener.calledWith(sinon.match.same(thirdEvent)));
    });

    it("does not notify listeners of other events", function() {
        var listeners = [sinon.spy(), sinon.spy()];
        this.target.addEventListener("dummy", listeners[0]);
        this.target.addEventListener("other", listeners[1]);

        this.target.dispatchEvent(new Event("dummy"));

        assert.isFalse(listeners[1].called);
    });

    it("does not notify unregistered listeners", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummy", listener);
        this.target.removeEventListener("dummy", listener);

        this.target.dispatchEvent(new Event("dummy"));

        assert.isFalse(listener.called);
    });

    it("notifies existing listeners after removing one", function() {
        var listeners = [sinon.spy(), sinon.spy(), sinon.spy()];
        this.target.addEventListener("dummy", listeners[0]);
        this.target.addEventListener("dummy", listeners[1]);
        this.target.addEventListener("dummy", listeners[2]);
        this.target.removeEventListener("dummy", listeners[1]);

        this.target.dispatchEvent(new Event("dummy"));

        assert(listeners[0].calledOnce);
        assert(listeners[2].calledOnce);
    });

    it("returns false when event.preventDefault is not called", function() {
        this.target.addEventListener("dummy", sinon.spy());

        var event = new Event("dummy");
        var result = this.target.dispatchEvent(event);

        assert.isFalse(result);
    });

    it("returns true when event.preventDefault is called", function() {
        this.target.addEventListener("dummy", function(e) {
            e.preventDefault();
        });

        var result = this.target.dispatchEvent(new Event("dummy"));

        assert.isTrue(result);
    });

    it("notifies ProgressEvent listener with progress data ", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummyProgress", listener);

        var progressEvent = new ProgressEvent("dummyProgress", {
            loaded: 50,
            total: 120
        });
        this.target.dispatchEvent(progressEvent);

        assert.isTrue(progressEvent.lengthComputable);
        assert(listener.calledOnce);
        assert(listener.calledWith(progressEvent));
    });

    it("notifies CustomEvent listener with custom data", function() {
        var listener = sinon.spy();
        this.target.addEventListener("dummyCustom", listener);

        var customEvent = new CustomEvent("dummyCustom", { detail: "hola" });
        this.target.dispatchEvent(customEvent);

        assert(listener.calledOnce);
        assert(listener.calledWith(customEvent));
    });
});
