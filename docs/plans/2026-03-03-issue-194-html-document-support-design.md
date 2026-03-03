# Issue 194 HTML Document Support Design

**Goal:** Make `FakeXMLHttpRequest` support `responseType = "document"` for `Content-Type: text/html` when a native `DOMParser` is available, while preserving current XML behavior.

**Context**

Issue `#194` reports that [`lib/fake-xhr/index.js`](/Users/carlerik/dev/nise/lib/fake-xhr/index.js) only returns a `Document` for XML content types. Browsers also allow HTML responses to populate `xhr.response` when `responseType` is `"document"`, but the current implementation returns `null` for `text/html`.

**Chosen Approach**

Use the smallest production change:

- keep XML parsing on the existing `FakeXMLHttpRequest.parseXML` path;
- add a dedicated HTML branch for `responseType === "document"` and `Content-Type: text/html`;
- use `DOMParser().parseFromString(body, "text/html")` only when `DOMParser` exists;
- return `null` for HTML documents when no native parser is present.

This matches the approved constraint: no added parser dependency and no custom HTML fallback.

**Architecture**

The change should stay local to response conversion:

- `convertResponseBody` remains the single place that maps raw response bodies to typed `xhr.response` values;
- XML handling stays unchanged;
- HTML handling is added as a sibling branch, not folded into the XML helper;
- `responseXML` behavior for non-document responses remains unchanged.

If a helper is needed, it should be narrowly scoped, for example `parseHTML`, and only wrap the native parser availability check plus `parseFromString(..., "text/html")`.

**Testing**

Add focused tests in [`lib/fake-xhr/index.test.js`](/Users/carlerik/dev/nise/lib/fake-xhr/index.test.js):

- `responseType = "document"` plus `Content-Type: text/html` returns an HTML `Document` when `DOMParser` is available;
- the parsed document exposes expected HTML structure such as `documentElement.tagName === "HTML"` and a selected element from the body;
- the same request returns `null` when `DOMParser` is temporarily removed from the global environment;
- existing XML document tests remain unchanged as regression coverage.

**Out of Scope**

- adding new parsing dependencies;
- changing `.responseXML` behavior for plain text or non-document responses;
- broad MIME-type support beyond the specific `text/html` case in issue `#194`.
