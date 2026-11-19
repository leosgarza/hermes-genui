/**
 * tests/host_harness_r3.tsx — the round-3 Library integration harness (t_0559173f).
 *
 * WHY THIS FILE EXISTS. The reviewer's round-2 finding: the shelf test drove a recording composer
 * fake and manually invoked the registration, so it could not establish that the REAL host would
 * (a) take the plugin's ctx.register calls, (b) route composer.submit into the CURRENT session,
 * (c) RECEIVE the reattached ::blocks reference, and (d) render it. The architect's disposition:
 * build the most faithful ISOLATED host integration feasible — mirrored function-for-function from
 * the shipped Desktop host — and document the outermost live-Desktop link as the honest residual
 * (Sol's bounded live acceptance at promotion). This harness mirrors, from
 *   /Applications/Hermes.app/Contents/Resources/app.asar.unpacked/dist/assets/capabilities-CX1W09bd.js
 * (read-only; offsets quoted per function), the app's OWN plugin pipeline:
 *
 *   PU/FU/LU  @467276 — SDK + react import-map shim modules: blob ES modules re-exporting the
 *                       globalThis.__HERMES_*__ namespaces; the bare specifier map is exactly
 *                       {"@hermes/plugin-sdk", react, "react/jsx-runtime", react/jsx-dev-runtime}.
 *   wW/EW/DW/OW/kW/AW/jW @473409..475649 — the plugin source's bare-import REWRITER (with the
 *                       shipped comment/template state machine so rewrites happen in code only)
 *                       and the unsupported-import CHECK the loader runs before touching the module.
 *   NW        @475364 — the loader: rewrite → blob → dynamic import → the default must carry
 *                       {id, register}, then register(ctx) runs.
 *   xW        @~470000 — the ctx handed to register: contributions are namespaced
 *                       {...r, id: `${pluginId}:${r.id}`, source: `plugin:${pluginId}`}, and rest
 *                       is the plugin-scoped fetch. No area allowlist — verified in round 2.
 *   kI/FI/II/LI @364072, @429818 (nV) — the transcript SPLITTER: `::name{key="value"}` runs,
 *                       prose runs, the 4800-char and `{`-guard rules, attrs lower-cased keys.
 *   yz/bz     @~460000 — the directive slot: the contribution is chosen from the
 *                       transcript.directives area BY `data.name`, then rendered
 *                       `data.render({attrs, sessionId, source, streaming})`.
 *   bA/yA     @260801 — host.composer: submit/insertText/focus resolve a TARGET from the passed
 *                       sessionId, and a NULL sessionId resolves to the active session; submit
 *                       returns whether the target took the text.
 *
 * The plugin under test is NOT a re-bundled src copy: it is THE frozen artifact, the exact bytes of
 * desktop/plugin.js (sha256 asserted by the Python side), loaded through the shipped loader path
 * above. React is likewise the shared namespace the shim re-exports — the plugin's `import ... from
 * "react"` lands on the same module instance the harness renders with, exactly as in the app.
 *
 * The honest residual stays in the Python test: this is a faithful MIRROR of the shipped host's
 * contract, not the Electron app's own renderer process (real session store, IPC, the model loop).
 * That outermost link cannot be exercised without installing/restarting the live plugin, and is
 * scheduled as Sol's bounded live new-chat acceptance at promotion.
 */
import * as ReactNS from "react";
import * as JSXNS from "react/jsx-runtime";
import * as React from "react";
import { createRoot } from "react-dom/client";

declare const window: any;

// --- what the app installs as globals (PU @467276) -------------------------------------------------

const CHAT_EMPTY_AREA = "chat.empty";                 // shipped nV @429818: `chat.empty`
const TRANSCRIPT_DIRECTIVE_AREA = "transcript.directives";  // shipped DI @364072
const PLUGIN_ID = "hermes-genui";

