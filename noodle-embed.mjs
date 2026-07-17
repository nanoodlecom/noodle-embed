// noodle-embed — render a nanoodle workflow read-only inside any page.
//
//   <script type="module" src="noodle-embed.mjs"></script>
//   <noodle-embed src="https://nanoodle.com/#g=..."></noodle-embed>
//
// The whole workflow travels inside the share URL's fragment, so the element
// decodes and draws it entirely locally — no fetch, no analytics, nothing
// leaves the page. One ES module, zero dependencies. The pure helpers are
// exported for tests; the custom element registers itself only in browsers.

/** Share-link fragment tags understood by decodeShareUrl (mirrors nanoodle):
 *   #g=  base64url(gzip(graph JSON))      #j=  base64url(graph JSON)
 *   #a=  base64url(gzip(app JSON))        #a=u base64url(app JSON)
 * App payloads contribute their `graph` (and `name`, used as the title). */
export function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decompressed-size ceiling — a hostile embed src must not balloon memory. */
const MAX_INFLATED_BYTES = 8 * 1024 * 1024;

export async function gunzipText(bytes, maxBytes = MAX_INFLATED_BYTES) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error("payload too large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(out);
}

/**
 * Decode a nanoodle share URL (or bare "#g=..." fragment) into
 * {graph, name} — name only when an app payload carries one.
 * Throws on anything undecodable; the element catches and falls back.
 */
