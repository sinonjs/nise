# Issue 194 HTML Document Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix `FakeXMLHttpRequest` so `responseType = "document"` supports `Content-Type: text/html` when a native `DOMParser` is present, while preserving the existing XML-only fallback behavior when no parser is available.

**Architecture:** Keep the change inside the fake XHR response-conversion path. XML content types should continue to use `FakeXMLHttpRequest.parseXML`, and `text/html` should take a separate native-parser branch that returns `null` if `DOMParser` is unavailable. Tests should exercise both the HTML success case and the no-parser null case without introducing new dependencies.

**Tech Stack:** Node.js, Mocha, jsdom, proxyquire, nise fake XHR implementation

---

### Task 1: Reproduce the missing HTML document behavior

**Files:**
- Modify: `lib/fake-xhr/index.test.js`
- Test: `lib/fake-xhr/index.test.js`

**Step 1: Add a focused failing test for HTML document responses**

Add a test near the existing `.response` or `.responseXML` coverage:

```js
it("parses HTML for responseType document when Content-Type is text/html", function () {
    this.xhr.responseType = "document";
    this.xhr.open("GET", "/");
    this.xhr.send();

    this.xhr.respond(
        200,
        { "Content-Type": "text/html" },
        "<!doctype html><html><body><main><h1>Hola!</h1></main></body></html>",
    );

    var doc = this.xhr.response;
    assert.equals(doc.documentElement.tagName, "HTML");
    assert.equals(doc.getElementsByTagName("h1")[0].textContent, "Hola!");
});
```

**Step 2: Run the focused test to verify it fails**

Run: `npm test -- --grep "parses HTML for responseType document when Content-Type is text/html"`
Expected: FAIL because the current `document` branch returns `null` for `text/html`.

**Step 3: Add a no-parser expectation test**

Add a second focused test:

```js
it("returns null for HTML document responses when DOMParser is unavailable", function () {
    this.xhr.responseType = "document";
    this.xhr.open("GET", "/");
    this.xhr.send();

    delete global.DOMParser;

    this.xhr.respond(
        200,
        { "Content-Type": "text/html" },
        "<!doctype html><html><body><h1>Hola!</h1></body></html>",
    );

    assert.isNull(this.xhr.response);
});
```

Restore `global.DOMParser` inside the test or in a `try/finally` block so later tests are unaffected.

**Step 4: Run the focused no-parser test**

Run: `npm test -- --grep "returns null for HTML document responses when DOMParser is unavailable"`
Expected: PASS after the test is written, because the current implementation already returns `null` for non-XML content.

**Step 5: Commit**

```bash
git add lib/fake-xhr/index.test.js
git commit -m "test: reproduce missing html document response support"
```

### Task 2: Implement native HTML document parsing

**Files:**
- Modify: `lib/fake-xhr/index.js`
- Test: `lib/fake-xhr/index.test.js`

**Step 1: Add a narrow content-type helper if it improves readability**

If needed, add a helper like:

```js
function isHtmlContentType(contentType) {
    return /text\/html/i.test(contentType || "");
}
```

Keep it specific to `text/html`. Do not broaden to all HTML-like MIME types unless the browser behavior is verified and intentionally in scope.

**Step 2: Add a native HTML parsing helper or inline branch**

Use one of these minimal shapes:

```js
function parseHTML(text) {
    if (text === "" || typeof DOMParser === "undefined") {
        return null;
    }

    return new DOMParser().parseFromString(text, "text/html");
}
```

or inline the same logic directly inside `convertResponseBody`.

**Step 3: Update `convertResponseBody` for `responseType === "document"`**

Change the existing branch from:

```js
} else if (responseType === "document") {
    if (isXmlContentType(contentType)) {
        return FakeXMLHttpRequest.parseXML(body);
    }
    return null;
}
```

to logic equivalent to:

```js
} else if (responseType === "document") {
    if (isXmlContentType(contentType)) {
        return FakeXMLHttpRequest.parseXML(body);
    }
    if (isHtmlContentType(contentType)) {
        return parseHTML(body);
    }
    return null;
}
```

Keep XML precedence unchanged.

**Step 4: Run the focused HTML tests**

Run: `npm test -- --grep "HTML document responses|responseType document when Content-Type is text/html"`
Expected: both focused HTML tests PASS.

**Step 5: Commit**

```bash
git add lib/fake-xhr/index.js lib/fake-xhr/index.test.js
git commit -m "fix: support html documents for fake xhr responseType"
```

### Task 3: Add regression coverage around existing document behavior

**Files:**
- Modify: `lib/fake-xhr/index.test.js`
- Test: `lib/fake-xhr/index.test.js`

**Step 1: Verify the new tests live with the existing document coverage**

Place the HTML tests near the current `.response` and `.responseXML` cases so future changes to document parsing are reviewed together.

**Step 2: Add one assertion that XML behavior is still routed to XML parsing**

If current coverage is not explicit enough for the `responseType = "document"` path, add:

```js
it("still parses XML for responseType document with application/xml", function () {
    this.xhr.responseType = "document";
    this.xhr.open("GET", "/");
    this.xhr.send();

    this.xhr.respond(
        200,
        { "Content-Type": "application/xml" },
        "<root><item>Hola!</item></root>",
    );

    assert.equals(
        this.xhr.response.getElementsByTagName("item")[0].textContent,
        "Hola!",
    );
});
```

Add this only if the existing tests do not already pin the `responseType = "document"` XML case tightly enough.

**Step 3: Run the document-focused subset**

Run: `npm test -- --grep "responseXML|responseType document"`
Expected: PASS

**Step 4: Commit**

```bash
git add lib/fake-xhr/index.test.js
git commit -m "test: cover fake xhr document response parsing"
```

### Task 4: Verify the full fake XHR suite

**Files:**
- Test: `lib/fake-xhr/index.test.js`

**Step 1: Run the fake XHR test file**

Run: `npm test -- lib/fake-xhr/index.test.js`
Expected: PASS

**Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Run lint if control flow or helpers changed**

Run: `npm run lint`
Expected: PASS

**Step 4: Inspect the final diff**

Run: `git diff --stat`
Expected: only `lib/fake-xhr/index.js`, `lib/fake-xhr/index.test.js`, and the plan docs changed.

**Step 5: Commit**

```bash
git add lib/fake-xhr/index.js lib/fake-xhr/index.test.js docs/plans/2026-03-03-issue-194-html-document-support*.md
git commit -m "fix: add html document support to fake xhr"
```