let composerTarget: ((sessionId: string | null) => string | null) | null = null;
const host = {
  composer: {
    // bA-shaped: every call RESOLVES THE TARGET from the sessionId, null = the active session,
    // and nothing is recorded — the text goes INTO the session's transcript/draft model.
    submit: (sessionId: string | null, text: string): boolean => {
      const id = composerTarget ? composerTarget(sessionId) : null;
      if (id === null) return false;
      return hostModel.appendMessage(id, text);
    },
    insertText: async (sessionId: string | null, text: string): Promise<boolean> => {
      const id = composerTarget ? composerTarget(sessionId) : null;
      if (id === null) return false;
      return hostModel.appendToDraft(id, text);
    },
    focus: (sessionId: string | null) => {
      const id = composerTarget ? composerTarget(sessionId) : null;
      if (id !== null) hostModel.focusComposer(id);
    },
  },
};

// The SDK namespace the shim re-exports (the app's pU carries far more; the plugin imports these
// three, and the shim's key list is produced by the SAME filter FU applies).
(globalThis as any).__HERMES_PLUGIN_SDK__ = {
  host, CHAT_EMPTY_AREA, TRANSCRIPT_DIRECTIVE_AREA,
};
(globalThis as any).__HERMES_REACT__ = ReactNS;
(globalThis as any).__HERMES_REACT_JSX__ = JSXNS;

// --- FU/LU: the shipped shim-module builder, verbatim logic (@467276) --------------------------------

function shimURL(globalName: string): string {
  const ns = (globalThis as any)[globalName];
  const keys = Object.keys(ns).filter((k) => k !== "default" && /^[A-Za-z_$][\w$]*$/.test(k));
  const text = `const m = globalThis.${globalName};\nexport default m.default ?? m;\n`
    + (keys.length ? `export const { ${keys.join(", ")} } = m;\n` : "");
  return URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
}

let importMapCache: Record<string, string> | null = null;
function importMap(): Record<string, string> {
  // The shipped NU installs all four namespaces; this harness stands the three the frozen artifact
  // imports (no jsx-dev in a production build), so an absent namespace is simply not mapped — the
  // same shape LU gives, minus a global the app would have set and this page has no reason for.
  return importMapCache ??= Object.fromEntries(
    Object.entries({
      "@hermes/plugin-sdk": "__HERMES_PLUGIN_SDK__",
      "react/jsx-dev-runtime": "__HERMES_REACT_JSX_DEV__",
      "react/jsx-runtime": "__HERMES_REACT_JSX__",
      react: "__HERMES_REACT__",
    }).filter(([, g]) => (globalThis as any)[g] !== undefined)
      .map(([spec, g]) => [spec, shimURL(g)]));
}

// --- wW/EW/DW/OW/kW/AW/jW: the shipped bare-import scanner + rewriter, verbatim logic ---------------