export async function decodeShareUrl(src) {
  const hash = src.startsWith("#") ? src : new URL(src).hash;
  let m;
  if ((m = hash.match(/^#([gj])=(.+)$/))) {
    const bytes = b64urlToBytes(m[2]);
    const json = m[1] === "g" ? await gunzipText(bytes) : new TextDecoder().decode(bytes);
    return { graph: JSON.parse(json), name: null };
  }
  if ((m = hash.match(/^#a=(u?)(.+)$/))) {
    const bytes = b64urlToBytes(m[2]);
    const json = m[1] ? new TextDecoder().decode(bytes) : await gunzipText(bytes);
    const app = JSON.parse(json);
    if (!app || typeof app !== "object" || !app.graph) throw new Error("app payload has no graph");
    return { graph: app.graph, name: typeof app.name === "string" ? app.name : null };
  }
  throw new Error("not a nanoodle share link (expected #g= / #j= / #a=)");
}

/** Emoji + label per node type — mirrors the editor's NODE_TYPES registry. */
export const TYPE_META = { text:["📝","Text"], upload:["📷","Image input"], aupload:["🎤","Audio input"], vupload:["📹","Video input"], choice:["🔘","Choice"], join:["🔗","Join"], llm:["🧠","LLM"], image:["🖼","Image"], draw:["🎨","Draw"], edit:["✂️","Edit"], inpaint:["🩹","Inpaint"], resize:["📐","Resize / crop"], vision:["👁","Vision"], tvideo:["🎬","Text→Video"], ivideo:["📽️","Image→Video"], vedit:["🎞️","Video edit"], vframes:["🎞","Video → frames"], combine:["🎬","Combine videos"], soundtrack:["🎚","Soundtrack"], lipsync:["🎭","Avatar / lipsync"], music:["🎵","Music"], remix:["🎛","Remix audio"], tts:["🗣️","Speech"], trim:["✂️","Trim audio"], extractaudio:["🔊","Extract audio"], transcribe:["🎙️","Transcribe"], comment:["💬","Comment"] };

/**
 * Fit a graph's node centers into a w×h box (padding included), preserving
 * the layout's shape. Pure: returns {nodes: [{id, x, y, emoji, label}],
 * wires: [{x1,y1,x2,y2}]} in box coordinates, or null for no drawable nodes.
 */
export function layoutGraph(graph, w, h, padX = 40, padY = padX) {
  const nodes = (graph && Array.isArray(graph.nodes) ? graph.nodes : [])
    .filter((n) => n && typeof n.x === "number" && typeof n.y === "number" && typeof n.type === "string");
  if (!nodes.length) return null;
  const cx = (n) => n.x + (typeof n.w === "number" ? n.w : 220) / 2;
  const cy = (n) => n.y + 60;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, cx(n)); x1 = Math.max(x1, cx(n));
    y0 = Math.min(y0, cy(n)); y1 = Math.max(y1, cy(n));
  }
  const iw = Math.max(1, w - 2 * padX), ih = Math.max(1, h - 2 * padY);
  const s = Math.min(iw / Math.max(1, x1 - x0), ih / Math.max(1, y1 - y0));
  const px = (n) => padX + (cx(n) - x0) * s + (iw - (x1 - x0) * s) / 2;
  const py = (n) => padY + (cy(n) - y0) * s + (ih - (y1 - y0) * s) / 2;
  const placed = nodes.map((n) => {
    const meta = TYPE_META[n.type] || ["·", n.type];
    const label = typeof n.name === "string" && n.name.trim() ? n.name.trim() : meta[1];
    return { id: n.id, x: px(n), y: py(n), emoji: meta[0], label };
  });
  const at = new Map(placed.map((p) => [p.id, p]));
  const wires = [];
  for (const l of Array.isArray(graph.links) ? graph.links : []) {
    const a = l && l.from && at.get(l.from.node), b = l && l.to && at.get(l.to.node);
    if (a && b) wires.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return { nodes: placed, wires };
}

/** The URL the "Open in nanoodle" button targets: the share link itself
 *  (normalized to a string), so what opens is exactly what was embedded. */
export function openUrl(src) {
  if (src.startsWith("#")) return "https://nanoodle.com/" + src;
  const u = new URL(src);
  return u.href;
}

// --- the custom element (browser only) ---------------------------------------

const CSS = `
:host { display:block; container-type:inline-size; }
.frame { position:relative; background:#111116; border:1px solid #2c2c36; border-radius:12px;
  overflow:hidden; font:14px/1.4 system-ui,sans-serif; color:#ececf2; }
.canvas { position:relative; width:100%; }
svg { position:absolute; inset:0; width:100%; height:100%; }
path { stroke:#4c4c5c; stroke-width:2.5; fill:none; }
.node { position:absolute; transform:translate(-50%,-50%); display:flex; align-items:center; gap:8px;
  background:#1e1e26; border:1.5px solid #3c3c4a; border-radius:10px; padding:7px 14px;
  white-space:nowrap; max-width:200px; }
.node .lbl { overflow:hidden; text-overflow:ellipsis; font-weight:600; }
.foot { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:10px 14px; background:#16161d; border-top:1px solid #2c2c36; }
.brand { color:#f4f4f8; font-weight:600; text-decoration:none; }
.tag { color:#9a9aa8; font-size:12px; }
.open { background:#f4f4f8; color:#111116; font-weight:600; text-decoration:none;
  padding:7px 14px; border-radius:8px; flex:none; }
.open:hover { background:#fff; }
.err { padding:28px 16px; text-align:center; color:#9a9aa8; }
@container (max-width: 480px) { .tag { display:none; } }
`;

// Defined only in browsers — Node (tests) has no HTMLElement.
const NoodleEmbed = typeof HTMLElement === "undefined" ? null : class NoodleEmbed extends HTMLElement {
  static get observedAttributes() { return ["src", "height"]; }
  attributeChangedCallback() { if (this.isConnected) this.#render(); }
  connectedCallback() { this.#render(); }

  async #render() {
    const src = this.getAttribute("src") || "";
    const height = Math.max(160, Math.min(1200, Number(this.getAttribute("height")) || 340));
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const link = (() => { try { return openUrl(src); } catch { return "https://nanoodle.com/"; } })();
    let decoded = null;
    try { decoded = await decodeShareUrl(src); } catch {}
    if (this.getAttribute("src") !== src) return; // superseded by a newer render
    // Pad enough that a node BOX (max-width 200, centered on its point) stays
    // inside the frame, shrinking on narrow embeds rather than overflowing.
    const width = this.clientWidth || 640;
    const lay = decoded && layoutGraph(decoded.graph, width, height, Math.min(120, Math.floor(width / 5)), 48);
    const foot = `
      <div class="foot">
        <span><a class="brand" href="https://nanoodle.com/" target="_blank" rel="noopener">🍜 nanoodle</a>
        <span class="tag">runs in your browser — bring your own key</span></span>
        <a class="open" href="${esc(link)}" target="_blank" rel="noopener">Open in nanoodle →</a>
      </div>`;
    if (!lay) {
      root.innerHTML = `<style>${CSS}</style><div class="frame">
        <div class="err">${decoded ? "Nothing to draw in this noodle." : "Couldn’t read this share link."}</div>${foot}</div>`;
      return;
    }
    const wires = lay.wires.map((w) => {
      const dx = Math.max(30, (w.x2 - w.x1) / 2);
      return `<path d="M ${w.x1} ${w.y1} C ${w.x1 + dx} ${w.y1}, ${w.x2 - dx} ${w.y2}, ${w.x2} ${w.y2}"/>`;
    }).join("");
    const nodes = lay.nodes.map((n) =>
      `<div class="node" style="left:${n.x}px;top:${n.y}px"><span>${esc(n.emoji)}</span><span class="lbl">${esc(n.label)}</span></div>`
    ).join("");
    const title = decoded.name ? `<div class="node" style="left:50%;top:24px;border:none;background:none;font-weight:700">${esc(decoded.name)}</div>` : "";
    root.innerHTML = `<style>${CSS}</style><div class="frame">
      <div class="canvas" style="height:${height}px" role="img" aria-label="a nanoodle workflow with ${lay.nodes.length} nodes">
        <svg aria-hidden="true">${wires}</svg>${nodes}${title}
      </div>${foot}</div>`;
  }
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

if (NoodleEmbed && typeof window !== "undefined" && window.customElements && !customElements.get("noodle-embed")) {
  customElements.define("noodle-embed", NoodleEmbed);
}
