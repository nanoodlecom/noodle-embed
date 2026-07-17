import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { b64urlToBytes, gunzipText, decodeShareUrl, layoutGraph, openUrl, TYPE_META } from "../noodle-embed.mjs";

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const gz64url = (v) => Buffer.from(gzipSync(JSON.stringify(v))).toString("base64url");

const GRAPH = {
  v: 1,
  nodes: [
    { id: "n1", type: "text", x: 60, y: 130, w: 220, fields: { text: "hi" } },
    { id: "n2", type: "llm", x: 340, y: 70, w: 250, fields: {} },
    { id: "n3", type: "image", x: 650, y: 100, w: 250, fields: {}, name: "Poster" },
  ],
  links: [
    { id: "l1", from: { node: "n1", port: "text" }, to: { node: "n2", port: "prompt" } },
    { id: "l2", from: { node: "n2", port: "text" }, to: { node: "n3", port: "prompt" } },
  ],
};

// --- decodeShareUrl ---------------------------------------------------------

test("decodes #g= (gzip), #j= (plain), full URL or bare fragment", async () => {
  for (const src of [
    `https://nanoodle.com/#g=${gz64url(GRAPH)}`,
    `https://nanoodle.com/#j=${b64url(GRAPH)}`,
    `#g=${gz64url(GRAPH)}`,
  ]) {
    const { graph, name } = await decodeShareUrl(src);
    assert.deepEqual(graph, GRAPH, src.slice(0, 30));
    assert.equal(name, null);
  }
});

test("decodes #a= app payloads and surfaces the app name", async () => {
  const app = { v: 1, graph: GRAPH, name: "Ramen namer" };
  for (const src of [
    `https://nanoodle.com/play#a=${gz64url(app)}`,
    `https://nanoodle.com/play#a=u${b64url(app)}`,
  ]) {
    const { graph, name } = await decodeShareUrl(src);
    assert.deepEqual(graph, GRAPH);
    assert.equal(name, "Ramen namer");
  }
});

test("rejects junk: no fragment, unknown tag, bad base64, gzip bomb, graphless app", async () => {
  await assert.rejects(() => decodeShareUrl("https://nanoodle.com/"));
  await assert.rejects(() => decodeShareUrl("https://nanoodle.com/#x=abc"));
  await assert.rejects(() => decodeShareUrl("#g=!!!"));
  await assert.rejects(() => decodeShareUrl(`#a=u${b64url({ v: 1 })}`), /no graph/);
  const bomb = Buffer.from(gzipSync(Buffer.alloc(16 * 1024 * 1024))).toString("base64url");
  await assert.rejects(() => decodeShareUrl(`#g=${bomb}`), /too large/);
});

test("b64urlToBytes/gunzipText round-trip", async () => {
  const s = "noodles ".repeat(100);
  assert.equal(await gunzipText(b64urlToBytes(Buffer.from(gzipSync(s)).toString("base64url"))), s);
});

// --- layoutGraph -------------------------------------------------------------

test("layout fits node centers inside the padded box, preserving order", () => {
  const lay = layoutGraph(GRAPH, 640, 320, 40);
  assert.equal(lay.nodes.length, 3);
  assert.equal(lay.wires.length, 2);
  for (const n of lay.nodes) {
    assert.ok(n.x >= 40 && n.x <= 600, `x in box: ${n.x}`);
    assert.ok(n.y >= 40 && n.y <= 280, `y in box: ${n.y}`);
  }
  const [a, b, c] = lay.nodes;
  assert.ok(a.x < b.x && b.x < c.x, "left-to-right order preserved");
});

test("layout labels: custom name wins, else registry title, else raw type", () => {
  const lay = layoutGraph(GRAPH, 640, 320);
  assert.deepEqual(lay.nodes.map((n) => n.label), ["Text", "LLM", "Poster"]);
  assert.deepEqual(lay.nodes.map((n) => n.emoji), ["📝", "🧠", "🖼"]);
  const weird = layoutGraph({ nodes: [{ id: "z", type: "mystery", x: 0, y: 0 }], links: [] }, 100, 100);
  assert.equal(weird.nodes[0].label, "mystery");
});

test("layout drops dangling wires and returns null for undrawable graphs", () => {
  const lay = layoutGraph({ nodes: GRAPH.nodes, links: [{ from: { node: "n1" }, to: { node: "ghost" } }] }, 640, 320);
  assert.equal(lay.wires.length, 0);
  assert.equal(layoutGraph({ nodes: [], links: [] }, 640, 320), null);
  assert.equal(layoutGraph(null, 640, 320), null);
  assert.equal(layoutGraph({ nodes: [{ id: "q", type: "text" }] }, 640, 320), null, "positionless nodes");
});

test("single node lands centered", () => {
  const lay = layoutGraph({ nodes: [{ id: "n", type: "text", x: 500, y: 900 }], links: [] }, 600, 300, 40);
  assert.equal(Math.round(lay.nodes[0].x), 300);
  assert.equal(Math.round(lay.nodes[0].y), 150);
});

// --- openUrl -----------------------------------------------------------------

test("openUrl passes full links through and roots bare fragments at nanoodle.com", () => {
  assert.equal(openUrl("https://nanoodle.com/play#a=abc"), "https://nanoodle.com/play#a=abc");
  assert.equal(openUrl("#g=abc"), "https://nanoodle.com/#g=abc");
});

test("TYPE_META covers the editor's node registry", () => {
  for (const key of ["text", "llm", "image", "tvideo", "music", "comment"]) {
    assert.ok(TYPE_META[key], key);
  }
});