const W_RE = /(from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g;
const RESERVED = /^(?:await|case|delete|do|else|in|instanceof|new|of|return|throw|typeof|void|yield)$/;

function beforeIsKeyword(src: string, i: number): boolean {
  let n = i - 1;
  while (n >= 0 && /\s/.test(src[n])) n--;
  if (n < 0) return true;
  const c = src[n];
  if (c === "+" || c === "-") return src[n - 1] !== c;
  if (c === ")" || c === "]" || c === "'" || c === '"' || c === "`") return false;
  if (c === "}") return true;
  if (/[A-Za-z0-9_$]/.test(c)) {
    let t = n;
    while (t >= 0 && /[A-Za-z0-9_$]/.test(src[t])) t--;
    return src[t] !== "." && RESERVED.test(src.slice(t + 1, n + 1));
  }
  return true;
}

function regexEnd(src: string, i: number): number {
  let n = i + 1, inClass = false;
  while (n < src.length) {
    const c = src[n];
    if (c === "\\") n += 2;
    else if (c === "\n") return -1;
    else if (c === "[") { inClass = true; n += 1; }
    else if (c === "]") { inClass = false; n += 1; }
    else if (c === "/" && !inClass) { n += 1; while (n < src.length && /[A-Za-z]/.test(src[n])) n++; return n; }
    else n += 1;
  }
  return -1;
}

/** The shipped comment/string/template state machine OW: ranges of src that are CODE (not comment,
 *  not string, not regex) — the rewriter and the unsupported-check share it. */
function codeRanges(src: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const stack: string[] = [];
  let mode = "code", start = 0, i = 0;
  const flush = (end: number) => { if (end > start) out.push([start, end]); };
  while (i < src.length) {
    const c = src[i], d = i + 1 < src.length ? src[i + 1] : "";
    if (mode === "code") {
      if (c === "/" && d === "/") { flush(i); mode = "line"; i += 2; }
      else if (c === "/" && d === "*") { flush(i); mode = "block"; i += 2; }
      else if (c === "'") { flush(i); mode = "single"; i += 1; }
      else if (c === '"') { flush(i); mode = "double"; i += 1; }
      else if (c === "`") { flush(i); stack.push("template"); mode = "template"; i += 1; }
      else if (c === "/") { const e = beforeIsKeyword(src, i) ? regexEnd(src, i) : -1; if (e > 0) { flush(i); i = e; start = i; } else i += 1; }
      else { if (c === "}" && stack[stack.length - 1] === "expr") { flush(i); stack.pop(); mode = "template"; } i += 1; }
    } else if (mode === "line") { if (c === "\n") { mode = "code"; start = i; } i += 1; }
    else if (mode === "block") { if (c === "*" && d === "/") { i += 2; mode = "code"; start = i; } else i += 1; }
    else if (mode === "single" || mode === "double") {
      if (c === "\\") i += 2;
      else if (c === (mode === "single" ? "'" : '"') || c === "\n") { i += 1; mode = "code"; start = i; }
      else i += 1;
    } else { // template
      if (c === "\\") i += 2;
      else if (c === "$" && d === "{") { stack.push("expr"); mode = "code"; i += 2; start = i; }
      else if (c === "`") { stack.pop(); mode = "code"; i += 1; start = i; }
      else i += 1;
    }
  }
  flush(src.length);
  return out;
}

function inRanges(ranges: Array<[number, number]>, at: number): boolean {
  for (const [s, e] of ranges) { if (at < s) return false; if (at < e) return true; }
  return false;
}

function rewriteImports(src: string): string {
  const map = importMap(), ranges = codeRanges(src);
  return src.replace(W_RE, (full, kw, q, spec, idx) =>
    (map[spec] && inRanges(ranges, Number(idx)) ? `${kw}${q}${map[spec]}${q}` : full));
}

function unsupportedImports(src: string): string[] {
  const map = importMap(), ranges = codeRanges(src), found = new Set<string>();
  for (const m of src.matchAll(W_RE)) {
    const spec = m[3];
    if (spec && inRanges(ranges, m.index ?? 0) && !map[spec]) found.add(spec);
  }
  return [...found];
}

// --- NW: the shipped loader, verbatim logic (@475364) ------------------------------------------------

// The shipped loader performs a real dynamic import() of the rewritten blob module. esbuild
// rewrites a VISIBLE import() inside an IIFE bundle, so the call is built exactly the way any
// page-context dynamic import works — a Function whose body is the native import expression.
// Chrome resolves blob: URLs absolutely; nothing about the semantics changes.
const dynImport: (u: string) => Promise<any> =
  new Function("u", "return import(u)") as (u: string) => Promise<any>;

async function loadPlugin(srcText: string): Promise<any> {
  const bad = unsupportedImports(srcText);
  if (bad.length > 0) throw new Error(`unsupported imports: ${bad.join(", ")}`);
  const url = URL.createObjectURL(new Blob([rewriteImports(srcText)], { type: "text/javascript" }));
  let mod: any;
  try {
    mod = await Promise.race([
      dynImport(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error("import timed out")), 20000)),
    ]);
  } finally {
    URL.revokeObjectURL(url);
  }
  const d = mod.default;
  if (!d?.id || typeof d.register !== "function") throw new Error("plugin default lacks {id, register}");
  return d;
}

// --- xW: the shipped ctx, verbatim namespacing -------------------------------------------------------

