import test from "node:test";
import assert from "node:assert/strict";

// Minimal host contract: test lifecycle ordering without adding runtime deps.
const observers = [];
globalThis.HTMLElement = class {
  attrs = new Map();
  isConnected = false;
  clientWidth = 640;
  shadowRoot = null;
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    this.attributeChangedCallback(name);
  }
  removeAttribute(name) { this.attrs.delete(name); this.attributeChangedCallback(name); }
  attachShadow() { return this.shadowRoot = { innerHTML: "" }; }
};
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe() { this.active = true; }
  disconnect() { this.active = false; }
};
let Element;
globalThis.window = globalThis;
globalThis.customElements = { get() {}, define(name, klass) { Element = klass; } };
const { decodeShareUrl } = await import("../noodle-embed.mjs");

const fragment = (name) => "#j=" + Buffer.from(JSON.stringify({
  nodes: [{ id: "a", type: "text", name, x: 0, y: 0 }, { id: "b", type: "llm", x: 400, y: 0 }],
  links: [],
})).toString("base64url");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function mount(src) {
  const el = new Element();
  if (src !== undefined) el.setAttribute("src", src);
  el.isConnected = true;
  el.connectedCallback();
  return el;
}

test("missing/removed src renders fallback and can recover", async () => {
  const el = mount();
  await tick();
  assert.match(el.shadowRoot.innerHTML, /Couldn’t read/);
  el.setAttribute("src", fragment("Recovered"));
  await tick();
  assert.match(el.shadowRoot.innerHTML, /Recovered/);
  el.removeAttribute("src");
  await tick();
  assert.match(el.shadowRoot.innerHTML, /Couldn’t read/);
  assert.doesNotMatch(el.shadowRoot.innerHTML, /Recovered/);
});

test("pending decode uses latest height; resize redraws cached graph", async () => {
  const el = mount(fragment("Current"));
  el.setAttribute("height", "700");
  await tick();
  assert.match(el.shadowRoot.innerHTML, /height:700px/);
  const before = el.shadowRoot.innerHTML;
  el.clientWidth = 320;
  observers.at(-1).callback();
  assert.notEqual(el.shadowRoot.innerHTML, before);
  assert.match(el.shadowRoot.innerHTML, /Current/);
});

test("A→B→A supersession and disconnect cannot commit stale decodes", async () => {
  const pending = [];
  const Native = globalThis.DecompressionStream;
  globalThis.DecompressionStream = class {
    constructor() {
      const stream = new TransformStream({
        transform(bytes, controller) {
          return new Promise((resolve) => pending.push(() => {
            // A cancelled reader closes the controller while work is pending.
            try { controller.enqueue(bytes); } catch (error) { assert.equal(error.code, "ERR_INVALID_STATE"); }
            resolve();
          }));
        },
      });
      this.readable = stream.readable;
      this.writable = stream.writable;
    }
  };
  try {
    const a = fragment("A").replace("#j=", "#g=");
    const el = mount(a);
    await tick();
    el.setAttribute("src", fragment("B"));
    el.setAttribute("src", a);
    await tick();
    assert.equal(pending.length, 2);
    pending[1]();
    await tick();
    assert.match(el.shadowRoot.innerHTML, />A</);
    el.setAttribute("height", "800");
    const current = el.shadowRoot.innerHTML;
    assert.match(current, /height:800px/);
    assert.equal(pending.length, 2, "height redraw does not start another decode");
    pending[0]();
    await tick();
    assert.equal(el.shadowRoot.innerHTML, current);
    el.setAttribute("src", fragment("Detached").replace("#j=", "#g="));
    await tick();
    el.isConnected = false;
    el.disconnectedCallback();
    assert.equal(observers.at(-1).active, false);
    const detached = el.shadowRoot.innerHTML;
    pending[2]();
    await tick();
    assert.equal(el.shadowRoot.innerHTML, detached);
    el.setAttribute("src", fragment("Reconnected"));
    el.isConnected = true;
    el.connectedCallback();
    await tick();
    assert.match(el.shadowRoot.innerHTML, /Reconnected/);
    assert.equal(observers.at(-1).active, true);
  } finally {
    globalThis.DecompressionStream = Native;
  }
});

test("unsafe fallback href is replaced by the nanoodle home page", async () => {
  const el = mount("javascript:alert(1)");
  await tick();
  assert.doesNotMatch(el.shadowRoot.innerHTML, /javascript:/);
  assert.match(el.shadowRoot.innerHTML, /class="open" href="https:\/\/nanoodle.com\/"/);
});

test("decoder rejects an already cancelled operation", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(decodeShareUrl(fragment("A"), { signal: controller.signal }), { name: "AbortError" });
});