type Contrib = { area: string; id: string; source: string; data?: any };
const registry: { byArea: Map<string, Contrib[]> } = { byArea: new Map() };

function makeCtx(pluginId: string, rest: (path: string, init?: any) => Promise<unknown>) {
  const source = `plugin:${pluginId}`;
  const register = (r: any) => {
    const c: Contrib = { ...r, id: `${pluginId}:${r.id}`, source };
    const list = registry.byArea.get(c.area) ?? [];
    registry.byArea.set(c.area, [...list, c]);
    window.__registrations = [...(window.__registrations ?? []), { id: c.id, area: c.area }];
    return () => {
      const l = registry.byArea.get(c.area) ?? [];
      registry.byArea.set(c.area, l.filter((x) => x !== c));
    };
  };
  return { source, register, rest };
}

// --- kI/FI/II/LI/yz/bz: the shipped transcript splitter + directive slot ------------------------------

const OI = 2048;
const KI = new RegExp(String.raw`(?<=^|\s)::([a-z][a-z0-9-]{0,63})(?:\{([^{}]{0,${OI}})\})?`, "g");
const FIRE = /([a-z][\w-]{0,63})=(?:"([^"]*)"|'([^']*)')/gi;

function parseAttrs(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of (raw ?? "").matchAll(FIRE)) {
    out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? "").replace(/^<(https?:\/\/[^<>\s]+)>$/i, "$1");
  }
  return out;
}

type Run = { kind: "prose"; text: string } | { kind: "directive"; directive: { name: string; attrs: Record<string, string>; source: string } };
function splitRuns(text: string): Run[] | null {
  if (!text.includes("::") || text.length > 4800) return null;
  const out: Run[] = [];
  let last = 0;
  KI.lastIndex = 0;
  for (const m of text.matchAll(KI)) {
    const i = m.index ?? 0;
    if (m[2] !== undefined || text[i + m[0].length] !== "{") {
      if (i > last) out.push({ kind: "prose", text: text.slice(last, i) });
      out.push({ kind: "directive", directive: { name: m[1], attrs: parseAttrs(m[2]), source: m[0] } });
      last = i + m[0].length;
    }
  }
  if (out.length === 0) return null;
  if (last < text.length) out.push({ kind: "prose", text: text.slice(last) });
  return out;
}

function findDirective(list: Contrib[], name: string): Contrib | undefined {
  return list.find((e) => e.data?.name === name);  // shipped yz
}

// --- the host MODEL: sessions with real transcripts and drafts (bA/yA's backing store) ----------------

type Session = { id: string; title: string; messages: string[]; draft: string };

const hostModel = {
  sessions: new Map<string, Session>(),
  active: "chat-new",
  bump: () => {},
  targetFor(sessionId: string | null): string | null {
    const id = sessionId ?? this.active;               // yA: null resolves to the ACTIVE session
    return this.sessions.has(id) ? id : null;          // an unknown session has no mounted target
  },
  appendMessage(id: string, text: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.messages = [...s.messages, text];                // cA: the message ENTERS the transcript
    this.bump();
    return true;
  },
  appendToDraft(id: string, text: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.draft = (s.draft ? s.draft + "\n" : "") + text;
    this.bump();
    return true;
  },
  focusComposer(id: string) {
    document.querySelector<HTMLTextAreaElement>(`.hh-composer[data-session="${id}"]`)?.focus();
  },
  setActive(id: string) { this.active = id; this.bump(); },
  serialize() {
    return [...this.sessions.values()].map((s) => ({ id: s.id, messages: s.messages, draft: s.draft }));
  },
};

composerTarget = (sessionId) => hostModel.targetFor(sessionId);
window.__hostSessions = () => hostModel.serialize();

// --- the UI the host would draw: sidebar, chat.empty slot, transcript through the plugin's own --------
// transcript-directive registration, composer per session ----------------------------------------------------------------

function Message({ sessionId, text }: { sessionId: string; text: string }) {
  const runs = splitRuns(text);
  if (!runs) return React.createElement("p", { className: "hh-prose" }, text);
  const directives = registry.byArea.get(TRANSCRIPT_DIRECTIVE_AREA) ?? [];
  return React.createElement(
    React.Fragment,
    null,
    runs.map((run, i) =>
      run.kind === "prose"
        ? React.createElement("p", { key: i, className: "hh-prose" }, run.text)
        : (() => {
            const contrib = findDirective(directives, run.directive.name);
            if (!contrib) return React.createElement("p", { key: i, className: "hh-prose" }, text.slice(0));
            // the shipped bz contract: data.render({attrs, sessionId, source, streaming})
            const node = contrib.data.render({
              attrs: run.directive.attrs, sessionId, source: run.directive.source, streaming: false,
            });
            return React.createElement("div", {
              key: `${contrib.id}:${run.directive.source}`, className: "hh-directive", "data-directive": run.directive.name,
            }, node);
          })()),
  );
}

function ChatPane({ session }: { session: Session }) {
  const active = hostModel.active === session.id;
  const shelf = registry.byArea.get(CHAT_EMPTY_AREA) ?? [];
  const body = session.messages.length === 0
    // the host's chat.empty slot: every registration rendered with {sessionId}
    ? shelf.map((r) => React.createElement("div", { key: r.id, className: "hh-chat-empty" },
        r.data.render({ sessionId: session.id })))
    : session.messages.map((m, i) =>
        React.createElement("div", { key: i, className: "hh-message hh-user" },
          React.createElement(Message, { sessionId: session.id, text: m })));
  return React.createElement("section", {
    className: "hh-pane", "data-session": session.id, "data-active": active ? "1" : "0",
    style: active ? {} : { display: "none" },
  },
    body,
    React.createElement("textarea", {
      className: "hh-composer", "data-session": session.id, placeholder: "Message…",
      value: session.draft,
      onChange: (e: any) => { session.draft = e.target.value; hostModel.bump(); },
    }));
}

function App() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  hostModel.bump = () => force();
  const sessions = [...hostModel.sessions.values()];
  return React.createElement("div", { className: "hh-host" },
    React.createElement("nav", { className: "hh-side" },
      sessions.map((s) => React.createElement("button", {
        key: s.id, type: "button", className: "hh-session", "data-session": s.id,
        onClick: () => hostModel.setActive(s.id),
      }, s.title))),
    sessions.map((s) => React.createElement(ChatPane, { key: s.id, session: s })));
}

// --- boot ---------------------------------------------------------------------------------------------

window.__boot = Date.now();
window.__net = [];
const realFetch = window.fetch;
window.fetch = (u: RequestInfo | string, o?: RequestInit) => {
  window.__net.push([String(u), String(o?.method ?? "GET")]);
  return realFetch(u as any, o);
};

const spec = JSON.parse(document.getElementById("spec")!.textContent!);
const door = String(spec.door);
const rest = (path: string, init?: { method?: string; body?: unknown }) =>
  fetch(door + path, {
    method: init?.method,
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  }).then((r) =>
    r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(`${path} -> ${r.status} ${t}`))));

hostModel.sessions.set("chat-new", { id: "chat-new", title: "New chat", messages: [], draft: "" });
// The MIRROR's own rule is the shipped one: the chat.empty slot stands where the chat is EMPTY.
// Two empty chats exist (a fresh "New chat" and a second one) — the targeting proof needs the
// composer's null-target to FOLLOW whichever chat is active, so both must carry the shelf entry.
hostModel.sessions.set("chat-old", { id: "chat-old", title: "Second chat", messages: [], draft: "" });

// THE FROZEN ARTIFACT, loaded exactly the way the shipped app loads a plugin.
const pluginSrc = JSON.parse(document.getElementById("plugin-src")!.textContent!);
(async () => {
  try {
    const plugin = await loadPlugin(pluginSrc);
    window.__pluginId = plugin.id;
    plugin.register(makeCtx(PLUGIN_ID, rest));
    window.__loaded = true;
  } catch (e) {
    window.__loadError = String(e);
  }
  createRoot(document.getElementById("app")!).render(React.createElement(App));
  window.__ready = true;
})();
