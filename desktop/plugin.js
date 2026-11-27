// src/plugin.tsx
import { host, CHAT_EMPTY_AREA, TRANSCRIPT_DIRECTIVE_AREA } from "@hermes/plugin-sdk";

// src/host/actions.ts
import { createContext } from "react";

// src/lib/icons.ts
var ICON_NAMES = [
  "mail",
  "rupee",
  "bell",
  "cal",
  "check",
  "clock",
  "chart",
  "photo",
  "spark",
  "chat",
  "brain",
  "sun",
  "moon",
  "sunset",
  "note",
  "globe",
  "search",
  "heart",
  "plane",
  "bed",
  "food",
  "walk",
  "pin",
  "trophy",
  "lock",
  "star",
  "leaf",
  "flame",
  "ticket",
  "info",
  "alert"
];

// src/core/fields.ts
function num(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  return null;
}
function str(v, max = 120) {
  if (typeof v !== "string") return void 0;
  const trimmed = v.trim();
  if (!trimmed) return void 0;
  return trimmed.slice(0, max);
}
function firstText(values, max = 120) {
  for (const v of values) {
    const found = str(v, max);
    if (found !== void 0) return found;
  }
  return void 0;
}
function cutAtWord(text, max) {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const lastSpace = room.search(/\s\S*$/);
  const cut = lastSpace > max / 2 ? room.slice(0, lastSpace) : room;
  return `${cut.replace(/[\s,;:.–—-]+$/, "")}\u2026`;
}
function firstWords(values, max = 120) {
  const found = firstText(values, Infinity);
  return found === void 0 ? void 0 : cutAtWord(found, max);
}
function firstList(values) {
  return values.find((v) => Array.isArray(v));
}
function icon(v) {
  if (ICON_NAMES.includes(v)) return v;
  return void 0;
}
function align(v) {
  if (typeof v !== "string") return void 0;
  const word = v.trim().toLowerCase();
  return word === "left" || word === "center" || word === "right" ? word : void 0;
}
function density(v) {
  if (typeof v !== "string") return void 0;
  const word = v.trim().toLowerCase();
  return word === "comfortable" || word === "compact" ? word : void 0;
}
function palette(v) {
  if (typeof v !== "string") return void 0;
  const word = v.trim().toLowerCase();
  return word === "default" || word === "cool" || word === "warm" ? word : void 0;
}
function motion(v) {
  if (typeof v !== "string") return void 0;
  const word = v.trim().toLowerCase();
  return word === "full" || word === "reduced" ? word : void 0;
}
function boardId(v) {
  return typeof v === "string" && /^[0-9a-f]{8}$/.test(v) ? v : void 0;
}
function version(v) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 9999) return void 0;
  return v;
}
function slug(v) {
  if (typeof v === "string" && /^[a-z][a-z0-9_-]{0,23}$/.test(v)) return v;
  return void 0;
}
function https(v) {
  if (typeof v === "string" && /^https:\/\//.test(v)) return v;
  return void 0;
}
function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== void 0));
}
var Trail = class _Trail {
  path;
  dropped;
  constructor(path = "", dropped = []) {
    this.path = path;
    this.dropped = dropped;
  }
  /** One step deeper: new Trail("1").at("groups").at(2).path → "1.groups.2" */
  at(step) {
    const path = this.path ? `${this.path}.${step}` : String(step);
    return new _Trail(path, this.dropped);
  }
  drop(why) {
    this.dropped.push({ path: this.path, why });
    return null;
  }
};
function keepFirst(items, max, here, what) {
  if (items.length > max) here.drop(`kept the first ${max} ${what} of ${items.length}`);
  return items.slice(0, max);
}
function textOrNumber(v, max = 120) {
  if (num(v) !== null) return String(v);
  return str(v, max);
}
function firstTextOrNumber(values, max = 120) {
  for (const v of values) {
    const found = textOrNumber(v, max);
    if (found !== void 0) return found;
  }
  return void 0;
}
var AT_REFERENCE = /@\w[\w-]*:|@(?:diff|staged)\b/;
var NO_SEND = "a button's message can't start with / @ or ! or carry @-references";
function actsBeforeTheModel(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  return /^[/@!]/.test(text) || AT_REFERENCE.test(text);
}

// src/host/actions.ts
var BlockActions = createContext({ send: async () => "nowhere", fill: () => {
} });
var MAX_SENT = 120;
var SENT_WORDS = {
  sent: "Sent to chat.",
  drafted: "In the composer \u2014 press Send.",
  blocked: "Blocked from sending \u2014 in the composer \u2014 press Send.",
  failed: "Send failed \u2014 nothing was sent or kept.",
  nowhere: "No chat here."
};
function composerActions(composer) {
  const insert = async (text) => {
    await composer?.insertText(null, text, { mode: "block" });
  };
  const fill = (text) => {
    insert(text).then(() => composer?.focus(null)).catch(() => {
    });
  };
  const draft = async (text) => {
    let taken = false;
    try {
      taken = await composer?.insertText(null, text, { mode: "block" }) === true;
    } catch {
      taken = false;
    }
    if (taken) composer?.focus(null);
    return taken;
  };
  return {
    async send(text, opts) {
      if (!composer) return "nowhere";
      const guarded = actsBeforeTheModel(text);
      if (guarded || !opts?.force && text.length > MAX_SENT) {
        return await draft(text) ? guarded ? "blocked" : "drafted" : "failed";
      }
      try {
        if (composer.submit(null, text)) return "sent";
      } catch {
      }
      return await draft(text) ? "drafted" : "failed";
    },
    fill
  };
}

// src/host/BlockTag.tsx
import { useContext as useContext17, useEffect as useEffect12, useLayoutEffect as useLayoutEffect5, useReducer, useRef as useRef19, useState as useState25 } from "react";

// src/core/Blocks.tsx
import { createContext as createContext5, Fragment as Fragment15, useContext as useContext13 } from "react";

// src/blocks/flow/highlight.tsx
import { createContext as createContext2, useCallback, useContext, useMemo, useState } from "react";
import { jsx } from "react/jsx-runtime";
var FlowWalks = createContext2({ walks: /* @__PURE__ */ new Map(), setWalk: () => {
} });
function FlowLightBoard({ children }) {
  const [walks, setWalks] = useState(() => /* @__PURE__ */ new Map());
  const setWalk = useCallback((flow, walk) => {
    setWalks((was) => {
      const old = was.get(flow);
      if (old === walk || old && walk && old.steps === walk.steps && old.at === walk.at && old.from === walk.from) return was;
      const next = new Map(was);
      if (walk === void 0) next.delete(flow);
      else next.set(flow, walk);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ walks, setWalk }), [walks, setWalk]);
  return /* @__PURE__ */ jsx(FlowWalks.Provider, { value, children });
}
function useWalk(flow) {
  const { walks } = useContext(FlowWalks);
  return flow === void 0 ? void 0 : walks.get(flow);
}
function useSetWalk() {
  return useContext(FlowWalks).setWalk;
}

// src/blocks/actions/Actions.tsx
import { useContext as useContext2 } from "react";

// src/lib/Icon.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
var PATHS = {
  mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  rupee: '<path d="M7 5h10M7 9h10M13 19 8 13h2a4 4 0 0 0 0-8"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  note: '<path d="M6 4h9l4 4v12H6z"/><path d="M14 4v5h5M9 13h7M9 17h5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
  chart: '<path d="M4 19h16"/><path d="m5 15 4-5 4 3 6-7"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4 4 3 3-2 4 3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3V4z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  sunset: '<path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M4.9 8.9l1.4 1.4M19.1 8.9l-1.4 1.4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  plane: '<path d="M10.5 13.5 3 11l1.5-1.5 7.5 1L16 6.5a2 2 0 0 1 3 3L15 13.5l1 7.5L14.5 22.5 12 15z"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7h3"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 2.5 2V21M9 12l2-4 3 1 2 3M11 8l-2 5"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z"/>',
  ticket: '<path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4zM14 4v16" transform="translate(0 2) scale(1 .9)"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
  alert: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10.5v4M12 17v.01"/>'
};
function Icon({ name, size = 16, stroke = 2 }) {
  return /* @__PURE__ */ jsx2(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: stroke,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      dangerouslySetInnerHTML: { __html: PATHS[name] }
    }
  );
}

// src/blocks/actions/Actions.tsx
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
function Actions({ items }) {
  const { send } = useContext2(BlockActions);
  return /* @__PURE__ */ jsx3("div", { className: "hb-actions", children: items.map((a, i) => /* @__PURE__ */ jsxs("button", { type: "button", className: "hb-pill", title: a.run, onClick: () => send(a.run), children: [
    /* @__PURE__ */ jsx3(Icon, { name: "spark", size: 14, stroke: 2.2 }),
    a.label
  ] }, i)) });
}
function Button({ label, run, url }) {
  const { send } = useContext2(BlockActions);
  if (run) {
    return /* @__PURE__ */ jsx3("div", { className: "hb-actions", children: /* @__PURE__ */ jsxs("button", { type: "button", className: "hb-pill", title: run, onClick: () => send(run), children: [
      /* @__PURE__ */ jsx3(Icon, { name: "spark", size: 14, stroke: 2.2 }),
      label
    ] }) });
  }
  return /* @__PURE__ */ jsx3("div", { className: "hb-actions", children: /* @__PURE__ */ jsxs("a", { className: "hb-pill", href: url, target: "_blank", rel: "noreferrer", children: [
    /* @__PURE__ */ jsx3(Icon, { name: "globe", size: 14, stroke: 2.2 }),
    label
  ] }) });
}

// src/blocks/actions/read.ts
var MAX_BUTTONS = 3;
function readActions(raw, here) {
  const list = firstList([raw.items, raw.buttons]);
  if (!list) return here.drop("actions needs items");
  const items = [];
  list.forEach((item, i) => {
    const label = firstText([item?.label, item?.text], 40);
    const run = firstText([item?.run, item?.ask, item?.message], 300);
    if (!label || !run) {
      here.at("items").at(i).drop("button needs a label and a run message");
      return;
    }
    if (actsBeforeTheModel(run)) {
      here.at("items").at(i).drop(NO_SEND);
      return;
    }
    items.push({ label, run });
  });
  if (!items.length) return here.drop("actions has no usable button");
  return { type: "actions", items: keepFirst(items, MAX_BUTTONS, here, "buttons") };
}
function readButton(raw, here) {
  const label = firstText([raw.label, raw.text], 40);
  if (!label) return here.drop("button needs a label");
  const run = firstText([raw.run, raw.ask, raw.message], 300);
  const url = https(raw.url);
  if (!run && !url) return here.drop("button needs run or an https url");
  if (actsBeforeTheModel(run)) return here.drop(NO_SEND);
  return clean({ type: "button", label, run, url });
}

// src/blocks/atoms/Atoms.tsx
import { useState as useState2 } from "react";

// src/lib/locale.ts
function userLocale() {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
}
function usesLakhCrore() {
  return /-IN$/.test(userLocale());
}

// src/lib/format.ts
function formatIndian(v, digits) {
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits });
}
function formatChange(change, unit = "%") {
  if (change === null || change === void 0 || !isFinite(change)) return "";
  const v = Math.abs(change).toFixed(1);
  const u = unit === "pt" ? " pt" : "%";
  return change > 0 ? `\u25B2 ${v}${u}` : change < 0 ? `\u25BC ${v}${u}` : `${v}${u}`;
}
var MONEY = /^([$₹€£¥])(Cr|K|M|B)?$/;
var MONEY_IN_WORDS = /^([$₹€£¥])(\s?\p{L}[\p{L} .]{0,11})$/u;
function formatAmount(v, unit) {
  const usual = MONEY.exec(unit ?? "");
  const m = usual ?? MONEY_IN_WORDS.exec(unit ?? "");
  if (!m) return null;
  const [, sym, scale = ""] = m;
  const abs = Math.abs(v);
  const digits = abs >= 1e3 ? 0 : usual ? scale ? 1 : 2 : abs >= 100 ? 1 : 2;
  const n = sym === "\u20B9" ? formatIndian(abs, digits) : formatNumber(abs, { digits });
  return `${v < 0 ? "-" : ""}${sym}${n}${scale === "Cr" ? " Cr" : scale}`;
}
function formatNumber(v, { digits } = {}) {
  const abs = Math.abs(v);
  if (digits === void 0) digits = abs >= 1e3 ? 0 : abs >= 100 ? 1 : 2;
  return v.toLocaleString(userLocale(), { maximumFractionDigits: digits });
}
function formatCompact(v, locale = userLocale()) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
}
function formatPercent(v, digits = 1) {
  return `${formatNumber(v, { digits })}%`;
}
function formatWithUnit(v, unit) {
  const money = formatAmount(v, unit);
  if (money !== null) return money;
  const n = formatNumber(v);
  if (unit === "%") return `${n}%`;
  if (!unit) return n;
  const isPluralWord = /^[a-z]{3,}s$/i.test(unit);
  if (v === 1 && isPluralWord) return `${n} ${unit.slice(0, -1)}`;
  return `${n} ${unit}`;
}

// src/lib/InlineText.tsx
import { Fragment, jsx as jsx4 } from "react/jsx-runtime";
function InlineText({ text }) {
  const parts = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(/* @__PURE__ */ jsx4("strong", { children: match[1] }, match.index));
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return /* @__PURE__ */ jsx4(Fragment, { children: parts });
}

// src/blocks/atoms/Atoms.tsx
import { jsx as jsx5, jsxs as jsxs2 } from "react/jsx-runtime";
function Heading({ text }) {
  return /* @__PURE__ */ jsx5("div", { className: "hb-heading", children: /* @__PURE__ */ jsx5(InlineText, { text }) });
}
function Text({ text }) {
  return /* @__PURE__ */ jsx5("div", { className: "hb-text", children: /* @__PURE__ */ jsx5(InlineText, { text }) });
}
function Divider() {
  return /* @__PURE__ */ jsx5("div", { className: "hb-divider", role: "separator" });
}
function Badge({ text, tone: tone2 }) {
  return /* @__PURE__ */ jsx5("div", { className: "hb-badge", children: /* @__PURE__ */ jsx5("span", { className: `hb-chip hb-chip-${tone2 ?? "plain"}`, children: text }) });
}
function LinkLine({ text, url }) {
  return /* @__PURE__ */ jsx5("div", { className: "hb-link", children: /* @__PURE__ */ jsxs2("a", { href: url, target: "_blank", rel: "noreferrer", children: [
    /* @__PURE__ */ jsx5(Icon, { name: "globe", size: 14, stroke: 2.2 }),
    text
  ] }) });
}
function Picture({ url, caption }) {
  const [failed, setFailed] = useState2(false);
  if (failed) return null;
  return /* @__PURE__ */ jsxs2("figure", { className: "hb-image", children: [
    /* @__PURE__ */ jsx5("img", { src: url, alt: caption ?? "", loading: "lazy", referrerPolicy: "no-referrer", onError: () => setFailed(true) }),
    caption && /* @__PURE__ */ jsx5("figcaption", { children: caption })
  ] });
}
function barAmount(value, max, unit) {
  if (max === 100 && !unit) return `${value}%`;
  const money = formatAmount(value, unit);
  if (money !== null) return `${money} / ${formatAmount(max, unit)}`;
  const amount2 = `${formatNumber(value, { digits: 3 })} / ${formatNumber(max, { digits: 3 })}`;
  return unit ? `${amount2} ${unit}` : amount2;
}
function Bar({ label, value, max, unit }) {
  const share = Math.max(0, Math.min(1, value / max));
  return /* @__PURE__ */ jsxs2("div", { className: "hb-card hb-bar", children: [
    /* @__PURE__ */ jsxs2("div", { className: "hb-bar-head", children: [
      /* @__PURE__ */ jsx5("span", { className: "hb-bar-label", children: label }),
      /* @__PURE__ */ jsx5("span", { className: "hb-bar-amount", children: barAmount(value, max, unit) })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "hb-bar-track", children: /* @__PURE__ */ jsx5("span", { className: "hb-bar-fill", style: { width: `${share * 100}%` } }) })
  ] });
}

// src/blocks/atoms/read.ts
function readHeading(raw, here) {
  const text = firstText([raw.text, raw.title], 80);
  if (!text) return here.drop("heading needs text");
  return { type: "heading", text };
}
function readText(raw, here) {
  const text = firstWords([raw.text, raw.content, raw.body], 600);
  if (!text) return here.drop("text needs text");
  return { type: "text", text };
}
function readDivider() {
  return { type: "divider" };
}
function badgeTone(v) {
  const word = typeof v === "string" ? v.toLowerCase() : "";
  if (["good", "success", "positive", "ok"].includes(word)) return "good";
  if (["warn", "warning", "bad", "negative", "danger"].includes(word)) return "warn";
  return void 0;
}
function readBadge(raw, here) {
  const text = firstWords([raw.text, raw.label], 40);
  if (!text) return here.drop("badge needs text");
  return clean({ type: "badge", text, tone: badgeTone(raw.tone) });
}
function readLink(raw, here) {
  const url = https(raw.url) ?? https(raw.href);
  if (!url) return here.drop("link needs an https url");
  const text = firstText([raw.text, raw.label, raw.title], 80) ?? siteName(url);
  return { type: "link", text, url };
}
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function readImage(raw, here) {
  const url = https(raw.url) ?? https(raw.src) ?? https(raw.image);
  if (!url) return here.drop("image needs an https url");
  return clean({ type: "image", url, caption: firstText([raw.caption, raw.alt, raw.title], 80) });
}
function readBar(raw, here) {
  const label = firstText([raw.label, raw.title], 40);
  if (!label) return here.drop("bar needs a label");
  const value = num(raw.value);
  if (value === null) return here.drop("bar needs a numeric value");
  let max = num(raw.max) ?? num(raw.goal) ?? num(raw.total) ?? 100;
  if (max <= 0) max = 100;
  return clean({ type: "bar", label, value, max, unit: str(raw.unit, 12) });
}

// src/blocks/calculator/Calculator.tsx
import { useMemo as useMemo3 } from "react";

// src/core/blockState.ts
import { createContext as createContext3, useContext as useContext3, useEffect, useRef, useState as useState3 } from "react";

// src/core/living-identity.ts
var POSITIONAL_PATH = /^\d+(?:\.[A-Za-z_]+(?:\.\d+)*)*$/;
var PRESENTATION_KEYS = /* @__PURE__ */ new Set(["align", "text_align"]);
var DESCENDANTS = "\u25C7";
function holdsBlocks(v) {
  if (Array.isArray(v)) return v.some(holdsBlocks);
  if (v === null || typeof v !== "object") return false;
  if (typeof v.type === "string") return true;
  return Object.values(v).some(holdsBlocks);
}
function canonicalize(v, root) {
  if (!root && holdsBlocks(v)) return DESCENDANTS;
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((e) => canonicalize(e, false)).join(",")}]`;
  const o = v;
  const positional = typeof o.type === "string" && typeof o.path === "string" && POSITIONAL_PATH.test(o.path);
  const keys = Object.keys(o).filter((k) => !(positional && k === "path" || root && PRESENTATION_KEYS.has(k))).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(o[k], false)}`).join(",")}}`;
}
function identityOf(block) {
  const json = canonicalize(block, true);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}
var freshSeq = 0;
var mintOf = (b) => `${identityOf(b)}:~${freshSeq += 1}`;
var mounted = /* @__PURE__ */ new WeakMap();
var carried = /* @__PURE__ */ new WeakMap();
function noteMounted(block, key) {
  mounted.set(block, key);
}
function carriedKey(block) {
  return carried.get(block);
}
function mintKey(block) {
  return mintOf(block);
}
function existingKey(obj) {
  return carried.get(obj) ?? mounted.get(obj) ?? mintOf(obj);
}
var isBlock = (v) => typeof v === "object" && v !== null && !Array.isArray(v) && typeof v.type === "string";
function overlap(a, b) {
  const pool = /* @__PURE__ */ new Map();
  for (const x of a) pool.set(x, (pool.get(x) ?? 0) + 1);
  let n = 0;
  for (const y of b) {
    const c = pool.get(y) ?? 0;
    if (c > 0) {
      pool.set(y, c - 1);
      n += 1;
    }
  }
  return n;
}
function signatures(obj) {
  const exact = [];
  const kinds = [];
  const walkKinds = (v) => {
    if (Array.isArray(v)) {
      v.forEach(walkKinds);
      return;
    }
    if (v === null || typeof v !== "object") return;
    const t = v.type;
    if (typeof t === "string") {
      kinds.push(t);
      return;
    }
    Object.values(v).forEach(walkKinds);
  };
  for (const value of Object.values(obj)) {
    if (!holdsBlocks(value)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isBlock(item)) exact.push(identityOf(item));
      }
    }
    walkKinds(value);
  }
  return { exact, kinds };
}
function carryBlocks(prev, next) {
  carryList(prev ?? [], next);
}
function carryList(prev, next) {
  const cands = [];
  const nextSig = next.map((b) => signatures(b));
  const prevSig = prev.map((b) => signatures(b));
  for (let n = 0; n < next.length; n++) {
    if (!holdsOwnIdentity(next[n])) continue;
    for (let p = 0; p < prev.length; p++) {
      if (!holdsOwnIdentity(prev[p]) || identityOf(prev[p]) !== identityOf(next[n])) continue;
      const score = 2 * overlap(nextSig[n].exact, prevSig[p].exact) + overlap(nextSig[n].kinds, prevSig[p].kinds);
      cands.push({ n, p, score });
    }
  }
  cands.sort((a, b) => b.score - a.score || Math.abs(a.n - a.p) - Math.abs(b.n - b.p) || a.p - b.p || a.n - b.n);
  const pairOf = /* @__PURE__ */ new Map();
  const prevTaken = /* @__PURE__ */ new Set();
  for (const c of cands) {
    if (pairOf.has(c.n) || prevTaken.has(c.p)) continue;
    pairOf.set(c.n, c.p);
    prevTaken.add(c.p);
  }
  const assigned = /* @__PURE__ */ new Set();
  for (let n = 0; n < next.length; n++) {
    const item = next[n];
    if (typeof item !== "object" || item === null) continue;
    const p = pairOf.get(n);
    let key = p === void 0 ? void 0 : existingKey(prev[p]);
    if (key !== void 0 && assigned.has(key)) key = void 0;
    if (key === void 0) key = mintOf(item);
    else if (p !== void 0) carriedFrom.set(item, prev[p]);
    assigned.add(key);
    carried.set(item, key);
  }
  for (let n = 0; n < next.length; n++) {
    const p = pairOf.get(n);
    carryFields(p === void 0 ? null : prev[p], next[n]);
  }
}
function holdsOwnIdentity(v) {
  return isBlock(v) || isHolderWithBlocks(v);
}
function carryFields(pv, nv) {
  if (typeof nv !== "object" || nv === null) return;
  const po = typeof pv === "object" && pv !== null && !Array.isArray(pv) ? pv : {};
  for (const [k, value] of Object.entries(nv)) {
    if (!holdsBlocks(value)) continue;
    const before = po[k];
    if (Array.isArray(value)) {
      carryList(Array.isArray(before) ? before : [], value);
    } else if (isBlock(value)) {
      carryList(before !== void 0 && holdsBlocks(before) ? [before] : [], [value]);
    } else {
      carryFields(isHolderWithBlocks(before) ? before : null, value);
    }
  }
}
function isHolderWithBlocks(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && holdsBlocks(v);
}
function kkey(slot) {
  return `k:${slot}`;
}
function eachSlot(root, visit, prefix = "") {
  slotList(root, visit, prefix);
}
function slotList(list, visit, prefix) {
  const seen = /* @__PURE__ */ new Map();
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const id = identityOf(item);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    const flat = `${id}:${n}`;
    const full = prefix === "" ? flat : `${prefix}/${flat}`;
    const block = isBlock(item);
    if (block) visit(item, full, flat);
    slotDescend(item, visit, block ? full : prefix);
  }
}
function slotDescend(block, visit, full) {
  if (typeof block !== "object" || block === null) return;
  for (const value of Object.values(block)) slotValue(value, visit, full);
}
function slotValue(value, visit, full) {
  if (!holdsBlocks(value)) return;
  if (Array.isArray(value)) {
    slotList(value, visit, full);
    return;
  }
  if (isBlock(value)) {
    slotList([value], visit, full);
    return;
  }
  slotDescend(value, visit, full);
}
var carriedFrom = /* @__PURE__ */ new WeakMap();
function carrySource(block) {
  return carriedFrom.get(block);
}

// src/blocks/checklist/savedState.ts
var boards = /* @__PURE__ */ new Map();
var living = /* @__PURE__ */ new Set();
var migratedWalk = /* @__PURE__ */ new Map();
var stored = /* @__PURE__ */ new Map();
var queued = /* @__PURE__ */ new Map();
var timers = /* @__PURE__ */ new Map();
var DOOR_DELAY = 150;
function stateIn(answer) {
  const state = answer?.state;
  if (state && typeof state === "object" && !Array.isArray(state)) return { ...state };
  return {};
}
function loadBoardState(rest, blockId) {
  const known = boards.get(blockId);
  if (known) return known.loaded;
  const board = { state: {}, loaded: Promise.resolve({}), saving: Promise.resolve(), ready: false };
  board.loaded = rest(`/blocks/${blockId}/state`).then(
    (answer) => {
      Object.assign(board.state, stateIn(answer));
      board.ready = true;
      return board.state;
    },
    () => {
      boards.delete(blockId);
      return {};
    }
  );
  boards.set(blockId, board);
  return board.loaded;
}
function peekState(blockId) {
  const board = boards.get(blockId);
  return board !== void 0 && board.ready ? board.state : null;
}
async function saveBoardValue(rest, blockId, key, value) {
  await loadBoardState(rest, blockId);
  const board = boards.get(blockId);
  if (!board) return;
  board.state[key] = value;
  const snapshot = { ...board.state };
  board.saving = board.saving.then(() => rest(`/blocks/${blockId}/state`, { method: "PUT", body: { state: snapshot } })).then(() => {
  }, () => {
  });
  await board.saving;
}
function markLiving(blockId) {
  living.add(blockId);
}
function isLiving(blockId) {
  return living.has(blockId);
}
function seedValue(state, key) {
  return state[key];
}
function peekStored(blockId, cacheKey) {
  const key = `${blockId}\0${cacheKey}`;
  return stored.has(key) ? { value: stored.get(key) } : void 0;
}
function recordValue(rest, blockId, cacheKey, doorKey, value, door) {
  if (cacheKey !== null) stored.set(`${blockId}\0${cacheKey}`, value);
  const state = peekState(blockId);
  if (state !== null && door !== "never") state[doorKey] = value;
  if (!rest || door === "never") return;
  if (door === "now") {
    void saveBoardValue(rest, blockId, doorKey, value);
    return;
  }
  const key = `${blockId}\0${doorKey}`;
  queued.set(key, { rest, value });
  if (!timers.has(key)) {
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      const pending = queued.get(key);
      if (pending !== void 0) {
        queued.delete(key);
        const at2 = key.indexOf("\0");
        void saveBoardValue(pending.rest, key.slice(0, at2), key.slice(at2 + 1), pending.value);
      }
    }, DOOR_DELAY));
  }
}
function forgetBlock(blockId) {
  const prefix = `${blockId}\0`;
  for (const [key, item] of [...queued]) {
    if (!key.startsWith(prefix)) continue;
    queued.delete(key);
    const timer = timers.get(key);
    if (timer !== void 0) clearTimeout(timer);
    timers.delete(key);
    void saveBoardValue(item.rest, blockId, key.slice(prefix.length), item.value);
  }
  living.delete(blockId);
  migratedWalk.delete(blockId);
}
function trailsFrom(prev, next) {
  const trails = /* @__PURE__ */ new Map();
  if (prev === null) return trails;
  const prevFull = /* @__PURE__ */ new Map();
  const prevFlat = /* @__PURE__ */ new Map();
  eachSlot(prev, (block, full, flat) => {
    prevFull.set(block, full);
    const position = block.path;
    const seen = prevFlat.get(flat);
    if (seen === void 0) {
      prevFlat.set(flat, { from: full, position: typeof position === "string" ? position : void 0, count: 1 });
    } else {
      seen.count += 1;
    }
  });
  eachSlot(next, (block, full, flat) => {
    const src = carrySource(block);
    if (src !== void 0) {
      const was = prevFull.get(src);
      if (was !== void 0) {
        const position = src.path;
        trails.set(block, { from: was, position: typeof position === "string" ? position : void 0 });
      }
      return;
    }
    const cand = prevFlat.get(flat);
    if (cand !== void 0 && cand.count === 1 && cand.from !== full) {
      trails.set(block, { from: cand.from, position: cand.position });
    }
  });
  return trails;
}
async function promoteOnUpdate(rest, blockId, prev, next) {
  living.add(blockId);
  const trails = trailsFrom(prev, next);
  eachSlot(next, (block, full) => {
    const came = trails.get(block);
    if (came === void 0 || came.from === full) return;
    const from = `${blockId}\0${came.from}`;
    for (const [key, value] of [...stored]) {
      if (!key.startsWith(from)) continue;
      const suffix = key.slice(from.length);
      if (suffix !== "" && suffix[0] !== "/" && suffix[0] !== "~") continue;
      const target = `${blockId}\0${full}${suffix}`;
      if (!stored.has(target)) stored.set(target, value);
    }
  });
  if (rest === void 0) return;
  const board = boards.get(blockId);
  if (board !== void 0 && board.ready) {
    fileDoor(board, blockId, rest, next, trails);
    return;
  }
  await loadBoardState(rest, blockId);
  const now = boards.get(blockId);
  if (now !== void 0) fileDoor(now, blockId, rest, next, trails);
}
function fileDoor(board, blockId, rest, next, trails) {
  const state = board.state;
  const claimed = /* @__PURE__ */ new Set();
  let dirty = false;
  const prefix = `${blockId}\0`;
  for (const [key, value] of stored) {
    if (!key.startsWith(prefix)) continue;
    const dk = kkey(key.slice(prefix.length));
    if (state[dk] === void 0) {
      state[dk] = value;
      dirty = true;
    }
  }
  eachSlot(next, (block, full) => {
    const key = kkey(full);
    if (state[key] !== void 0) return;
    const came = trails.get(block);
    if (came === void 0) return;
    const moved = came.from === full ? void 0 : state[kkey(came.from)];
    if (moved !== void 0) {
      state[key] = moved;
      dirty = true;
      return;
    }
    if (came.position !== void 0 && state[came.position] !== void 0 && !claimed.has(came.position)) {
      state[key] = state[came.position];
      claimed.add(came.position);
      dirty = true;
    }
  });
  if (!dirty) return;
  const snapshot = { ...state };
  board.saving = board.saving.then(() => rest(`/blocks/${blockId}/state`, { method: "PUT", body: { state: snapshot } })).then(() => {
  }, () => {
  });
}
var POSITION_KEY = /^\d+(?:\.[A-Za-z_]+(?:\.\d+)*)*$/;
function splitKKey(key) {
  const slot = key.slice(2);
  const tilde = slot.indexOf("~");
  return tilde < 0 ? { chain: slot, field: "" } : { chain: slot.slice(0, tilde), field: slot.slice(tilde) };
}
async function migrateArchived(rest, blockId, loadVersion, next, version2) {
  living.add(blockId);
  if (rest === void 0 || version2 < 2) return;
  if ((migratedWalk.get(blockId) ?? 0) >= version2) return;
  migratedWalk.set(blockId, version2);
  await loadBoardState(rest, blockId);
  const board = boards.get(blockId);
  if (board === void 0 || !board.ready) return;
  const state = board.state;
  const here = /* @__PURE__ */ new Set();
  eachSlot(next, (_block, full) => here.add(full));
  const orphans = [];
  for (const key of Object.keys(state)) {
    if (POSITION_KEY.test(key)) {
      orphans.push(key);
    } else if (key.startsWith("k:")) {
      if (!here.has(splitKKey(key).chain)) orphans.push(key);
    }
  }
  if (orphans.length === 0) return;
  const specs = /* @__PURE__ */ new Map([[version2, next]]);
  const specOf = async (v) => {
    if (!specs.has(v)) {
      let read = null;
      try {
        const answer = await loadVersion(v);
        if (answer !== null && answer.length > 0) read = answer;
      } catch {
        read = null;
      }
      specs.set(v, read);
    }
    return specs.get(v) ?? null;
  };
  const chainsAt = async (v) => {
    const spec = await specOf(v);
    if (spec === null) return null;
    const set = /* @__PURE__ */ new Set();
    eachSlot(spec, (_block, full) => set.add(full));
    return set;
  };
  const stepMap = async (from, to) => {
    const prev = await specOf(from);
    const nx = await specOf(to);
    if (prev === null || nx === null) return null;
    const trails = trailsFrom(prev, nx);
    const map = /* @__PURE__ */ new Map();
    eachSlot(nx, (block, full) => {
      const came = trails.get(block);
      if (came !== void 0) map.set(came.from, full);
    });
    return map;
  };
  let position1;
  const positionsOfV1 = async () => {
    if (position1 === void 0) {
      const spec = await specOf(1);
      position1 = spec === null ? null : (() => {
        const map = /* @__PURE__ */ new Map();
        eachSlot(spec, (block, full) => {
          const at2 = block.path;
          if (typeof at2 === "string") map.set(at2, full);
        });
        return map;
      })();
    }
    return position1;
  };
  let dirty = false;
  for (const key of orphans) {
    const value = state[key];
    let chain;
    let field = "";
    let origin;
    if (key.startsWith("k:")) {
      const parts = splitKKey(key);
      chain = parts.chain;
      field = parts.field;
      origin = -1;
      for (let v = version2 - 1; v >= 1; v--) {
        const at2 = await chainsAt(v);
        if (at2 !== null && at2.has(chain)) {
          origin = v;
          break;
        }
      }
      if (origin < 0) continue;
    } else {
      const slots = await positionsOfV1();
      if (slots === null) continue;
      const from = slots.get(key);
      if (from === void 0) continue;
      chain = from;
      origin = 1;
    }
    let cur = chain;
    let lost = false;
    for (let v = origin + 1; v <= version2; v++) {
      const at2 = await chainsAt(v);
      if (at2 === null) {
        lost = true;
        break;
      }
      if (at2.has(cur)) continue;
      const moved = (await stepMap(v - 1, v))?.get(cur);
      if (moved === void 0) {
        lost = true;
        break;
      }
      cur = moved;
    }
    if (lost || !here.has(cur)) continue;
    const target = kkey(cur + field);
    if (state[target] === void 0) {
      state[target] = value;
      dirty = true;
    }
  }
  if (!dirty) return;
  const snapshot = { ...state };
  board.saving = board.saving.then(() => rest(`/blocks/${blockId}/state`, { method: "PUT", body: { state: snapshot } })).then(() => {
  }, () => {
  });
}
function toggleTick(ticks, i) {
  if (ticks.includes(i)) return ticks.filter((t) => t !== i);
  return [...ticks, i].sort((a, b) => a - b);
}
function readTicks(saved, count) {
  if (!Array.isArray(saved)) return null;
  const ticks = /* @__PURE__ */ new Set();
  for (const t of saved) {
    if (Number.isInteger(t) && t >= 0 && t < count) ticks.add(t);
  }
  return [...ticks].sort((a, b) => a - b);
}

// src/core/blockState.ts
var BlockSlot = createContext3(null);
function useStoredValue(spec) {
  const { rest, blockId } = useContext3(BlockActions);
  const chain = useContext3(BlockSlot);
  const living2 = blockId !== void 0 && chain !== null && isLiving(blockId);
  const idKey = chain === null ? null : `${chain}${spec.field ?? ""}`;
  const legacy = `${spec.path ?? ""}${spec.field ?? ""}`;
  const transient = spec.door === "identity";
  const byIdentity = transient ? idKey !== null : living2 && idKey !== null;
  const doorKey = byIdentity && idKey !== null ? kkey(idKey) : legacy;
  const touched = useRef(false);
  const [value, setValue] = useState3(() => {
    if (blockId === void 0 || idKey === null) return spec.initial();
    if (!byIdentity) return spec.initial();
    const held = peekStored(blockId, idKey);
    if (held === void 0) return spec.initial();
    return spec.revive(held.value) ?? spec.initial();
  });
  useEffect(() => {
    if (!rest || blockId === void 0) return;
    if (transient && idKey === null) return;
    let live = true;
    void loadBoardState(rest, blockId).then((state) => {
      if (!live || touched.current || (spec.skip?.() ?? false)) return;
      const saved = seedValue(state, doorKey);
      if (saved === void 0) return;
      const revived = spec.revive(saved);
      if (revived !== null) setValue(revived);
    });
    return () => {
      live = false;
    };
  }, [rest, blockId, doorKey, living2]);
  const commit = (next, isTouched = true) => {
    if (isTouched) touched.current = true;
    setValue(next);
    if (blockId === void 0) return;
    if (!isTouched) return;
    if (transient && idKey === null) return;
    const door = !rest ? "never" : spec.door === "always" ? "now" : "coalesce";
    recordValue(rest, blockId, idKey, doorKey, spec.stored(next), door);
  };
  return [value, commit];
}

// src/blocks/chart/geometry.ts
function textWidth(text, size = 11) {
  return text.length * size * 0.6;
}
function xLabelsShown(n, step, minGap) {
  if (n <= 1 || step <= 0) return [0];
  const every = Math.max(1, Math.ceil(minGap / step));
  const shown = [];
  for (let i = 0; i < n; i += every) shown.push(i);
  return shown;
}
var MAX_SLOT = 96;
var MIN_BAR = 14;
var MAX_BAR = 56;
function columnLayout(plotWidth, n, seriesCount) {
  const slot = Math.min(plotWidth / Math.max(n, 1), MAX_SLOT);
  const wanted = Math.min(Math.max(slot * 0.6 / seriesCount, MIN_BAR), MAX_BAR);
  const bar = Math.min(wanted, slot * 0.9 / seriesCount);
  return { slot, bar, start: (plotWidth - slot * n) / 2 };
}
function barPath(x, width, base, end, radius = 4) {
  const f = (n) => +n.toFixed(1);
  const r = Math.min(radius, width / 2, Math.abs(base - end));
  const toward = end < base ? 1 : -1;
  const x2 = x + width;
  return `M${f(x)},${f(base)}V${f(end + toward * r)}Q${f(x)},${f(end)} ${f(x + r)},${f(end)}H${f(x2 - r)}Q${f(x2)},${f(end)} ${f(x2)},${f(end + toward * r)}V${f(base)}Z`;
}
var STRAIGHT_UP_TO = 12;
function linePath(pts) {
  if (pts.length > STRAIGHT_UP_TO) return smoothPath(pts);
  const f = (n) => +n.toFixed(1);
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join("");
}
function smoothPath(pts) {
  if (!pts.length) return "";
  const f = (n) => +n.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
function spreadLabels(ys, gap = 14, bottom = Infinity) {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  const placed = order.map((i) => ys[i]);
  for (let k = 1; k < placed.length; k++) placed[k] = Math.max(placed[k], placed[k - 1] + gap);
  if (placed.length && placed[placed.length - 1] > bottom) {
    placed[placed.length - 1] = bottom;
    for (let k = placed.length - 2; k >= 0; k--) placed[k] = Math.min(placed[k], placed[k + 1] - gap);
  }
  const out = new Array(ys.length);
  order.forEach((i, k) => out[i] = placed[k]);
  return out;
}
function niceTicks(lo, hi, steps = 3) {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const raw = (hi - lo) / steps;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = power * ([1, 2, 2.5, 5].find((f) => raw / power <= f) ?? 10);
  const ticks = [];
  for (let k = Math.floor(lo / step); k <= Math.ceil(hi / step); k++) ticks.push(+(k * step).toFixed(10));
  return ticks;
}

// src/blocks/chart/chartData.ts
var CHART_KINDS = ["line", "bar", "area", "stacked", "hbar", "combo", "pie", "donut", "scatter", "histogram", "gauge", "bullet", "funnel", "pareto", "waterfall", "radar", "control", "bubble", "box", "treemap"];
var KIND_ALIASES = {
  doughnut: "donut",
  stackedbar: "stacked",
  horizontalbar: "hbar",
  barh: "hbar",
  hist: "histogram",
  dial: "gauge",
  speedometer: "gauge",
  bulletgraph: "bullet"
};
function chartKind(name) {
  if (typeof name !== "string") return "line";
  const plain = name.toLowerCase().replace(/[\s_-]/g, "");
  const known = CHART_KINDS.find((k) => k === plain);
  if (known) return known;
  return KIND_ALIASES[plain] ?? "line";
}
function maxSeries(kind) {
  if (kind === "stacked" || kind === "area") return 6;
  if (kind === "histogram" || kind === "gauge" || kind === "funnel" || kind === "pareto" || kind === "waterfall" || kind === "control" || kind === "treemap") return 1;
  if (kind === "bullet" || kind === "bubble") return 2;
  if (kind === "box") return 8;
  return 3;
}
function isOnRightScale(kind, index, seriesUnit, axis, chartUnit) {
  if (kind !== "combo" || index === 0) return false;
  if (axis === "right") return true;
  return seriesUnit !== void 0 && seriesUnit !== chartUnit;
}
var MONTH = "(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\\.?";
var YEAR = "('?\\d{2}|\\d{4})";
var FY = `(fy\\s*)?${YEAR}([-/]\\d{2,4})?`;
var ORDERED = [
  `-?\\d+(\\.\\d+)?`,
  // 2024, 7, 0.25
  `${MONTH}(\\s*[-'\u2019/]?\\s*${YEAR})?`,
  // Jan, March 2025, Jan '25, Jan-25
  `\\d{1,2}\\s+${MONTH}(,?\\s+${YEAR})?`,
  // 12 Oct, 12 Oct 2025
  `${MONTH}\\s+\\d{1,2}(,?\\s+\\d{4})?`,
  // Oct 12, Oct 12, 2025
  `q[1-4](\\s*[-'\u2019]?\\s*${FY})?`,
  // Q1, Q3 2025, Q1 FY25, Q4'24
  `${FY}\\s*-?\\s*q[1-4]`,
  // 2025 Q1, FY25 Q2
  `fy\\s*${YEAR}([-/]\\d{2,4})?`,
  // FY24, FY2024-25, FY 24-25
  `\\d{4}-\\d{2}(-\\d{2}([t ].*)?)?`,
  // 2025-11, 2025-11-03, 2025-11-03T09:15
  `\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}`,
  // 03/11/2025, 3.11.25
  `(year|yr|month|week|wk|day|hour|hr)s?\\s*\\d+`
  // Year 3, Week 12
].map((p) => new RegExp(`^${p}$`, "i"));
function isOrderedLabel(label) {
  const text = String(label).trim();
  return ORDERED.some((re) => re.test(text));
}
function kindToDraw(spec) {
  if (spec.type !== "bar") return spec.type;
  const { x } = spec;
  if (x.every(isOrderedLabel)) return "bar";
  const lieDown = x.some((label) => String(label).length > 12) || x.length >= 2 && x.length <= 3 || spec.series.length === 1 && x.length >= 9;
  return lieDown ? "hbar" : "bar";
}
function changePct(data) {
  const v = data.filter((x) => x !== null);
  if (v.length < 2 || v[0] === 0) return null;
  return (v[v.length - 1] - v[0]) / Math.abs(v[0]) * 100;
}
var MAX_SLICES = 8;
function pieSlices(x, data) {
  const slices2 = [];
  data.forEach((v, i) => {
    if (v !== null && v > 0 && i < x.length) slices2.push({ label: x[i], value: v });
  });
  if (slices2.length <= MAX_SLICES) return { x: slices2.map((s) => s.label), data: slices2.map((s) => s.value) };
  const biggestFirst = [...slices2].sort((a, b) => b.value - a.value);
  const kept = new Set(biggestFirst.slice(0, MAX_SLICES - 1));
  const shown = slices2.filter((s) => kept.has(s));
  let other = 0;
  for (const s of slices2) if (!kept.has(s)) other += s.value;
  return { x: [...shown.map((s) => s.label), "Other"], data: [...shown.map((s) => s.value), other] };
}
function histogramBins(values) {
  if (!values.length) return { labels: [], counts: [] };
  const edges = niceTicks(Math.min(...values), Math.max(...values), 5);
  const step = edges.length > 1 ? edges[1] - edges[0] : 1;
  const counts = new Array(Math.max(edges.length - 1, 1)).fill(0);
  for (const v of values) {
    const k = Math.min(counts.length - 1, Math.max(0, Math.floor((v - edges[0]) / step + 1e-9)));
    counts[k]++;
  }
  const labels2 = counts.map((_, k) => `${fmt(edges[k])}\u2013${fmt(edges[k + 1])}`);
  return { labels: labels2, counts };
}
function stackSeries(series, n) {
  const up = new Array(n).fill(0);
  const down = new Array(n).fill(0);
  return series.map((s) => {
    const bands = [];
    for (let i = 0; i < n; i++) {
      const v = s.data[i] ?? null;
      if (v === null) {
        bands.push(null);
      } else if (v >= 0) {
        bands.push({ from: up[i], to: up[i] + v });
        up[i] += v;
      } else {
        bands.push({ from: down[i], to: down[i] + v });
        down[i] += v;
      }
    }
    return bands;
  });
}
function totalAt(series, i) {
  let total = null;
  for (const s of series) {
    const v = s.data[i] ?? null;
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}
function scaleFor(values, fromZero) {
  if (!values.length) return { min: 0, max: 1 };
  let lo = Math.min(...values);
  const hi = Math.max(...values);
  if (fromZero) lo = Math.min(0, lo);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
  const startsAtZero = fromZero && lo >= 0;
  return { min: startsAtZero ? 0 : lo - pad, max: hi + pad };
}
function partColour(k) {
  return `var(--hb-chart-${k % 8 + 1})`;
}
function sharePct(share) {
  const pct = share * 100;
  if (pct < 10) return `${+pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}
function shareNote(values, v) {
  const known = values.filter((d) => d !== null);
  const total = known.reduce((sum, d) => sum + d, 0);
  if (known.some((d) => d < 0) || total <= 0) return void 0;
  return `${sharePct(v / total)} of total`;
}
function seriesName(series, k) {
  return series[k].name ?? (series.length === 1 ? "Value" : `Series ${k + 1}`);
}
function chartScales(spec, bands) {
  if (bands) {
    const ends = bands.flat().flatMap((b) => b === null ? [] : [b.from, b.to]);
    return { left: scaleFor(ends, true), right: null };
  }
  const leftValues = spec.series.filter((s) => !s.right).flatMap((s) => numbersOf(s.data));
  const rightValues = spec.series.filter((s) => s.right).flatMap((s) => numbersOf(s.data));
  const fromZero = spec.type === "bar" || spec.type === "combo" || spec.type === "histogram";
  const right = rightValues.length ? scaleFor(rightValues, false) : null;
  return { left: scaleFor(leftValues, fromZero), right };
}
function numbersOf(data) {
  return data.filter((v) => v !== null);
}
var SHORT_FROM = 1e5;
var MAX_UNIT = 12;
function fmt(v, unit, { full = false } = {}) {
  const scaled = (unit?.length ?? 0) > 1 ? formatAmount(v, unit) : null;
  if (scaled !== null) return scaled;
  if (unit === "%") return formatPercent(v);
  const abs = Math.abs(v);
  const rupees = unit === "\u20B9" || unit === "INR";
  const sign = rupees ? "\u20B9" : unit && /^[$€£¥]$/.test(unit) ? unit : "";
  const short = !full && abs >= SHORT_FROM;
  const digits = abs >= 1e3 ? 0 : 2;
  const s = short ? formatCompact(abs, rupees || usesLakhCrore() ? "en-IN" : void 0) : rupees ? formatIndian(abs, digits) : formatNumber(abs, { digits });
  const signed = `${v < 0 ? "-" : ""}${sign}${s}`;
  return sign || !unit || unit === "pts" || unit.length > MAX_UNIT ? signed : `${signed} ${unit}`;
}

// src/lib/formula.ts
var MAX_LENGTH = 300;
var MAX_DEPTH = 30;
var HELPERS = {
  min: [1, 10],
  max: [1, 10],
  round: [1, 2],
  abs: [1, 1],
  if: [3, 3],
  emi: [3, 3],
  sip: [3, 3],
  pct: [2, 2],
  prepay_years: [4, 4],
  prepay_interest: [4, 4],
  balance: [4, 4],
  principal_paid: [4, 4],
  interest_paid: [4, 4],
  sip_value: [3, 3]
};
function isHelper(name) {
  return Object.hasOwn(HELPERS, name);
}
var TOKEN = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|[-+*/^(),<>]))/iy;
function tokenize(text) {
  if (text.length > MAX_LENGTH) throw new Error("formula too long");
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const from = TOKEN.lastIndex;
    if (/^\s*$/.test(text.slice(from))) break;
    const m = TOKEN.exec(text);
    if (!m) throw new Error(`can't read "${text.slice(from).trim().slice(0, 12)}"`);
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}
function parseFormula(text) {
  const tokens = tokenize(text);
  let at2 = 0;
  let depth = 0;
  const peek = () => tokens[at2];
  const take = (want) => {
    const t = tokens[at2];
    if (want !== void 0 && t !== want) throw new Error(`expected ${want}`);
    at2 += 1;
    return t;
  };
  const deeper = () => {
    depth += 1;
    if (depth > MAX_DEPTH) throw new Error("formula nests too deep");
  };
  function comparison() {
    const left = sum();
    if (["<", "<=", ">", ">=", "==", "!="].includes(peek())) return { kind: "binary", op: take(), left, right: sum() };
    return left;
  }
  function sum() {
    let left = product();
    while (peek() === "+" || peek() === "-") left = { kind: "binary", op: take(), left, right: product() };
    return left;
  }
  function product() {
    let left = unary();
    while (peek() === "*" || peek() === "/") left = { kind: "binary", op: take(), left, right: unary() };
    return left;
  }
  function unary() {
    deeper();
    let node;
    if (peek() === "-") {
      take();
      node = { kind: "negate", arg: unary() };
    } else if (peek() === "+") {
      take();
      node = unary();
    } else node = power();
    depth -= 1;
    return node;
  }
  function power() {
    const base = primary();
    if (peek() === "^") {
      take();
      return { kind: "binary", op: "^", left: base, right: unary() };
    }
    return base;
  }
  function primary() {
    const t = take();
    if (t === void 0) throw new Error("formula ends too soon");
    if (/^[\d.]/.test(t)) return { kind: "number", value: Number(t) };
    if (t === "(") {
      const inside2 = comparison();
      take(")");
      return inside2;
    }
    if (!/^[A-Za-z_]/.test(t)) throw new Error(`unexpected "${t}"`);
    if (peek() !== "(") return { kind: "name", name: t };
    if (!isHelper(t)) throw new Error(`unknown helper ${t}()`);
    take("(");
    const args = [comparison()];
    while (peek() === ",") {
      take();
      args.push(comparison());
    }
    take(")");
    const [fewest, most] = HELPERS[t];
    if (args.length < fewest || args.length > most) throw new Error(`${t}() takes ${fewest === most ? fewest : `${fewest}-${most}`} values`);
    return { kind: "call", fn: t, args };
  }
  const tree = comparison();
  if (at2 < tokens.length) throw new Error(`unexpected "${tokens[at2]}"`);
  return tree;
}
function namesIn(node, found = /* @__PURE__ */ new Set()) {
  if (node.kind === "name") found.add(node.name);
  if (node.kind === "negate") namesIn(node.arg, found);
  if (node.kind === "binary") {
    namesIn(node.left, found);
    namesIn(node.right, found);
  }
  if (node.kind === "call") node.args.forEach((a) => namesIn(a, found));
  return [...found];
}
function newBudget(operations) {
  return { left: operations };
}
function spend(budget, n = 1) {
  if (!budget) return;
  budget.left -= n;
  if (budget.left < 0) throw new Error("too much work");
}
function evaluate(formula, values, budget) {
  try {
    const tree = typeof formula === "string" ? parseFormula(formula) : formula;
    const result = valueOf(tree, values, budget);
    if (!Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}
function valueOf(node, values, budget) {
  spend(budget);
  const of = (n) => valueOf(n, values, budget);
  switch (node.kind) {
    case "number":
      return node.value;
    case "name": {
      const v = values.get(node.name);
      if (v === void 0) throw new Error(`unknown name ${node.name}`);
      return v;
    }
    case "negate":
      return -of(node.arg);
    case "binary":
      return binary(node.op, of(node.left), of(node.right));
    case "call": {
      if (node.fn === "if") return of(node.args[0]) !== 0 ? of(node.args[1]) : of(node.args[2]);
      return helper(node.fn, node.args.map(of), budget);
    }
  }
}
function binary(op, a, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return divide(a, b);
  if (op === "^") return a ** b;
  const comparisons = { "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "==": a === b, "!=": a !== b };
  return comparisons[op] ? 1 : 0;
}
function divide(a, b) {
  if (b === 0) throw new Error("division by zero");
  return a / b;
}
function helper(fn, args, budget) {
  switch (fn) {
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "abs":
      return Math.abs(args[0]);
    case "round":
      return roundTo(args[0], args[1] ?? 0);
    case "pct":
      return divide(args[0], args[1]) * 100;
    case "emi":
      return emi(args[0], args[1], args[2]);
    case "sip":
      return sip(args[0], args[1], args[2]);
    case "prepay_years":
      return prepay(args[0], args[1], args[2], args[3], budget).months / 12;
    case "prepay_interest":
      return prepay(args[0], args[1], args[2], args[3], budget).interest;
    case "balance":
      return balance(args[0], args[1], args[2], args[3]);
    case "principal_paid":
      return principalPaid(args[0], args[1], args[2], args[3]);
    case "interest_paid":
      return interestPaid(args[0], args[1], args[2], args[3]);
    case "sip_value":
      return sip(args[0], args[1], args[2]);
  }
  throw new Error(`unknown helper ${fn}()`);
}
function roundTo(x, digits) {
  const scale = 10 ** Math.round(digits);
  return Math.round(x * scale) / scale;
}
var MAX_YEARS = 100;
function termMonths(years) {
  if (!(years <= MAX_YEARS)) throw new Error(`a loan term is at most ${MAX_YEARS} years`);
  return years * 12;
}
function emi(principal, ratePct, years) {
  const months = termMonths(years);
  if (months <= 0) throw new Error("emi needs a term");
  const r = ratePct / 12 / 100;
  if (r === 0) return principal / months;
  const growth = (1 + r) ** months;
  return principal * r * growth / (growth - 1);
}
function sip(monthly, ratePct, years) {
  const months = years * 12;
  const i = ratePct / 12 / 100;
  if (i === 0) return monthly * months;
  return monthly * ((1 + i) ** months - 1) / i * (1 + i);
}
function balance(principal, ratePct, years, afterYears) {
  const months = termMonths(years);
  if (months <= 0) throw new Error("balance needs a term");
  const paid = afterYears * 12;
  if (paid <= 0) return principal;
  if (paid >= months) return 0;
  const r = ratePct / 12 / 100;
  if (r === 0) return principal * (1 - paid / months);
  const growth = (1 + r) ** paid;
  return Math.max(0, principal * growth - emi(principal, ratePct, years) * (growth - 1) / r);
}
function principalPaid(principal, ratePct, years, afterYears) {
  return principal - balance(principal, ratePct, years, afterYears);
}
function interestPaid(principal, ratePct, years, afterYears) {
  const monthsPaid = Math.min(Math.max(afterYears * 12, 0), years * 12);
  return emi(principal, ratePct, years) * monthsPaid - principalPaid(principal, ratePct, years, afterYears);
}
function prepay(principal, ratePct, years, yearlyExtra, budget) {
  if (yearlyExtra < 0) throw new Error("the yearly extra can't be negative");
  const monthly = emi(principal, ratePct, years);
  const r = ratePct / 12 / 100;
  const lastMonth = Math.ceil(termMonths(years));
  let owed = principal;
  let interest = 0;
  let months = 0;
  while (owed > 5e-3 && months < lastMonth) {
    spend(budget);
    months += 1;
    const thisMonth = owed * r;
    interest += thisMonth;
    owed = Math.max(0, owed + thisMonth - monthly);
    if (months % 12 === 0) owed = Math.max(0, owed - yearlyExtra);
  }
  return { months, interest };
}

// src/blocks/calculator/calcChart.ts
var MAX_POINTS = 200;
var MAX_SERIES = 3;
var MAX_CHART_WORK = 1e6;
var ID = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
function readCalcChart(raw, ids, here) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return here.drop("chart must be an object") ?? void 0;
  const x = raw.x && typeof raw.x === "object" ? raw.x : {};
  const name = str(x.name, 24);
  const nameProblem = !name || !ID.test(name) ? 'x needs a name like "y"' : ids.includes(name) ? `x name "${name}" is an input's id` : isHelper(name) ? `x name "${name}" is a helper's name` : null;
  if (nameProblem) return here.drop(nameProblem) ?? void 0;
  const from = bound(x.from) ?? 0;
  const to = bound(x.to);
  const step = bound(x.step) ?? 1;
  if (to === null) return here.drop("x needs from, to and step (numbers or formulas)") ?? void 0;
  const series = [];
  (firstList([raw.series]) ?? []).forEach((s, i) => {
    const where = here.at("series").at(i);
    const label = firstText([s?.name, s?.label], 40);
    const formula = firstText([s?.formula, s?.expr], 300);
    if (!label || !formula) return where.drop("series needs a name and a formula");
    noteUnknownNames(formula, [...ids, name], where);
    series.push({ name: label, formula });
  });
  if (!series.length) return here.drop("chart has no usable series") ?? void 0;
  const kind = chartKind(raw.kind);
  return clean({
    kind: kind === "area" || kind === "bar" ? kind : "line",
    title: firstText([raw.title], 80),
    unit: firstText([raw.unit], 12),
    x: clean({ name, from, to, step, label: labelFor(firstText([x.label], 40), name) }),
    series: keepFirst(series, MAX_SERIES, here, "series")
  });
}
function labelFor(label, name) {
  if (!label) return void 0;
  const place = `{${name}}`;
  const placeholders = label.match(/\{[^{}]*\}/g) ?? [];
  const named = placeholders.length === 1 ? label.replace(placeholders[0], place) : label;
  return named.split(place).map((part) => part.replace(/[{}]/g, "")).join(place).trim() || void 0;
}
function bound(v) {
  return num(v) ?? str(v, 300) ?? null;
}
function noteUnknownNames(formula, known, here) {
  try {
    const unknown = namesIn(parseFormula(formula)).filter((n) => !known.includes(n));
    if (unknown.length) here.drop(`formula uses ${unknown.join(", ")}, which no input has; leaves gaps`);
  } catch (e) {
    here.drop(`formula can't be read (${e.message}); leaves gaps`);
  }
}
function calcChartSpec(chart, values) {
  const budget = newBudget(MAX_CHART_WORK);
  const at2 = (b) => typeof b === "number" ? b : evaluate(b, values, budget);
  const from = at2(chart.x.from), to = at2(chart.x.to), step = at2(chart.x.step);
  if (from === null || to === null || step === null) return null;
  const xs = pointsAlong(from, to, step);
  if (!xs.length) return null;
  const trees = chart.series.map((s) => tryParse(s.formula));
  const series = chart.series.map((s, k) => {
    const data = xs.map((xv) => {
      const tree = trees[k];
      return tree ? evaluate(tree, new Map(values).set(chart.x.name, xv), budget) : null;
    });
    return { name: s.name, data, right: false };
  });
  if (series.every((s) => s.data.every((v) => v === null))) return null;
  const label = (xv) => chart.x.label ? chart.x.label.split(`{${chart.x.name}}`).join(String(xv)) : String(xv);
  const type = chart.kind === "area" && series.length > 1 ? "line" : chart.kind;
  return clean({ type, title: chart.title, x: xs.map(label), series, unit: chart.unit, figure: false });
}
function pointsAlong(from, to, step) {
  if (!(step > 0) || to < from) return [];
  const count = (s2) => Math.floor((to - from) / s2 + 1e-9) + 1;
  let s = step;
  if (count(s) > MAX_POINTS) s = step * Math.ceil(count(s) / MAX_POINTS);
  if (!Number.isFinite(count(s))) return [];
  const n = Math.min(count(s), MAX_POINTS);
  return Array.from({ length: n }, (_, i) => Math.round((from + i * s) * 1e9) / 1e9);
}
function tryParse(formula) {
  try {
    return parseFormula(formula);
  } catch {
    return null;
  }
}

// src/blocks/chart/Chart.tsx
import { useId, useMemo as useMemo2, useRef as useRef6, useState as useState8 } from "react";

// src/blocks/chart/layout.ts
var COLUMNS_H = 210;
var LINES_H = 220;
var TOP = 10;
var BOTTOM = 26;
var VALUE_ROOM = 16;
var SIDE = 8;
var MAX_VALUE_LABELS = 12;
var LINE_LABEL_GAP = 80;
var END_NAME_MAX = 16;
var TICK_GAP = 8;
function isChangeLine(spec) {
  return spec.type === "line" && spec.tone === "change" && spec.series.length === 1;
}
function numericX(x) {
  if (!x.length || x.some((v) => String(v).trim() === "")) return null;
  const vals = x.map((v) => typeof v === "number" ? v : Number(String(v).trim()));
  return vals.some((v) => !Number.isFinite(v)) ? null : vals;
}
var LABEL_GAP = 8;
function scatterXLabels(labels2, at2) {
  const order = labels2.map((_, i) => i).sort((a, b) => at2(a) - at2(b) || a - b);
  const shown = [];
  let edge = -Infinity;
  for (const i of order) {
    const half = textWidth(labels2[i]) / 2;
    if (i === order[order.length - 1]) {
      while (shown.length && at2(shown[shown.length - 1]) + textWidth(labels2[shown[shown.length - 1]]) / 2 + LABEL_GAP > at2(i) - half) shown.pop();
      shown.push(i);
      break;
    }
    if (at2(i) - half >= edge) {
      shown.push(i);
      edge = at2(i) + half + LABEL_GAP;
    }
  }
  return shown.sort((a, b) => a - b);
}
function seriesEnds(data) {
  const first = data.find((v) => v !== null) ?? null;
  let last = data.length - 1;
  while (last >= 0 && data[last] === null) last--;
  return { first, last };
}
function valueColour(spec, k, v) {
  if (!isChangeLine(spec)) return partColour(k);
  const start = seriesEnds(spec.series[0].data).first ?? v;
  return v >= start ? "var(--hb-good)" : "var(--hb-warn)";
}
var unitOf = (spec, s) => s.unit ?? spec.unit;
function xyLayout(spec, width, scales) {
  const n = spec.x.length;
  const slotted = spec.type === "bar" || spec.type === "stacked" || spec.type === "combo" || spec.type === "histogram";
  const H = slotted ? COLUMNS_H : LINES_H;
  const base = H - BOTTOM;
  const endTexts = spec.type === "line" ? lineEndTexts(spec) : [];
  const ticks = gridTicks(spec);
  const tickRoom = ticks.length ? TICK_GAP + Math.max(...ticks.map((t) => textWidth(fmt(t, spec.unit)))) : 0;
  const left = (slotted ? 4 : SIDE) + tickRoom;
  const endRoom = endTexts.length ? Math.min(110, 14 + Math.max(...endTexts.map((e) => textWidth(e.text, 11.5)))) : 0;
  const right = width - (endRoom || (slotted ? 4 : SIDE));
  const plotWidth = right - left;
  const xValues = spec.type === "scatter" ? numericX(spec.x) : null;
  const xLo = xValues ? Math.min(...xValues) : 0;
  const xHi = xValues ? Math.max(...xValues) : 1;
  const perSlot = spec.type === "bar" ? spec.series.length : 1;
  const columns = columnLayout(plotWidth, n, perSlot);
  const xAt = (i) => slotted ? left + columns.start + columns.slot * (i + 0.5) : xValues ? left + (n === 1 || xHi === xLo ? plotWidth / 2 : plotWidth * (xValues[i] - xLo) / (xHi - xLo)) : left + (n === 1 ? plotWidth / 2 : plotWidth * i / (n - 1));
  const step = slotted ? columns.slot : n > 1 ? plotWidth / (n - 1) : 0;
  const valueLabels = (spec.type === "bar" || spec.type === "histogram") && n * perSlot <= MAX_VALUE_LABELS && spec.series.every((s) => s.data.every((v) => v === null || textWidth(fmt(v, unitOf(spec, s)), 11.5) <= columns.slot / perSlot));
  const top = TOP + (valueLabels ? VALUE_ROOM : 0);
  const scaleY = ({ min, max }) => (v) => top + (base - top) * (1 - (v - min) / (max - min || 1));
  const yAt = scaleY(ticks.length ? { min: ticks[0], max: ticks[ticks.length - 1] } : scales.left);
  const yRight = scales.right ? scaleY(scales.right) : yAt;
  const yOf = (s) => s.right ? yRight : yAt;
  const longest = Math.max(...spec.x.map((label) => textWidth(String(label))));
  const minGap = slotted ? longest + 8 : Math.max(LINE_LABEL_GAP, longest + 12);
  const xLabels = xValues ? scatterXLabels(spec.x.map(String), xAt) : xLabelsShown(n, step, minGap);
  const dotYs = endTexts.map((e) => yAt(e.value));
  const textYs = spreadLabels(dotYs, 14, base);
  const placedEnds = endTexts.map((e, j) => ({
    series: e.series,
    at: e.at,
    text: e.text,
    dotY: dotYs[j],
    y: textYs[j],
    dot: valueColour(spec, e.series, e.value),
    ink: spec.series.length === 1 ? "var(--hb-ink)" : partColour(e.series)
  }));
  return {
    W: width,
    H,
    left,
    right,
    top,
    base,
    slotted,
    bar: columns.bar,
    xAt,
    yAt,
    yOf,
    xLabels,
    valueLabels,
    ends: placedEnds,
    ticks
  };
}
function gridTicks(spec) {
  if (spec.type !== "line" || spec.series.length < 2) return [];
  const values = spec.series.flatMap((s) => s.data.filter((v) => v !== null));
  return values.length ? niceTicks(Math.min(...values), Math.max(...values)) : [];
}
var START_ABOVE = 6;
var START_BELOW = 14;
var LETTER_H = 9;
var BELOW_ROOM = 6;
function startLabelY(points, from, to, y, base) {
  const ys = heightsUnder(points, from, to);
  const rise = y - Math.min(y, ...ys);
  const fall = Math.max(y, ...ys) - y;
  const above = y - START_ABOVE;
  const below = y + START_BELOW;
  if (rise > fall) return below <= base + BELOW_ROOM ? below : above;
  return above - LETTER_H >= 0 ? above : below;
}
function heightsUnder(points, from, to) {
  const ys = [];
  points.forEach(([x, y], j) => {
    if (x >= from && x <= to) ys.push(y);
    const next = points[j + 1];
    if (!next) return;
    for (const edge of [from, to]) {
      if (x < edge && next[0] > edge) ys.push(y + (next[1] - y) * (edge - x) / (next[0] - x));
    }
  });
  return ys;
}
function lineEndTexts(spec) {
  const one = spec.series.length === 1;
  return spec.series.flatMap((s, k) => {
    const at2 = seriesEnds(s.data).last;
    if (at2 < 0) return [];
    const value = s.data[at2];
    const name = seriesName(spec.series, k);
    const text = one ? fmt(value, unitOf(spec, s)) : name.length > END_NAME_MAX ? `${name.slice(0, END_NAME_MAX - 1)}\u2026` : name;
    return [{ series: k, at: at2, value, text }];
  });
}
function xyTip(spec, i, layout2) {
  const rows2 = [];
  let y = layout2.base;
  let pile = 0;
  spec.series.forEach((s, k) => {
    const v = s.data[i] ?? null;
    if (v === null) return;
    rows2.push({ colour: valueColour(spec, k, v), name: seriesName(spec.series, k), value: fmt(v, unitOf(spec, s), { full: true }) });
    pile += Math.max(v, 0);
    y = Math.min(y, layout2.yOf(s)(spec.type === "stacked" || spec.type === "area" ? pile : v));
  });
  return { x: layout2.xAt(i), y, title: String(spec.x[i]), rows: rows2, note: tipNote(spec, i) };
}
function tipNote(spec, i) {
  if (spec.series.length !== 1 || spec.type !== "line") return void 0;
  const data = spec.series[0].data;
  const v = data[i] ?? null;
  const start = data.findIndex((d) => d !== null);
  const first = data[start];
  if (v === null || i <= start || first === 0) return void 0;
  return `${formatChange((v - first) / Math.abs(first) * 100)} since start`;
}

// src/blocks/chart/useWidth.ts
import { useLayoutEffect, useState as useState4 } from "react";
var UNMEASURED_WIDTH = 560;
function useWidth(ref) {
  const [width, setWidth] = useState4(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [ref]);
  return width || UNMEASURED_WIDTH;
}

// src/blocks/chart/pick.ts
function stepPick(at2, key, n, rows2 = false) {
  const next = key === "ArrowRight" || rows2 && key === "ArrowDown";
  const back = key === "ArrowLeft" || rows2 && key === "ArrowUp";
  if (key === "Escape") return null;
  if (next) return at2 === null ? 0 : Math.min(n - 1, at2 + 1);
  if (back) return at2 === null ? n - 1 : Math.max(0, at2 - 1);
  return void 0;
}
function pickKeys(n, at2, pick2, rows2 = false, activate) {
  return {
    tabIndex: 0,
    "aria-haspopup": "dialog",
    onKeyDown: (e) => {
      if (activate && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        activate();
        return;
      }
      const next = stepPick(at2, e.key, n, rows2);
      if (next === void 0) return;
      e.preventDefault();
      pick2(next);
    },
    onBlur: (e) => {
      if (e.relatedTarget) pick2(null);
    }
  };
}

// src/blocks/chart/ChartTip.tsx
import { useLayoutEffect as useLayoutEffect2, useRef as useRef2, useState as useState5 } from "react";
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs3 } from "react/jsx-runtime";
var GAP = 12;
function tipPlace(x, y, tipWidth, tipHeight, boxWidth) {
  let left = x + GAP;
  if (left + tipWidth > boxWidth - 2) left = Math.max(2, x - GAP - tipWidth);
  let top = y - tipHeight - GAP;
  if (top < -8) top = y + 14;
  return { left, top };
}
function ChartTip({ tip }) {
  const card = useRef2(null);
  const [kept, setKept] = useState5(tip);
  if (tip && tip !== kept) setKept(tip);
  const shown = tip ?? kept;
  useLayoutEffect2(() => {
    const el = card.current;
    if (!el || !tip) return;
    const box = el.offsetParent;
    const { left, top } = tipPlace(tip.x, tip.y, el.offsetWidth, el.offsetHeight, box?.clientWidth ?? 0);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [tip]);
  return /* @__PURE__ */ jsx6("div", { ref: card, className: `hb-tip${tip ? " hb-tip-on" : ""}`, role: "status", "aria-live": "polite", children: shown && /* @__PURE__ */ jsxs3(Fragment2, { children: [
    /* @__PURE__ */ jsx6("div", { className: "hb-tip-title", children: shown.title }),
    shown.rows.map((row, k) => /* @__PURE__ */ jsxs3("div", { className: "hb-tip-row", children: [
      /* @__PURE__ */ jsx6("i", { style: { background: row.colour } }),
      /* @__PURE__ */ jsx6("span", { className: "hb-tip-name", children: row.name }),
      /* @__PURE__ */ jsx6("b", { className: "hb-tip-value", children: row.value })
    ] }, k)),
    shown.note && /* @__PURE__ */ jsx6("div", { className: "hb-tip-note", children: shown.note })
  ] }) });
}

// src/blocks/chart/ChartDetail.tsx
import { useEffect as useEffect2, useRef as useRef3 } from "react";

// src/core/overlays.ts
var seq = 0;
var stack = [];
function pushLayer() {
  stack.push(++seq);
  return seq;
}
function popLayer(id) {
  const at2 = stack.indexOf(id);
  if (at2 >= 0) stack.splice(at2, 1);
}
function isTopLayer(id) {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

// src/blocks/chart/ChartDetail.tsx
import { jsx as jsx7, jsxs as jsxs4 } from "react/jsx-runtime";
var KIND_WORDS = {
  line: "Point",
  bar: "Column",
  area: "Point",
  stacked: "Part",
  hbar: "Row",
  combo: "Point",
  pie: "Slice",
  donut: "Slice",
  scatter: "Point",
  histogram: "Bin",
  gauge: "Value",
  bullet: "Row",
  funnel: "Stage",
  pareto: "Bar",
  waterfall: "Step",
  radar: "Axis",
  control: "Point",
  bubble: "Bubble",
  box: "Group",
  treemap: "Tile"
};
function ChartDetail({ detail, onClose }) {
  const close = useRef3(null);
  const layer = useRef3(0);
  useEffect2(() => {
    const id = pushLayer();
    layer.current = id;
    return () => popLayer(id);
  }, []);
  useEffect2(() => {
    close.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (!isTopLayer(layer.current)) return;
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === "Tab") {
        if (!isTopLayer(layer.current)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: "hb-chart-detail",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": `Chart details: ${detail.datum}`,
      onClick: (e) => e.target === e.currentTarget && onClose(),
      children: [
        /* @__PURE__ */ jsx7("button", { ref: close, type: "button", className: "hb-overlay-close", "aria-label": "Close chart details", onClick: onClose, children: /* @__PURE__ */ jsx7(
          "svg",
          {
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            "aria-hidden": "true",
            children: /* @__PURE__ */ jsx7("path", { d: "M6 6l12 12M18 6L6 18" })
          }
        ) }),
        /* @__PURE__ */ jsxs4("div", { className: "hb-chart-detail-card", children: [
          /* @__PURE__ */ jsxs4("div", { className: "hb-chart-detail-where", children: [
            detail.kind,
            detail.chartTitle ? ` \xB7 ${detail.chartTitle}` : ""
          ] }),
          /* @__PURE__ */ jsx7("div", { className: "hb-chart-detail-title", children: detail.datum }),
          detail.rows.map((row, k) => /* @__PURE__ */ jsxs4("div", { className: "hb-detail-row", children: [
            /* @__PURE__ */ jsx7("i", { style: { background: row.colour } }),
            /* @__PURE__ */ jsx7("span", { className: "hb-detail-name", children: row.name }),
            /* @__PURE__ */ jsx7("b", { className: "hb-detail-value", children: row.value })
          ] }, k)),
          detail.note && /* @__PURE__ */ jsx7("div", { className: "hb-detail-note", children: detail.note }),
          detail.source && /* @__PURE__ */ jsx7("div", { className: "hb-detail-source", children: detail.source })
        ] })
      ]
    }
  );
}

// src/blocks/chart/Legend.tsx
import { jsx as jsx8, jsxs as jsxs5 } from "react/jsx-runtime";
function ChartLegend({ series, at: at2, unit }) {
  return /* @__PURE__ */ jsx8("div", { className: "hb-legend", children: series.map((s, k) => {
    const value = at2 === void 0 ? null : s.data[at2] ?? null;
    return /* @__PURE__ */ jsxs5("span", { className: "hb-legend-item", children: [
      /* @__PURE__ */ jsx8("i", { className: "hb-legend-dot", style: { background: partColour(k) } }),
      seriesName(series, k),
      value !== null && /* @__PURE__ */ jsx8("span", { className: "hb-legend-value", children: fmt(value, s.unit ?? unit) }),
      s.right && /* @__PURE__ */ jsx8("span", { className: "hb-legend-note", children: "(right scale)" })
    ] }, k);
  }) });
}

// src/blocks/chart/LineMarks.tsx
import { jsx as jsx9, jsxs as jsxs6 } from "react/jsx-runtime";
function LineMarks({ spec, layout: layout2, gid, hover }) {
  const { xAt, yAt, left, right, top, base } = layout2;
  const one = spec.series.length === 1;
  const start = isChangeLine(spec) ? seriesEnds(spec.series[0].data).first : null;
  const zero = yAt(0);
  const showZero = !one && zero > top && zero < base;
  return /* @__PURE__ */ jsxs6("g", { children: [
    layout2.ticks.length ? /* @__PURE__ */ jsx9(Gridlines, { spec, layout: layout2 }) : /* @__PURE__ */ jsx9("line", { x1: left, x2: right, y1: base, y2: base, className: "hb-chart-rule" }),
    showZero && /* @__PURE__ */ jsx9("line", { x1: left, x2: right, y1: zero, y2: zero, className: "hb-chart-rule-strong", strokeDasharray: "3 3" }),
    start !== null && /* @__PURE__ */ jsx9(StartMark, { spec, layout: layout2, gid, start }),
    spec.series.map((s, k) => {
      const pts = pointsOf(s.data, layout2);
      if (!pts.length) return null;
      return /* @__PURE__ */ jsx9(
        "path",
        {
          d: linePath(pts),
          fill: "none",
          stroke: start !== null ? `url(#change-${gid})` : partColour(k),
          strokeWidth: one ? 2.25 : 1.75,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          pathLength: 1,
          strokeDasharray: "1",
          strokeDashoffset: "1",
          className: "hb-chart-line hb-chart-draw"
        },
        k
      );
    }),
    layout2.ends.map((e) => /* @__PURE__ */ jsxs6("g", { children: [
      /* @__PURE__ */ jsx9("circle", { cx: xAt(e.at), cy: e.dotY, r: "3.5", fill: e.dot, className: "hb-chart-dot" }),
      /* @__PURE__ */ jsx9("text", { x: xAt(e.at) + 8, y: e.y + 4, className: "hb-chart-end", style: { fill: e.ink }, children: e.text })
    ] }, e.series)),
    hover !== null && /* @__PURE__ */ jsxs6("g", { children: [
      /* @__PURE__ */ jsx9(Crosshair, { layout: layout2, at: hover }),
      spec.series.map((s, k) => {
        const v = s.data[hover] ?? null;
        return v === null ? null : /* @__PURE__ */ jsx9("circle", { cx: xAt(hover), cy: yAt(v), r: "4", fill: valueColour(spec, k, v), className: "hb-chart-dot" }, k);
      })
    ] })
  ] });
}
function Gridlines({ spec, layout: layout2 }) {
  const { left, right, yAt } = layout2;
  return /* @__PURE__ */ jsx9("g", { children: layout2.ticks.map((t) => /* @__PURE__ */ jsxs6("g", { children: [
    /* @__PURE__ */ jsx9("line", { x1: left, x2: right, y1: yAt(t), y2: yAt(t), className: "hb-chart-rule" }),
    /* @__PURE__ */ jsx9("text", { x: left - TICK_GAP, y: yAt(t) + 4, textAnchor: "end", className: "hb-chart-tick", children: fmt(t, spec.unit) })
  ] }, t)) });
}
function pointsOf(data, { xAt, yAt }) {
  return data.flatMap((v, i) => v === null ? [] : [[xAt(i), yAt(v)]]);
}
function StartMark({ spec, layout: layout2, gid, start }) {
  const { left, right, top, base, yAt } = layout2;
  const y = yAt(start);
  const at2 = Math.min(1, Math.max(0, (y - top) / (base - top || 1)));
  const label = `Start ${fmt(start, spec.series[0].unit ?? spec.unit)}`;
  const labelY = startLabelY(pointsOf(spec.series[0].data, layout2), left, left + 2 + textWidth(label), y, base);
  return /* @__PURE__ */ jsxs6("g", { children: [
    /* @__PURE__ */ jsx9("defs", { children: /* @__PURE__ */ jsxs6("linearGradient", { id: `change-${gid}`, gradientUnits: "userSpaceOnUse", x1: "0", x2: "0", y1: top, y2: base, children: [
      /* @__PURE__ */ jsx9("stop", { offset: at2, style: { stopColor: "var(--hb-good)" } }),
      /* @__PURE__ */ jsx9("stop", { offset: at2, style: { stopColor: "var(--hb-warn)" } })
    ] }) }),
    /* @__PURE__ */ jsx9("line", { x1: left, x2: right, y1: y, y2: y, className: "hb-chart-rule-strong", strokeDasharray: "3 3" }),
    /* @__PURE__ */ jsx9("text", { x: left + 2, y: labelY, className: "hb-chart-axis hb-chart-halo", children: label })
  ] });
}
function Crosshair({ layout: layout2, at: at2 }) {
  const x = layout2.xAt(at2);
  return /* @__PURE__ */ jsx9("line", { x1: x, x2: x, y1: layout2.top, y2: layout2.base, className: "hb-chart-rule-strong" });
}

// src/blocks/chart/ColumnMarks.tsx
import { jsx as jsx10, jsxs as jsxs7 } from "react/jsx-runtime";
var SERIES_GAP = 2;
var shade = (hover, i) => hover === null || hover === i ? 1 : 0.55;
function Baseline({ layout: layout2 }) {
  const y = layout2.yAt(0);
  return /* @__PURE__ */ jsx10("line", { x1: layout2.left, x2: layout2.right, y1: y, y2: y, className: "hb-chart-rule-strong" });
}
function BarMarks({ spec, layout: layout2, hover }) {
  const { xAt, yAt, bar } = layout2;
  const count = spec.series.length;
  const zero = yAt(0);
  return /* @__PURE__ */ jsxs7("g", { children: [
    spec.series.map((s, k) => s.data.map((v, i) => {
      if (v === null) return null;
      const x = xAt(i) - bar * count / 2 + k * bar;
      const width = count > 1 ? bar - SERIES_GAP : bar;
      const end = yAt(v);
      return /* @__PURE__ */ jsxs7("g", { opacity: shade(hover, i), children: [
        /* @__PURE__ */ jsx10("path", { d: barPath(x, width, zero, end), fill: partColour(k), className: "hb-chart-bar" }),
        layout2.valueLabels && /* @__PURE__ */ jsx10("text", { x: x + width / 2, y: v < 0 ? end + 14 : end - 6, textAnchor: "middle", className: "hb-chart-value", children: fmt(v, s.unit ?? spec.unit) })
      ] }, `${k}-${i}`);
    })),
    /* @__PURE__ */ jsx10(Baseline, { layout: layout2 })
  ] });
}
function StackMarks({ bands, layout: layout2, hover }) {
  const { xAt, yAt, bar } = layout2;
  return /* @__PURE__ */ jsxs7("g", { children: [
    bands.map((partBands, k) => partBands.map((b, i) => b === null || b.from === b.to ? null : /* @__PURE__ */ jsx10(
      "rect",
      {
        x: xAt(i) - bar / 2,
        y: Math.min(yAt(b.from), yAt(b.to)),
        width: bar,
        height: Math.max(Math.abs(yAt(b.from) - yAt(b.to)) - 2, 1),
        rx: "3",
        fill: partColour(k),
        opacity: shade(hover, i)
      },
      `${k}-${i}`
    ))),
    /* @__PURE__ */ jsx10(Baseline, { layout: layout2 })
  ] });
}
function ComboMarks({ spec, layout: layout2, hover }) {
  const { xAt, yAt, bar } = layout2;
  const zero = yAt(0);
  return /* @__PURE__ */ jsxs7("g", { children: [
    spec.series[0].data.map((v, i) => v === null ? null : /* @__PURE__ */ jsx10("path", { d: barPath(xAt(i) - bar / 2, bar, zero, yAt(v)), fill: partColour(0), opacity: shade(hover, i), className: "hb-chart-bar" }, i)),
    /* @__PURE__ */ jsx10(Baseline, { layout: layout2 }),
    spec.series.slice(1).map((s, j) => {
      const y = layout2.yOf(s);
      const pts = s.data.flatMap((v, i) => v === null ? [] : [[xAt(i), y(v)]]);
      if (!pts.length) return null;
      const colour = partColour(j + 1);
      return /* @__PURE__ */ jsxs7("g", { children: [
        /* @__PURE__ */ jsx10("path", { d: linePath(pts), fill: "none", stroke: colour, strokeWidth: "2.25", strokeLinejoin: "round", strokeLinecap: "round" }),
        pts.map(([cx, cy], i) => /* @__PURE__ */ jsx10("circle", { cx, cy, r: "3.5", fill: colour, className: "hb-chart-dot" }, i))
      ] }, j);
    })
  ] });
}

// src/blocks/chart/AreaMarks.tsx
import { jsx as jsx11, jsxs as jsxs8 } from "react/jsx-runtime";
function AreaMarks({ bands, layout: layout2 }) {
  return /* @__PURE__ */ jsxs8("g", { children: [
    /* @__PURE__ */ jsx11("line", { x1: layout2.left, x2: layout2.right, y1: layout2.base, y2: layout2.base, className: "hb-chart-rule" }),
    bands.map((partBands, k) => /* @__PURE__ */ jsx11(Area, { bands: partBands, layout: layout2, colour: partColour(k) }, k))
  ] });
}
function Area({ bands, layout: layout2, colour }) {
  const top = [];
  const bottom = [];
  bands.forEach((b, i) => {
    if (b === null) return;
    top.push([layout2.xAt(i), layout2.yAt(b.to)]);
    bottom.push([layout2.xAt(i), layout2.yAt(b.from)]);
  });
  if (!top.length) return null;
  const topEdge = linePath(top);
  const backAlongBottom = linePath(bottom.reverse()).replace(/^M/, "L");
  return /* @__PURE__ */ jsxs8("g", { children: [
    /* @__PURE__ */ jsx11("path", { d: `${topEdge} ${backAlongBottom} Z`, fill: colour, fillOpacity: ".3" }),
    /* @__PURE__ */ jsx11("path", { d: topEdge, fill: "none", stroke: colour, strokeWidth: "2", strokeLinejoin: "round", strokeLinecap: "round" })
  ] });
}

// src/blocks/chart/ScatterMarks.tsx
import { jsx as jsx12, jsxs as jsxs9 } from "react/jsx-runtime";
var shade2 = (hover, i) => hover === null || hover === i ? 1 : 0.55;
function dotSpots(spec, layout2) {
  const spots = /* @__PURE__ */ new Map();
  spec.series.forEach((s, k) => s.data.forEach((v, i) => {
    if (v === null) return;
    const x = layout2.xAt(i);
    const y = layout2.yOf(s)(v);
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    const at2 = spots.get(key);
    if (!at2) spots.set(key, { x, y, key, members: [i], colour: partColour(k) });
    else if (!at2.members.includes(i)) at2.members.push(i);
  }));
  return [...spots.values()].map((s) => ({ ...s, members: s.members.sort((a, b) => a - b) }));
}
function ScatterMarks({ spec, layout: layout2, hover }) {
  const spots = dotSpots(spec, layout2);
  return /* @__PURE__ */ jsxs9("g", { children: [
    spec.series.map((s, k) => s.data.map((v, i) => v === null ? null : /* @__PURE__ */ jsx12(
      "circle",
      {
        "data-pt": i,
        cx: layout2.xAt(i),
        cy: layout2.yOf(s)(v),
        r: "4",
        fill: partColour(k),
        opacity: shade2(hover, i),
        className: "hb-chart-dot"
      },
      `${k}-${i}`
    ))),
    spots.filter((s) => s.members.length > 1).map((s) => /* @__PURE__ */ jsxs9(
      "text",
      {
        x: s.x + 5,
        y: s.y - 6,
        fill: s.colour,
        className: "hb-chart-cluster",
        "aria-hidden": "true",
        opacity: hover === null || s.members.includes(hover) ? 1 : 0.55,
        children: [
          "\xD7",
          s.members.length
        ]
      },
      s.key
    ))
  ] });
}

// src/blocks/chart/HBarChart.tsx
import { Fragment as Fragment3, useRef as useRef4, useState as useState6 } from "react";

// src/blocks/chart/hbarLayout.ts
function hbarSpan(spec) {
  const values = spec.series.flatMap((s) => s.data.filter((v) => v !== null));
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  return { lo, hi, span, zeroAt: -lo / span * 100 };
}
function hbarBarOf(v, span, zeroAt) {
  const width = Math.max(Math.abs(v) / span * 100, 1.5);
  return { left: v < 0 ? zeroAt - width : zeroAt, width };
}

// src/blocks/chart/HBarChart.tsx
import { Fragment as Fragment4, jsx as jsx13, jsxs as jsxs10 } from "react/jsx-runtime";
function HBarChart({ spec }) {
  const [tip, setTip] = useState6(null);
  const [picked, setPicked] = useState6(null);
  const [drill, setDrill] = useState6(null);
  const box = useRef4(null);
  const grid = useRef4(null);
  const tracks = useRef4([]);
  const { lo, span, zeroAt } = hbarSpan(spec);
  const single = spec.series.length === 1;
  const signed = lo < 0;
  const colourOf2 = (k, v) => {
    if (!single || !signed) return partColour(k);
    return v >= 0 ? "var(--hb-good)" : "var(--hb-warn)";
  };
  const unitOf2 = (k) => spec.series[k].unit ?? spec.unit;
  const barOf = (v) => hbarBarOf(v, span, zeroAt);
  function rowsAt(i) {
    const rows2 = [];
    spec.series.forEach((s, k) => {
      const v = s.data[i] ?? null;
      if (v === null) return;
      rows2.push({ colour: colourOf2(k, v), name: seriesName(spec.series, k), value: fmt(v, unitOf2(k), { full: true }) });
    });
    return rows2;
  }
  function pick2(i) {
    setPicked(i);
    const track = i === null ? null : tracks.current[i];
    if (i === null || !track || !box.current) return setTip(null);
    let end = zeroAt;
    spec.series.forEach((s) => {
      const v = s.data[i] ?? null;
      if (v === null) return;
      const { left, width } = barOf(v);
      end = Math.max(end, left + width);
    });
    const t = track.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    setTip({ x: t.left - b.left + t.width * end / 100, y: t.top - b.top, title: String(spec.x[i]), rows: rowsAt(i) });
  }
  function open(i) {
    pick2(i);
    setDrill({ at: i, detail: {
      datum: String(spec.x[i]),
      chartTitle: spec.title,
      kind: KIND_WORDS.hbar,
      rows: rowsAt(i),
      source: spec.source
    } });
  }
  const close = () => {
    setDrill(null);
    grid.current?.focus();
  };
  const pickKeep = (i) => {
    if (i !== null || !drill) pick2(i);
  };
  const shade3 = (i) => picked === null || picked === i ? 1 : 0.55;
  const rowEvents = (i) => ({ onPointerEnter: () => pickKeep(i), onPointerDown: () => pickKeep(i), onClick: () => open(i) });
  return /* @__PURE__ */ jsxs10(Fragment4, { children: [
    /* @__PURE__ */ jsxs10("figure", { className: "hb-card hb-chart", children: [
      /* @__PURE__ */ jsx13("figcaption", { className: "hb-chart-title", children: spec.title ?? spec.series[0].name ?? "Chart" }),
      !single && /* @__PURE__ */ jsx13(ChartLegend, { series: spec.series }),
      /* @__PURE__ */ jsxs10("div", { ref: box, className: "hb-hbar-box", children: [
        /* @__PURE__ */ jsx13(
          "div",
          {
            ref: grid,
            className: `hb-hbar-grid${single ? "" : " hb-hbar-many"}`,
            role: "img",
            "aria-label": spec.title ?? "chart",
            ...pickKeys(spec.x.length, picked, pickKeep, true, () => picked !== null && open(picked)),
            onPointerLeave: () => pickKeep(null),
            children: spec.x.map((label, i) => /* @__PURE__ */ jsxs10(Fragment3, { children: [
              /* @__PURE__ */ jsx13("div", { className: "hb-hbar-label", ...rowEvents(i), children: label }),
              /* @__PURE__ */ jsx13("div", { className: "hb-hbar-tracks", ref: (el) => {
                tracks.current[i] = el;
              }, ...rowEvents(i), children: spec.series.map((s, k) => {
                const v = s.data[i] ?? null;
                const bar = v === null ? null : barOf(v);
                return /* @__PURE__ */ jsxs10("div", { className: "hb-hbar-track", children: [
                  signed && /* @__PURE__ */ jsx13("div", { className: "hb-hbar-zero", style: { left: `${zeroAt}%` } }),
                  v !== null && bar && /* @__PURE__ */ jsx13("div", { className: "hb-hbar-bar", style: {
                    left: `${bar.left}%`,
                    width: `${bar.width}%`,
                    background: colourOf2(k, v),
                    opacity: shade3(i)
                  } })
                ] }, k);
              }) }),
              /* @__PURE__ */ jsx13("div", { className: "hb-hbar-values", ...rowEvents(i), children: spec.series.map((s, k) => {
                const v = s.data[i] ?? null;
                const tone2 = single && signed && v !== null ? v >= 0 ? " hb-hbar-up" : " hb-hbar-down" : "";
                return /* @__PURE__ */ jsx13("span", { className: `hb-hbar-value${tone2}`, children: v === null ? "\u2013" : fmt(v, unitOf2(k)) }, k);
              }) })
            ] }, i))
          }
        ),
        /* @__PURE__ */ jsx13(ChartTip, { tip })
      ] }),
      spec.source && /* @__PURE__ */ jsx13("div", { className: "hb-chart-source", children: spec.source })
    ] }),
    drill && /* @__PURE__ */ jsx13(ChartDetail, { detail: drill.detail, onClose: close })
  ] });
}

// src/blocks/chart/PieChart.tsx
import { useRef as useRef5, useState as useState7 } from "react";
import { Fragment as Fragment5, jsx as jsx14, jsxs as jsxs11 } from "react/jsx-runtime";
var BOX = 168;
var C = BOX / 2;
var OUTER = 80;
var HOLE = 52;
function at(turn, r) {
  const a = turn * 2 * Math.PI;
  return [+(C + r * Math.sin(a)).toFixed(2), +(C - r * Math.cos(a)).toFixed(2)];
}
function slicePath(start, end, hole) {
  const stop = Math.min(end, start + 0.9999);
  const large = stop - start > 0.5 ? 1 : 0;
  const [x1, y1] = at(start, OUTER);
  const [x2, y2] = at(stop, OUTER);
  if (hole === 0) return `M${C},${C} L${x1},${y1} A${OUTER},${OUTER} 0 ${large} 1 ${x2},${y2} Z`;
  const [x3, y3] = at(stop, hole);
  const [x4, y4] = at(start, hole);
  return `M${x1},${y1} A${OUTER},${OUTER} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${hole},${hole} 0 ${large} 0 ${x4},${y4} Z`;
}
function shortLabel(label) {
  if (label.length <= 15) return label;
  return `${label.slice(0, 14)}\u2026`;
}
function sliceColour(label, i) {
  if (label === "Other") return "var(--hb-muted)";
  return partColour(i);
}
function PieChart({ spec }) {
  const [picked, setPicked] = useState7(null);
  const [tip, setTip] = useState7(null);
  const [drill, setDrill] = useState7(null);
  const svg = useRef5(null);
  const values = spec.series[0].data;
  const total = values.reduce((sum, v) => sum + v, 0);
  const unit = spec.series[0].unit ?? spec.unit;
  const donut = spec.type === "donut";
  const hole = donut ? HOLE : 0;
  const slices2 = [];
  let start = 0;
  for (const v of values) {
    slices2.push({ start, end: start + v / total });
    start += v / total;
  }
  const valuesAreShares = unit === "%";
  const biggest = values.indexOf(Math.max(...values));
  const headline = valuesAreShares ? { value: sharePct(values[biggest] / total), label: String(spec.x[biggest]) } : { value: fmt(total, unit), label: "Total" };
  function pick2(i) {
    setPicked(i);
    const el = svg.current;
    const body = el?.parentElement;
    if (i === null || !el || !body) return setTip(null);
    const [x, y] = at((slices2[i].start + slices2[i].end) / 2, donut ? (OUTER + HOLE) / 2 : OUTER * 0.6);
    const drawing = el.getBoundingClientRect();
    const around = body.getBoundingClientRect();
    const label = String(spec.x[i]);
    setTip({
      x: drawing.left - around.left + x,
      y: drawing.top - around.top + y,
      title: label,
      rows: sliceRows(i),
      note: valuesAreShares ? void 0 : shareNote(values, values[i])
    });
  }
  function sliceRows(i) {
    const label = String(spec.x[i]);
    return [{ colour: sliceColour(label, i), name: seriesName(spec.series, 0), value: fmt(values[i], unit, { full: true }) }];
  }
  function open(i) {
    pick2(i);
    setDrill({ at: i, detail: {
      datum: String(spec.x[i]),
      chartTitle: spec.title,
      kind: KIND_WORDS[spec.type],
      rows: sliceRows(i),
      note: valuesAreShares ? void 0 : shareNote(values, values[i]),
      source: spec.source
    } });
  }
  const close = () => {
    setDrill(null);
    svg.current?.focus();
  };
  const pickKeep = (i) => {
    if (i !== null || !drill) pick2(i);
  };
  const faded = (i) => picked === null || picked === i ? 1 : 0.5;
  const mouse = (i) => (e) => e.pointerType === "mouse" && pickKeep(i);
  return /* @__PURE__ */ jsxs11(Fragment5, { children: [
    /* @__PURE__ */ jsxs11("figure", { className: "hb-card hb-chart hb-pie", children: [
      /* @__PURE__ */ jsx14("figcaption", { className: "hb-chart-title", children: spec.title ?? spec.series[0].name ?? "Chart" }),
      !donut && /* @__PURE__ */ jsxs11("div", { className: "hb-chart-figure", children: [
        /* @__PURE__ */ jsx14("span", { className: "hb-chart-big", children: headline.value }),
        /* @__PURE__ */ jsx14("span", { className: "hb-chart-at", children: headline.label })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "hb-pie-body", children: [
        /* @__PURE__ */ jsxs11(
          "svg",
          {
            ref: svg,
            width: BOX,
            height: BOX,
            viewBox: `0 0 ${BOX} ${BOX}`,
            className: "hb-pie-svg",
            role: "img",
            "aria-label": spec.title ?? "chart",
            ...pickKeys(values.length, picked, pickKeep, false, () => picked !== null && open(picked)),
            children: [
              slices2.map((s, i) => /* @__PURE__ */ jsx14(
                "path",
                {
                  d: slicePath(s.start, s.end, hole),
                  fill: sliceColour(String(spec.x[i]), i),
                  opacity: faded(i),
                  className: "hb-slice",
                  onClick: () => open(i),
                  onPointerEnter: mouse(i),
                  onPointerLeave: mouse(null)
                },
                i
              )),
              donut && /* @__PURE__ */ jsxs11("g", { textAnchor: "middle", pointerEvents: "none", children: [
                /* @__PURE__ */ jsx14("text", { x: C, y: C - 2, className: "hb-pie-total", children: headline.value }),
                /* @__PURE__ */ jsx14("text", { x: C, y: C + 15, className: "hb-chart-axis", children: shortLabel(headline.label) })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx14("table", { className: "hb-pie-legend", children: /* @__PURE__ */ jsx14("tbody", { children: values.map((v, i) => /* @__PURE__ */ jsxs11("tr", { onClick: () => open(i), onPointerEnter: mouse(i), onPointerLeave: mouse(null), style: { opacity: faded(i) }, children: [
          /* @__PURE__ */ jsx14("td", { className: "hb-pie-swatch", children: /* @__PURE__ */ jsx14("i", { style: { background: sliceColour(String(spec.x[i]), i) } }) }),
          /* @__PURE__ */ jsx14("td", { className: "hb-pie-name", children: spec.x[i] }),
          !valuesAreShares && /* @__PURE__ */ jsx14("td", { className: "hb-pie-value", children: fmt(v, unit) }),
          /* @__PURE__ */ jsx14("td", { className: "hb-pie-share", children: sharePct(v / total) })
        ] }, i)) }) }),
        /* @__PURE__ */ jsx14(ChartTip, { tip })
      ] }),
      spec.source && /* @__PURE__ */ jsx14("div", { className: "hb-chart-source", children: spec.source })
    ] }),
    drill && /* @__PURE__ */ jsx14(ChartDetail, { detail: drill.detail, onClose: close })
  ] });
}

// src/blocks/chart/Gauge.tsx
import { jsx as jsx15, jsxs as jsxs12 } from "react/jsx-runtime";
var R = 66;
var CX = 84;
var CY = 84;
var SW = 13;
function point(t) {
  const angle = Math.PI * (1 - t);
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}
function arcPath(from, to) {
  const [x0, y0] = point(from);
  const [x1, y1] = point(to);
  const large = Math.abs(to - from) > 0.5 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}
function Gauge({ spec }) {
  const raw = spec.series[0]?.data[0] ?? null;
  const value = typeof raw === "number" && isFinite(raw) ? raw : null;
  const min = typeof spec.min === "number" ? spec.min : 0;
  const max = typeof spec.max === "number" && spec.max > min ? spec.max : Math.max(min + 1, value ?? 0, spec.target ?? 0);
  const target = typeof spec.target === "number" ? spec.target : void 0;
  const clamp = (v) => Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
  const bands = spec.bands && spec.bands.length ? spec.bands.map(clamp) : [0.5, 0.8, 1];
  const shown = value === null ? null : value;
  const at2 = shown === null ? 0 : clamp(shown);
  const toneAt = shown === null ? "hb-gauge-value" : target !== void 0 && shown >= target ? "hb-gauge-value hb-gauge-hit" : "hb-gauge-value";
  return /* @__PURE__ */ jsxs12("figure", { className: "hb-gauge", children: [
    spec.title && /* @__PURE__ */ jsx15("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsxs12("svg", { className: "hb-gauge-svg", viewBox: "0 0 168 104", role: "img", "aria-label": aria(spec, shown, min, max, target), children: [
      /* @__PURE__ */ jsx15("path", { className: "hb-gauge-track", d: arcPath(1, 0), stroke: "var(--hb-line)", fill: "none", strokeWidth: SW, strokeLinecap: "round" }),
      bands.map((b, i) => {
        const from = i === 0 ? 0 : bands[i - 1];
        return /* @__PURE__ */ jsx15("path", { className: "hb-gauge-band", d: arcPath(from, b), stroke: `var(--hb-chart-${i + 1})`, fill: "none", strokeWidth: SW, strokeOpacity: 0.18, strokeLinecap: "butt" }, i);
      }),
      shown !== null && /* @__PURE__ */ jsx15("path", { className: toneAt, d: arcPath(0, at2), stroke: "var(--hb-accent)", fill: "none", strokeWidth: SW, strokeLinecap: "round" }),
      target !== void 0 && (() => {
        const [tx, ty] = point(clamp(target));
        const [ax, ay] = point(clamp(target));
        const dx = ax - CX, dy = ay - CY;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        return /* @__PURE__ */ jsx15("line", { className: "hb-gauge-target", x1: tx - ux * (SW / 2 + 3), y1: ty - uy * (SW / 2 + 3), x2: tx + ux * (SW / 2 + 3), y2: ty + uy * (SW / 2 + 3), stroke: "var(--hb-ink)", strokeWidth: 2.5, strokeLinecap: "round" });
      })(),
      /* @__PURE__ */ jsx15("text", { className: "hb-gauge-big", x: CX, y: CY - 4, textAnchor: "middle", children: shown === null ? "\u2013" : fmt(shown, spec.unit) }),
      /* @__PURE__ */ jsx15("text", { className: "hb-gauge-sub", x: CX, y: CY + 12, textAnchor: "middle", children: target !== void 0 ? `target ${fmt(target, spec.unit)}` : "" }),
      /* @__PURE__ */ jsx15("text", { className: "hb-gauge-min", x: point(1)[0], y: CY + 16, textAnchor: "middle", children: fmt(min, spec.unit) }),
      /* @__PURE__ */ jsx15("text", { className: "hb-gauge-max", x: point(0)[0], y: CY + 16, textAnchor: "middle", children: fmt(max, spec.unit) })
    ] }),
    spec.source && /* @__PURE__ */ jsx15("div", { className: "hb-chart-source", children: spec.source })
  ] });
}
function aria(spec, value, min, max, target) {
  const name = spec.title || "Gauge";
  const v = value === null ? "no value" : fmt(value, spec.unit);
  const t = target !== void 0 ? `, target ${fmt(target, spec.unit)}` : "";
  return `${name}: ${v} on a scale ${fmt(min, spec.unit)} to ${fmt(max, spec.unit)}${t}`;
}

// src/blocks/chart/Bullet.tsx
import { jsx as jsx16, jsxs as jsxs13 } from "react/jsx-runtime";
function Bullet({ spec }) {
  const actual = spec.series[0]?.data ?? [];
  const targets = spec.series[1]?.data ?? [];
  const nums = [...actual, ...targets].filter((v) => typeof v === "number" && isFinite(v));
  const max = Math.max(1, ...nums);
  const bands = spec.bands && spec.bands.length ? spec.bands : [max * 0.5, max * 0.8, max];
  const pct = (v) => `${Math.min(100, Math.max(0, v / max * 100))}%`;
  return /* @__PURE__ */ jsxs13("figure", { className: "hb-bullet", children: [
    spec.title && /* @__PURE__ */ jsx16("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsx16("ul", { className: "hb-bullet-rows", children: spec.x.map((label, i) => {
      const v = actual[i];
      const t = targets[i];
      const value = typeof v === "number" && isFinite(v) ? v : null;
      const target = typeof t === "number" && isFinite(t) ? t : null;
      return /* @__PURE__ */ jsxs13("li", { className: "hb-bullet-row", children: [
        /* @__PURE__ */ jsx16("span", { className: "hb-bullet-label", children: label }),
        /* @__PURE__ */ jsxs13("span", { className: "hb-bullet-track", "aria-hidden": "true", children: [
          bands.map((b, k) => {
            const from = k === 0 ? 0 : bands[k - 1];
            return /* @__PURE__ */ jsx16("span", { className: "hb-bullet-band", style: { left: pct(from), width: pct(b - from) } }, k);
          }),
          value !== null && /* @__PURE__ */ jsx16("span", { className: "hb-bullet-value", style: { width: pct(value) } }),
          target !== null && /* @__PURE__ */ jsx16("span", { className: "hb-bullet-target", style: { left: pct(target) } })
        ] }),
        /* @__PURE__ */ jsxs13("span", { className: "hb-bullet-num", children: [
          value === null ? "\u2013" : fmt(value, spec.unit),
          target !== null && /* @__PURE__ */ jsxs13("span", { className: "hb-bullet-goal", children: [
            " / ",
            fmt(target, spec.unit)
          ] })
        ] })
      ] }, i);
    }) }),
    spec.source && /* @__PURE__ */ jsx16("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Funnel.tsx
import { jsx as jsx17, jsxs as jsxs14 } from "react/jsx-runtime";
function Funnel({ spec }) {
  const data = spec.series[0]?.data ?? [];
  const rows2 = spec.x.map((label, i) => ({ label, v: typeof data[i] === "number" ? data[i] : null })).filter((r) => r.v !== null && r.v >= 0);
  const max = Math.max(1, ...rows2.map((r) => r.v));
  return /* @__PURE__ */ jsxs14("figure", { className: "hb-funnel", children: [
    spec.title && /* @__PURE__ */ jsx17("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsx17("ol", { className: "hb-funnel-rows", children: rows2.map((r, i) => {
      const prev = i > 0 ? rows2[i - 1].v : r.v;
      const conv = i > 0 && prev > 0 ? Math.round(r.v / prev * 100) : null;
      const share = Math.max(4, r.v / max * 100);
      return /* @__PURE__ */ jsxs14("li", { className: "hb-funnel-row", children: [
        /* @__PURE__ */ jsx17("span", { className: "hb-funnel-label", children: r.label }),
        /* @__PURE__ */ jsx17("span", { className: "hb-funnel-track", children: /* @__PURE__ */ jsx17("span", { className: "hb-funnel-bar", style: { width: `${share}%` }, children: /* @__PURE__ */ jsx17("span", { className: "hb-funnel-value", children: fmt(r.v, spec.unit) }) }) }),
        /* @__PURE__ */ jsx17("span", { className: "hb-funnel-conv", children: conv === null ? "" : `${conv}%` })
      ] }, i);
    }) }),
    spec.source && /* @__PURE__ */ jsx17("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Pareto.tsx
import { jsx as jsx18, jsxs as jsxs15 } from "react/jsx-runtime";
function Pareto({ spec }) {
  const data = spec.series[0]?.data ?? [];
  const items = spec.x.map((label, i) => ({ label, v: data[i] })).filter((d) => typeof d.v === "number" && d.v > 0).sort((a, b) => b.v - a.v);
  const total = items.reduce((s, d) => s + d.v, 0);
  const max = items[0]?.v ?? 1;
  let running = 0;
  const cumulative = items.map((d) => {
    running += d.v;
    return total > 0 ? running / total : 0;
  });
  const n = items.length;
  const step = n > 0 ? 100 / n : 100;
  if (!n) return null;
  const points = cumulative.map((c, i) => `${(i + 0.5) * step},${100 - c * 100}`).join(" ");
  return /* @__PURE__ */ jsxs15("figure", { className: "hb-pareto", children: [
    spec.title && /* @__PURE__ */ jsx18("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsxs15("div", { className: "hb-pareto-plot", children: [
      /* @__PURE__ */ jsx18("svg", { className: "hb-pareto-line", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true", children: /* @__PURE__ */ jsx18("polyline", { points, fill: "none", stroke: "var(--hb-accent)", strokeWidth: 0.7, vectorEffect: "non-scaling-stroke" }) }),
      /* @__PURE__ */ jsx18("div", { className: "hb-pareto-bars", children: items.map((d, i) => /* @__PURE__ */ jsx18(
        "div",
        {
          className: "hb-pareto-bar",
          style: { height: `${d.v / max * 100}%`, width: `${step * 0.7}%` },
          title: `${d.label}: ${fmt(d.v, spec.unit)} \xB7 ${Math.round(cumulative[i] * 100)}% cumulative`,
          children: /* @__PURE__ */ jsx18("span", { className: "hb-pareto-bar-fill" })
        },
        i
      )) })
    ] }),
    /* @__PURE__ */ jsx18("div", { className: "hb-pareto-axis", children: items.map((d, i) => /* @__PURE__ */ jsx18("span", { className: "hb-pareto-label", style: { width: `${step}%` }, children: d.label }, i)) }),
    /* @__PURE__ */ jsx18("div", { className: "hb-pareto-cum", children: items.map((_, i) => /* @__PURE__ */ jsxs15("span", { className: "hb-pareto-cum-cell", style: { width: `${step}%` }, children: [
      Math.round(cumulative[i] * 100),
      "%"
    ] }, i)) }),
    spec.source && /* @__PURE__ */ jsx18("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Waterfall.tsx
import { jsx as jsx19, jsxs as jsxs16 } from "react/jsx-runtime";
function Waterfall({ spec }) {
  const deltas = spec.series[0]?.data ?? [];
  let acc = 0;
  const bars = deltas.map((d) => {
    if (typeof d !== "number") return null;
    const from = acc;
    acc += d;
    return { from, to: acc, d };
  });
  const values = bars.flatMap((b) => b ? [b.from, b.to] : []);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const n = deltas.length || 1;
  const w = 100 / n;
  const y = (v) => 100 - (v - lo) / span * 100;
  const end = acc;
  return /* @__PURE__ */ jsxs16("figure", { className: "hb-waterfall", children: [
    spec.title && /* @__PURE__ */ jsx19("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsxs16(
      "svg",
      {
        className: "hb-waterfall-svg",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        role: "img",
        "aria-label": `${spec.title ?? "Waterfall"}: starts 0, ends ${fmt(end, spec.unit)}`,
        children: [
          /* @__PURE__ */ jsx19("line", { x1: "0", y1: y(0), x2: "100", y2: y(0), stroke: "var(--hb-line-strong)", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" }),
          bars.map((b, i) => {
            if (!b) return null;
            const top = y(Math.max(b.from, b.to));
            const height = Math.abs(y(b.from) - y(b.to));
            return /* @__PURE__ */ jsx19(
              "rect",
              {
                x: i * w + w * 0.15,
                width: w * 0.7,
                y: top,
                height: Math.max(height, 0.5),
                fill: b.d >= 0 ? "var(--hb-good)" : "var(--hb-warn)",
                fillOpacity: 0.85
              },
              i
            );
          })
        ]
      }
    ),
    /* @__PURE__ */ jsx19("div", { className: "hb-waterfall-axis", children: deltas.map((_, i) => /* @__PURE__ */ jsx19("span", { className: "hb-waterfall-label", style: { width: `${w}%` }, children: spec.x[i] }, i)) }),
    /* @__PURE__ */ jsxs16("div", { className: "hb-waterfall-net", children: [
      "net ",
      /* @__PURE__ */ jsx19("strong", { children: fmt(end, spec.unit) })
    ] }),
    spec.source && /* @__PURE__ */ jsx19("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Radar.tsx
import { jsx as jsx20, jsxs as jsxs17 } from "react/jsx-runtime";
var CX2 = 50;
var CY2 = 50;
var R2 = 40;
function point2(i, n, r) {
  const angle = Math.PI * 2 * i / n - Math.PI / 2;
  return [CX2 + Math.cos(angle) * r, CY2 + Math.sin(angle) * r];
}
function Radar({ spec }) {
  const axes = spec.x;
  const n = axes.length;
  const series = spec.series.slice(0, 3);
  const max = Math.max(1, ...series.flatMap((s) => s.data.filter((v) => typeof v === "number")));
  const rings = [0.25, 0.5, 0.75, 1];
  return /* @__PURE__ */ jsxs17("figure", { className: "hb-radar", children: [
    spec.title && /* @__PURE__ */ jsx20("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsxs17("svg", { className: "hb-radar-svg", viewBox: "0 0 100 100", role: "img", "aria-label": `${spec.title ?? "Radar"} across ${axes.join(", ")}`, children: [
      rings.map((f) => /* @__PURE__ */ jsx20(
        "polygon",
        {
          fill: "none",
          stroke: "var(--hb-line)",
          strokeWidth: 0.4,
          vectorEffect: "non-scaling-stroke",
          points: axes.map((_, i) => point2(i, n, R2 * f).join(",")).join(" ")
        },
        f
      )),
      axes.map((_, i) => {
        const [x, y] = point2(i, n, R2);
        return /* @__PURE__ */ jsx20("line", { x1: CX2, y1: CY2, x2: x, y2: y, stroke: "var(--hb-line)", strokeWidth: 0.4, vectorEffect: "non-scaling-stroke" }, i);
      }),
      series.map((s, k) => /* @__PURE__ */ jsx20(
        "polygon",
        {
          fill: partColour(k),
          fillOpacity: 0.16,
          stroke: partColour(k),
          strokeWidth: 1,
          vectorEffect: "non-scaling-stroke",
          points: axes.map((_, i) => {
            const v = s.data[i];
            const f = typeof v === "number" ? Math.min(1, v / max) : 0;
            return point2(i, n, R2 * f).join(",");
          }).join(" ")
        },
        k
      ))
    ] }),
    /* @__PURE__ */ jsx20("div", { className: "hb-radar-legend", children: series.map((s, k) => /* @__PURE__ */ jsxs17("span", { className: "hb-radar-key", children: [
      /* @__PURE__ */ jsx20("i", { style: { background: partColour(k) } }),
      seriesName(series, k),
      ": ",
      s.data.filter((v) => typeof v === "number").map((v) => fmt(v, spec.unit)).join(" / ")
    ] }, k)) }),
    /* @__PURE__ */ jsx20("div", { className: "hb-radar-axes", children: axes.map((a, i) => /* @__PURE__ */ jsx20("span", { className: "hb-radar-axis-label", children: a }, i)) })
  ] });
}

// src/blocks/chart/Control.tsx
import { jsx as jsx21, jsxs as jsxs18 } from "react/jsx-runtime";
function Control({ spec }) {
  const data = spec.series[0]?.data ?? [];
  const points = data.map((v, i) => ({ i, v })).filter((p) => typeof p.v === "number");
  const values = points.map((p) => p.v);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const sd = values.length ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) : 0;
  const ucl = mean + 3 * sd;
  const lcl = mean - 3 * sd;
  const lo = Math.min(lcl, ...values);
  const hi = Math.max(ucl, ...values);
  const span = hi - lo || 1;
  const n = data.length || 1;
  const X = (i) => n <= 1 ? 50 : i / (n - 1) * 100;
  const Y = (v) => 100 - (v - lo) / span * 100;
  const outside = points.filter((p) => p.v > ucl || p.v < lcl).length;
  return /* @__PURE__ */ jsxs18("figure", { className: "hb-control", children: [
    spec.title && /* @__PURE__ */ jsx21("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsxs18(
      "svg",
      {
        className: "hb-control-svg",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        role: "img",
        "aria-label": `${spec.title ?? "Control chart"}: mean ${fmt(mean, spec.unit)}, ${outside} point(s) outside the limits`,
        children: [
          /* @__PURE__ */ jsx21("line", { x1: "0", y1: Y(ucl), x2: "100", y2: Y(ucl), stroke: "var(--hb-warn)", strokeDasharray: "3 2", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" }),
          /* @__PURE__ */ jsx21("line", { x1: "0", y1: Y(mean), x2: "100", y2: Y(mean), stroke: "var(--hb-ink-2)", strokeWidth: 0.8, vectorEffect: "non-scaling-stroke" }),
          /* @__PURE__ */ jsx21("line", { x1: "0", y1: Y(lcl), x2: "100", y2: Y(lcl), stroke: "var(--hb-warn)", strokeDasharray: "3 2", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" }),
          /* @__PURE__ */ jsx21("polyline", { points: points.map((p) => `${X(p.i)},${Y(p.v)}`).join(" "), fill: "none", stroke: "var(--hb-accent)", strokeWidth: 1, vectorEffect: "non-scaling-stroke" }),
          points.map((p) => /* @__PURE__ */ jsx21(
            "circle",
            {
              cx: X(p.i),
              cy: Y(p.v),
              r: 0.9,
              fill: p.v > ucl || p.v < lcl ? "var(--hb-warn)" : "var(--hb-accent)",
              stroke: "var(--hb-surface)",
              strokeWidth: 0.3,
              vectorEffect: "non-scaling-stroke"
            },
            p.i
          ))
        ]
      }
    ),
    /* @__PURE__ */ jsxs18("div", { className: "hb-control-note", children: [
      "mean ",
      /* @__PURE__ */ jsx21("strong", { children: fmt(mean, spec.unit) }),
      " \xB7 UCL ",
      fmt(ucl, spec.unit),
      " \xB7 LCL ",
      fmt(lcl, spec.unit),
      outside > 0 ? ` \xB7 ${outside} outside` : ""
    ] }),
    spec.source && /* @__PURE__ */ jsx21("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Bubble.tsx
import { jsx as jsx22, jsxs as jsxs19 } from "react/jsx-runtime";
function Bubble({ spec }) {
  const ys = spec.series[0]?.data ?? [];
  const sizes = spec.series[1]?.data ?? [];
  const numericX2 = spec.x.every((x) => typeof x === "number" || typeof x === "string" && x.trim() !== "" && isFinite(Number(x)));
  const xs = spec.x.map((x) => Number(x));
  const data = spec.x.map((_, i) => ({ x: numericX2 ? xs[i] : i, y: ys[i], s: sizes[i] })).filter((p) => typeof p.y === "number");
  if (!data.length) return null;
  const xLo = numericX2 ? Math.min(...data.map((d) => d.x)) : 0;
  const xHi = numericX2 ? Math.max(...data.map((d) => d.x)) : data.length - 1;
  const yLo = Math.min(...data.map((d) => d.y));
  const yHi = Math.max(...data.map((d) => d.y));
  const sizeMax = Math.max(1, ...data.map((d) => typeof d.s === "number" ? d.s : 0));
  const xSpan = xHi - xLo || 1;
  const ySpan = yHi - yLo || 1;
  const X = (v) => 6 + (numericX2 ? (v - xLo) / xSpan * 88 : data.length <= 1 ? 44 : v / (data.length - 1) * 88);
  const Y = (v) => 94 - (v - yLo) / ySpan * 88;
  const radius = (s) => typeof s === "number" ? 2 + Math.sqrt(s / sizeMax) * 7 : 4;
  return /* @__PURE__ */ jsxs19("figure", { className: "hb-bubble", children: [
    spec.title && /* @__PURE__ */ jsx22("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsx22(
      "svg",
      {
        className: "hb-bubble-svg",
        viewBox: "0 0 100 100",
        role: "img",
        "aria-label": `${spec.title ?? "Bubble"}: ${data.length} points`,
        children: data.map((d, i) => /* @__PURE__ */ jsx22(
          "circle",
          {
            cx: X(d.x),
            cy: Y(d.y),
            r: radius(d.s),
            fill: partColour(0),
            fillOpacity: 0.35,
            stroke: partColour(0),
            strokeWidth: 0.6,
            vectorEffect: "non-scaling-stroke",
            children: /* @__PURE__ */ jsx22("title", { children: `${spec.x[i] ?? `Point ${i + 1}`}: ${fmt(d.y, spec.unit)}${typeof d.s === "number" ? ` \xB7 size ${fmt(d.s)}` : ""}` })
          },
          i
        ))
      }
    ),
    /* @__PURE__ */ jsxs19("div", { className: "hb-bubble-legend", children: [
      seriesName(spec.series, 0),
      spec.series[1] ? ` \xB7 bubble size = ${seriesName(spec.series, 1)}` : ""
    ] }),
    spec.source && /* @__PURE__ */ jsx22("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Box.tsx
import { jsx as jsx23, jsxs as jsxs20 } from "react/jsx-runtime";
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[Math.min(base + 1, sorted.length - 1)];
  return sorted[base] + (next - sorted[base]) * rest;
}
function Box({ spec }) {
  const groups = spec.series.map((s, k) => ({
    label: spec.x[k] ?? s.name ?? `Group ${k + 1}`,
    values: s.data.filter((v) => typeof v === "number").sort((a, b) => a - b)
  })).filter((g) => g.values.length);
  const all = groups.flatMap((g) => g.values);
  if (!all.length) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const Y = (v) => 96 - (v - lo) / span * 90;
  const w = 100 / groups.length;
  return /* @__PURE__ */ jsxs20("figure", { className: "hb-box", children: [
    spec.title && /* @__PURE__ */ jsx23("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsx23(
      "svg",
      {
        className: "hb-box-svg",
        viewBox: "0 0 100 100",
        preserveAspectRatio: "none",
        role: "img",
        "aria-label": `${spec.title ?? "Box plot"} across ${groups.length} groups`,
        children: groups.map((g, k) => {
          const q1 = quantile(g.values, 0.25);
          const med = quantile(g.values, 0.5);
          const q3 = quantile(g.values, 0.75);
          const mn = g.values[0];
          const mx = g.values[g.values.length - 1];
          const cx = (k + 0.5) * w;
          return /* @__PURE__ */ jsxs20("g", { children: [
            /* @__PURE__ */ jsx23("line", { x1: cx, y1: Y(mn), x2: cx, y2: Y(mx), stroke: "var(--hb-ink-2)", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" }),
            /* @__PURE__ */ jsx23("line", { x1: cx - w * 0.12, y1: Y(mx), x2: cx + w * 0.12, y2: Y(mx), stroke: "var(--hb-ink-2)", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" }),
            /* @__PURE__ */ jsx23("line", { x1: cx - w * 0.12, y1: Y(mn), x2: cx + w * 0.12, y2: Y(mn), stroke: "var(--hb-ink-2)", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" }),
            /* @__PURE__ */ jsx23(
              "rect",
              {
                x: cx - w * 0.26,
                y: Y(q3),
                width: w * 0.52,
                height: Math.max(0.6, Y(q1) - Y(q3)),
                fill: "var(--hb-accent-soft)",
                stroke: "var(--hb-accent)",
                strokeWidth: 0.6,
                vectorEffect: "non-scaling-stroke"
              }
            ),
            /* @__PURE__ */ jsx23("line", { x1: cx - w * 0.26, y1: Y(med), x2: cx + w * 0.26, y2: Y(med), stroke: "var(--hb-accent)", strokeWidth: 1.1, vectorEffect: "non-scaling-stroke" })
          ] }, k);
        })
      }
    ),
    /* @__PURE__ */ jsx23("div", { className: "hb-box-axis", children: groups.map((g, k) => /* @__PURE__ */ jsx23("span", { className: "hb-box-label", style: { width: `${w}%` }, children: g.label }, k)) }),
    /* @__PURE__ */ jsxs20("div", { className: "hb-box-note", children: [
      "median of medians ",
      fmt(quantile(all.slice().sort((a, b) => a - b), 0.5), spec.unit)
    ] }),
    spec.source && /* @__PURE__ */ jsx23("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Treemap.tsx
import { jsx as jsx24, jsxs as jsxs21 } from "react/jsx-runtime";
function layout(items, x, y, w, h, out) {
  if (items.length === 1) {
    out.push({ x, y, w, h });
    return;
  }
  const total = items.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  let split = 1;
  for (let i = 0; i < items.length - 1; i += 1) {
    acc += items[i];
    if (acc >= total / 2) {
      split = i + 1;
      break;
    }
  }
  if (split >= items.length) split = items.length - 1;
  const left = items.slice(0, split);
  const right = items.slice(split);
  const frac = left.reduce((a, b) => a + b, 0) / total;
  if (w >= h) {
    layout(left, x, y, w * frac, h, out);
    layout(right, x + w * frac, y, w * (1 - frac), h, out);
  } else {
    layout(left, x, y, w, h * frac, out);
    layout(right, x, y + h * frac, w, h * (1 - frac), out);
  }
}
function Treemap({ spec }) {
  const data = spec.series[0]?.data ?? [];
  const items = spec.x.map((label, i) => ({ label, v: data[i] })).filter((d) => typeof d.v === "number" && d.v > 0).sort((a, b) => b.v - a.v);
  const total = items.reduce((s, d) => s + d.v, 0);
  if (!items.length) return null;
  const rects = [];
  layout(items.map((d) => d.v), 0, 0, 100, 100, rects);
  return /* @__PURE__ */ jsxs21("figure", { className: "hb-treemap", children: [
    spec.title && /* @__PURE__ */ jsx24("figcaption", { className: "hb-chart-title", children: spec.title }),
    /* @__PURE__ */ jsx24("div", { className: "hb-treemap-field", role: "img", "aria-label": `${spec.title ?? "Treemap"}: ${items.length} parts`, children: items.map((d, i) => {
      const r = rects[i];
      const share = total > 0 ? d.v / total : 0;
      return /* @__PURE__ */ jsxs21(
        "div",
        {
          className: "hb-treemap-cell",
          style: { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, background: partColour(i) },
          title: `${d.label}: ${fmt(d.v, spec.unit)} \xB7 ${Math.round(share * 100)}%`,
          children: [
            /* @__PURE__ */ jsx24("span", { className: "hb-treemap-label", children: d.label }),
            r.w > 20 && r.h > 22 && /* @__PURE__ */ jsx24("span", { className: "hb-treemap-value", children: fmt(d.v, spec.unit) })
          ]
        },
        i
      );
    }) }),
    spec.source && /* @__PURE__ */ jsx24("div", { className: "hb-chart-source", children: spec.source })
  ] });
}

// src/blocks/chart/Chart.tsx
import { Fragment as Fragment6, jsx as jsx25, jsxs as jsxs22 } from "react/jsx-runtime";
var WIDE_FROM = 60;
function Chart({ spec }) {
  if (spec.type === "gauge") return /* @__PURE__ */ jsx25(Gauge, { spec });
  if (spec.type === "bullet") return /* @__PURE__ */ jsx25(Bullet, { spec });
  if (spec.type === "funnel") return /* @__PURE__ */ jsx25(Funnel, { spec });
  if (spec.type === "pareto") return /* @__PURE__ */ jsx25(Pareto, { spec });
  if (spec.type === "waterfall") return /* @__PURE__ */ jsx25(Waterfall, { spec });
  if (spec.type === "radar") return /* @__PURE__ */ jsx25(Radar, { spec });
  if (spec.type === "control") return /* @__PURE__ */ jsx25(Control, { spec });
  if (spec.type === "bubble") return /* @__PURE__ */ jsx25(Bubble, { spec });
  if (spec.type === "box") return /* @__PURE__ */ jsx25(Box, { spec });
  if (spec.type === "treemap") return /* @__PURE__ */ jsx25(Treemap, { spec });
  if (spec.type === "pie" || spec.type === "donut") return /* @__PURE__ */ jsx25(PieChart, { spec });
  if (kindToDraw(spec) === "hbar") return /* @__PURE__ */ jsx25(HBarChart, { spec });
  return /* @__PURE__ */ jsx25(XYChart, { spec });
}
function XYChart({ spec }) {
  const plot = useRef6(null);
  const svg = useRef6(null);
  const width = useWidth(plot);
  const [hover, setHover] = useState8(null);
  const [drill, setDrill] = useState8(null);
  const down = useRef6(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = spec.x.length;
  const piled = spec.type === "stacked" || spec.type === "area";
  const bands = useMemo2(() => piled ? stackSeries(spec.series, n) : null, [spec, n, piled]);
  const scales = useMemo2(() => chartScales(spec, bands), [spec, bands]);
  const layout2 = useMemo2(() => xyLayout(spec, width, scales), [spec, width, scales]);
  const tip = useMemo2(() => hover === null ? null : xyTip(spec, hover, layout2), [spec, hover, layout2]);
  const clusters = useMemo2(() => {
    const by = /* @__PURE__ */ new Map();
    if (spec.type === "scatter") for (const s of dotSpots(spec, layout2)) {
      if (s.members.length > 1) for (const i of s.members) by.set(i, s);
    }
    return by;
  }, [spec, layout2]);
  const cycle = useRef6(null);
  function pickAt(e) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const x = (e.clientX - r.left) / r.width * layout2.W;
    const raw = dotIndex(e.target);
    const cl = raw === null ? void 0 : clusters.get(raw);
    if (!cl) {
      setHover(raw ?? nearestXIndex(layout2.xAt, n, x));
      return;
    }
    const prev = cycle.current;
    setHover(cl.members[prev && prev.key === cl.key ? (prev.at + 1) % cl.members.length : 0]);
  }
  function committedAt(target) {
    const raw = dotIndex(target);
    const cl = raw === null ? void 0 : clusters.get(raw);
    if (!cl) {
      cycle.current = null;
      return hover;
    }
    const prev = cycle.current;
    const at2 = prev && prev.key === cl.key ? (prev.at + 1) % cl.members.length : 0;
    cycle.current = { key: cl.key, at: at2 };
    const i = cl.members[at2];
    setHover(i);
    return i;
  }
  function detailAt(i) {
    const t = xyTip(spec, i, layout2);
    let note = t.note;
    if (!note && spec.type === "histogram") {
      const total = spec.series[0].data.reduce((sum, v) => sum + (v ?? 0), 0);
      const inBin = spec.series[0].data[i] ?? 0;
      note = total > 0 ? `${inBin} of ${total} values (${sharePct(inBin / total)})` : void 0;
    }
    if (!note && spec.type === "scatter") {
      const cl = clusters.get(i);
      note = cl ? `Point ${i + 1} of ${n} \u2014 ${ordinal(cl.members.indexOf(i) + 1)} of ${cl.members.length} here` : `Point ${i + 1} of ${n}`;
    }
    return { datum: t.title, chartTitle: spec.title, kind: KIND_WORDS[spec.type], rows: t.rows, note, source: spec.source };
  }
  const open = (i) => i !== null && setDrill({ at: i, detail: detailAt(i) });
  const close = () => {
    setDrill(null);
    svg.current?.focus();
  };
  const pick2 = (i) => {
    if (i !== null || !drill) setHover(i);
  };
  const multiLegend = spec.type === "combo" || spec.type === "bar" && spec.series.length > 1 || spec.type === "line" && spec.series.length > 1;
  const wide = spec.type === "line" && n >= WIDE_FROM;
  return /* @__PURE__ */ jsxs22(Fragment6, { children: [
    /* @__PURE__ */ jsxs22("figure", { className: `hb-card hb-chart${wide ? " hb-chart-wide" : ""}`, children: [
      /* @__PURE__ */ jsx25(Headline, { spec, hover }),
      /* @__PURE__ */ jsxs22("div", { ref: plot, className: "hb-chart-plot", children: [
        /* @__PURE__ */ jsxs22(
          "svg",
          {
            ref: svg,
            width: "100%",
            height: layout2.H,
            viewBox: `0 0 ${layout2.W} ${layout2.H}`,
            className: "hb-chart-svg",
            role: "img",
            "aria-label": spec.title ?? "chart",
            ...pickKeys(n, hover, pick2, false, () => open(hover)),
            onPointerDown: (e) => {
              down.current = { x: e.clientX, y: e.clientY };
              pickAt(e);
            },
            onPointerMove: (e) => (e.buttons || e.pointerType === "mouse") && pickAt(e),
            onPointerLeave: () => pick2(null),
            onClick: (e) => {
              const d = down.current;
              if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) open(committedAt(e.target));
            },
            children: [
              /* @__PURE__ */ jsx25(XLabels, { spec, layout: layout2 }),
              spec.type === "line" && /* @__PURE__ */ jsx25(LineMarks, { spec, layout: layout2, gid, hover }),
              spec.type === "bar" && /* @__PURE__ */ jsx25(BarMarks, { spec, layout: layout2, hover }),
              spec.type === "histogram" && /* @__PURE__ */ jsx25(BarMarks, { spec, layout: layout2, hover }),
              spec.type === "scatter" && /* @__PURE__ */ jsx25(ScatterMarks, { spec, layout: layout2, hover }),
              spec.type === "stacked" && bands && /* @__PURE__ */ jsx25(StackMarks, { bands, layout: layout2, hover }),
              spec.type === "area" && bands && /* @__PURE__ */ jsx25(AreaMarks, { bands, layout: layout2 }),
              spec.type === "combo" && /* @__PURE__ */ jsx25(ComboMarks, { spec, layout: layout2, hover }),
              (spec.type === "area" || spec.type === "combo") && hover !== null && /* @__PURE__ */ jsx25(Crosshair, { layout: layout2, at: hover })
            ]
          }
        ),
        /* @__PURE__ */ jsx25(ChartTip, { tip })
      ] }),
      multiLegend && /* @__PURE__ */ jsx25(ChartLegend, { series: spec.series }),
      piled && spec.series.length > 1 && /* @__PURE__ */ jsx25(ChartLegend, { series: spec.series, at: hover ?? lastIndex(spec), unit: spec.unit }),
      spec.source && /* @__PURE__ */ jsx25("div", { className: "hb-chart-source", children: spec.source })
    ] }),
    drill && /* @__PURE__ */ jsx25(ChartDetail, { detail: drill.detail, onClose: close })
  ] });
}
function lastIndex(spec) {
  const { last } = seriesEnds(spec.series[0].data);
  return last < 0 ? spec.x.length - 1 : last;
}
function nearestXIndex(xAt, n, px) {
  let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - px) < Math.abs(xAt(best) - px)) best = i;
  return best;
}
function ordinal(k) {
  return k % 100 >= 11 && k % 100 <= 13 ? `${k}th` : `${k}${["th", "st", "nd", "rd"][k % 10] ?? "th"}`;
}
function dotIndex(target) {
  const pt = target?.dataset?.pt;
  return pt === void 0 ? null : Number(pt);
}
function totalOf(data) {
  return data.reduce((sum, v) => sum + (v ?? 0), 0);
}
function Headline({ spec, hover }) {
  const piled = spec.type === "stacked" || spec.type === "area";
  const pct = spec.type === "line" ? changePct(spec.series[0].data) : null;
  const shown = hover ?? lastIndex(spec);
  const big = piled ? totalAt(spec.series, shown) : spec.type === "histogram" && hover === null ? totalOf(spec.series[0].data) : spec.series[0].data[shown] ?? null;
  const bigUnit = piled ? spec.unit : spec.series[0].unit ?? spec.unit;
  const listed2 = piled ? [] : spec.series.slice(1);
  const withFigure = spec.figure !== false;
  return /* @__PURE__ */ jsxs22(Fragment6, { children: [
    /* @__PURE__ */ jsxs22("figcaption", { className: "hb-chart-head", children: [
      /* @__PURE__ */ jsx25("span", { className: "hb-chart-title", children: spec.title ?? spec.series[0].name ?? "Chart" }),
      pct !== null && withFigure && /* @__PURE__ */ jsxs22("span", { className: `hb-chip ${pct >= 0 ? "hb-chip-good" : "hb-chip-warn"}`, children: [
        pct >= 0 ? "\u25B2" : "\u25BC",
        " ",
        Math.abs(pct).toFixed(1),
        "%"
      ] })
    ] }),
    withFigure && /* @__PURE__ */ jsxs22("div", { className: "hb-chart-figure", children: [
      /* @__PURE__ */ jsx25("span", { className: "hb-chart-big", children: big === null ? "\u2013" : fmt(big, bigUnit) }),
      /* @__PURE__ */ jsxs22("span", { className: "hb-chart-at", children: [
        hover !== null ? spec.x[shown] : "",
        listed2.map((s, k) => {
          const v = s.data[shown] ?? null;
          return v === null ? null : /* @__PURE__ */ jsxs22("span", { className: "hb-chart-other", children: [
            s.name ? `${s.name} ` : "",
            fmt(v, s.unit ?? spec.unit)
          ] }, k);
        })
      ] })
    ] })
  ] });
}
function XLabels({ spec, layout: layout2 }) {
  const last = spec.x.length - 1;
  const anchor = (i) => layout2.slotted ? "middle" : i === 0 && last > 0 ? "start" : i === last && last > 0 ? "end" : "middle";
  return /* @__PURE__ */ jsx25("g", { children: layout2.xLabels.map((i) => /* @__PURE__ */ jsx25("text", { x: layout2.xAt(i), y: layout2.H - 7, textAnchor: anchor(i), className: "hb-chart-axis", children: String(spec.x[i]) }, i)) });
}

// src/blocks/calculator/Calculator.tsx
import { jsx as jsx26, jsxs as jsxs23 } from "react/jsx-runtime";
function Calculator({ title, inputs, outputs, chart }) {
  const [answers, write] = useStoredValue({
    door: "identity",
    initial: () => Object.fromEntries(inputs.map((x) => [x.id, x.value])),
    revive: (saved) => {
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
      const known = new Set(inputs.map((x) => x.id));
      const out = {};
      for (const [id, v] of Object.entries(saved)) {
        if (known.has(id) && typeof v === "number" && isFinite(v)) out[id] = v;
      }
      return out;
    },
    stored: (value) => value
  });
  const values = useMemo3(() => new Map(inputs.map((x) => [x.id, answers[x.id] ?? x.value])), [inputs, answers]);
  const move = (id, v) => write({ ...answers, [id]: v });
  const spec = useMemo3(() => chart ? calcChartSpec(chart, values) : null, [chart, values]);
  return /* @__PURE__ */ jsxs23("div", { className: "hb-card hb-calc", children: [
    title && /* @__PURE__ */ jsx26("div", { className: "hb-card-title", children: /* @__PURE__ */ jsx26(InlineText, { text: title }) }),
    inputs.map((input) => /* @__PURE__ */ jsx26(Slider, { input, value: values.get(input.id) ?? input.value, onMove: (v) => move(input.id, v) }, input.id)),
    outputs.length > 0 && /* @__PURE__ */ jsx26("div", { className: "hb-calc-results", children: outputs.map((o, i) => /* @__PURE__ */ jsx26(Result, { output: o, values }, i)) }),
    spec && /* @__PURE__ */ jsx26(Chart, { spec })
  ] });
}
function Slider({ input, value, onMove }) {
  return /* @__PURE__ */ jsxs23("label", { className: "hb-calc-slider", children: [
    /* @__PURE__ */ jsxs23("span", { className: "hb-calc-head", children: [
      /* @__PURE__ */ jsx26("span", { className: "hb-calc-label", children: /* @__PURE__ */ jsx26(InlineText, { text: input.label }) }),
      /* @__PURE__ */ jsx26("span", { className: "hb-calc-value", children: formatWithUnit(value, input.unit) })
    ] }),
    /* @__PURE__ */ jsx26(
      "input",
      {
        type: "range",
        className: "hb-range",
        min: input.min,
        max: input.max,
        step: input.step,
        value,
        onChange: (e) => onMove(Number(e.target.value))
      }
    ),
    /* @__PURE__ */ jsxs23("span", { className: "hb-calc-ends", children: [
      /* @__PURE__ */ jsx26("span", { children: formatWithUnit(input.min, input.unit) }),
      /* @__PURE__ */ jsx26("span", { children: formatWithUnit(input.max, input.unit) })
    ] })
  ] });
}
function Result({ output, values }) {
  const value = evaluate(output.formula, values);
  return /* @__PURE__ */ jsxs23("div", { className: "hb-calc-result", children: [
    /* @__PURE__ */ jsx26("div", { className: "hb-calc-result-label", children: /* @__PURE__ */ jsx26(InlineText, { text: output.label }) }),
    /* @__PURE__ */ jsx26("div", { className: "hb-calc-result-value", "aria-live": "polite", children: value === null ? "\u2013" : formatWithUnit(value, output.unit) })
  ] });
}

// src/blocks/calculator/read.ts
var MAX_INPUTS = 6;
var MAX_OUTPUTS = 6;
var ID2 = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
function readCalculator(raw, here) {
  const inputs = [];
  const rawInputs = firstList([raw.inputs, raw.sliders]) ?? [];
  rawInputs.forEach((item, i) => {
    const where = here.at("inputs").at(i);
    const input = readInput(item, where);
    if (!input) return;
    if (inputs.some((x) => x.id === input.id)) {
      where.drop(`input id "${input.id}" is used twice`);
      return;
    }
    inputs.push(input);
  });
  if (!inputs.length) return here.drop("calculator has no usable input");
  const kept = keepFirst(inputs, MAX_INPUTS, here, "inputs");
  const ids = kept.map((x) => x.id);
  const outputs = [];
  const rawOutputs = firstList([raw.outputs, raw.results]) ?? [];
  rawOutputs.forEach((item, i) => {
    const output = readOutput(item, ids, here.at("outputs").at(i));
    if (output) outputs.push(output);
  });
  const title = firstText([raw.title], 80);
  const chart = raw.chart === void 0 ? void 0 : readCalcChart(raw.chart, ids, here.at("chart"));
  return clean({ type: "calculator", title, inputs: kept, outputs: keepFirst(outputs, MAX_OUTPUTS, here, "outputs"), chart });
}
function readInput(item, here) {
  if (!item || typeof item !== "object") return here.drop("input is not an object");
  const id = firstText([item.id, item.name, item.key], 24);
  if (!id || !ID2.test(id) || isHelper(id)) return here.drop(`input needs an id like "p" or "rate" (got ${JSON.stringify(id ?? null)})`);
  const label = firstText([item.label, item.title], 40) ?? id;
  const given = num(item.value) ?? num(item.default);
  const min = num(item.min) ?? 0;
  const max = num(item.max) ?? defaultMax(given);
  if (max <= min) return here.drop("input's max must be above its min");
  const step = positive(num(item.step)) ?? niceStep((max - min) / 100);
  const value = Math.min(max, Math.max(min, given ?? min));
  return clean({ id, label, min, max, step, value, unit: firstText([item.unit], 12) });
}
function readOutput(item, ids, here) {
  if (!item || typeof item !== "object") return here.drop("output is not an object");
  const label = firstText([item.label, item.title, item.name], 40);
  const formula = firstText([item.formula, item.expr, item.value], 300);
  if (!label || !formula) return here.drop("output needs a label and a formula");
  try {
    const unknown = namesIn(parseFormula(formula)).filter((name) => !ids.includes(name));
    if (unknown.length) here.drop(`formula uses ${unknown.join(", ")}, which no input has; shows \u2013`);
  } catch (e) {
    here.drop(`formula can't be read (${e.message}); shows \u2013`);
  }
  return clean({ label, formula, unit: firstText([item.unit], 12) });
}
function defaultMax(value) {
  if (value !== null && value > 0) return value * 2;
  return 100;
}
function positive(v) {
  if (v !== null && v > 0) return v;
  return null;
}
function niceStep(rough) {
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  if (scaled < 1.5) return power;
  if (scaled < 3.5) return 2 * power;
  if (scaled < 7.5) return 5 * power;
  return 10 * power;
}

// src/blocks/callout/Callout.tsx
import { jsx as jsx27, jsxs as jsxs24 } from "react/jsx-runtime";
var TONE_ICON = { info: "info", tip: "spark", warn: "alert" };
function Callout({ tone: tone2, title, text }) {
  return /* @__PURE__ */ jsxs24("div", { className: `hb-callout hb-callout-${tone2}`, children: [
    /* @__PURE__ */ jsx27("span", { className: "hb-callout-icon", children: /* @__PURE__ */ jsx27(Icon, { name: TONE_ICON[tone2], size: 17, stroke: 2.2 }) }),
    /* @__PURE__ */ jsxs24("div", { className: "hb-callout-body", children: [
      title && /* @__PURE__ */ jsx27("div", { className: "hb-callout-title", children: /* @__PURE__ */ jsx27(InlineText, { text: title }) }),
      /* @__PURE__ */ jsx27("div", { children: /* @__PURE__ */ jsx27(InlineText, { text }) })
    ] })
  ] });
}

// src/blocks/callout/read.ts
var TONES = {
  info: "info",
  note: "info",
  neutral: "info",
  tip: "tip",
  success: "tip",
  good: "tip",
  idea: "tip",
  warn: "warn",
  warning: "warn",
  caution: "warn",
  danger: "warn",
  alert: "warn",
  error: "warn"
};
function readCallout(raw, here) {
  const toneWord = firstText([raw.tone, raw.variant], 20)?.toLowerCase() ?? "info";
  const tone2 = TONES[toneWord] ?? "info";
  let title = firstText([raw.title], 80);
  let text = firstWords([raw.text, raw.body, raw.message, raw.content], 400);
  if (!text && title) {
    text = title;
    title = void 0;
  }
  if (!text) return here.drop("callout needs text");
  return clean({ type: "callout", tone: tone2, title, text });
}

// src/blocks/cards/Cards.tsx
import { useContext as useContext4 } from "react";
import { jsx as jsx28, jsxs as jsxs25 } from "react/jsx-runtime";
var STATUS_TONE = { active: "good", done: "good", parked: "warn", archived: "neutral" };
var RING_STROKE = {
  good: "var(--hb-good)",
  warn: "var(--hb-warn)",
  bad: "var(--hb-warn)",
  neutral: "var(--hb-accent)"
};
function Cards({ items, columns }) {
  return /* @__PURE__ */ jsx28("div", { className: `hb-cards hb-cards-${columns === 1 ? 1 : 2}`, children: items.map((card, i) => /* @__PURE__ */ jsx28(Card, { card }, i)) });
}
function Card({ card }) {
  const { send } = useContext4(BlockActions);
  const band = card.ring || card.metrics && card.metrics.length;
  const action = card.action;
  return /* @__PURE__ */ jsxs25("article", { className: "hb-card", "aria-label": cardLabel(card), children: [
    /* @__PURE__ */ jsxs25("header", { className: "hb-card-head", children: [
      /* @__PURE__ */ jsxs25("div", { className: "hb-card-titles", children: [
        /* @__PURE__ */ jsx28("h3", { className: "hb-card-title", children: card.title }),
        card.id && /* @__PURE__ */ jsx28("div", { className: "hb-card-id", children: card.id })
      ] }),
      card.status && /* @__PURE__ */ jsx28("span", { className: `hb-card-chip hb-tone-${STATUS_TONE[card.status] ?? "neutral"}`, children: card.status })
    ] }),
    band && /* @__PURE__ */ jsxs25("div", { className: "hb-card-band", children: [
      card.ring && /* @__PURE__ */ jsx28(Ring, { ring: card.ring }),
      card.metrics && card.metrics.length > 0 && /* @__PURE__ */ jsx28("dl", { className: "hb-card-metrics", children: card.metrics.map((m, i) => /* @__PURE__ */ jsxs25("div", { className: "hb-card-metric", children: [
        /* @__PURE__ */ jsx28("dt", { children: m.label }),
        /* @__PURE__ */ jsx28("dd", { className: isUnknownWord(m.value) ? "hb-tone-neutral" : `hb-tone-${m.tone ?? "neutral"}`, children: m.value })
      ] }, i)) })
    ] }),
    /* @__PURE__ */ jsx28(Facts, { card }),
    /* @__PURE__ */ jsx28(NeedsLine, { card }),
    (card.freshness || action) && /* @__PURE__ */ jsxs25("footer", { className: "hb-card-foot", children: [
      /* @__PURE__ */ jsx28("span", { className: "hb-card-fresh", children: card.freshness ?? "" }),
      action && (action.run ? /* @__PURE__ */ jsx28("button", { type: "button", className: "hb-card-action", onClick: () => send(action.run), children: action.label }) : action.url ? /* @__PURE__ */ jsx28("a", { className: "hb-card-action", href: action.url, target: "_blank", rel: "noreferrer", children: action.label }) : null)
    ] })
  ] });
}
function Facts({ card }) {
  const rows2 = [
    ["owner", card.owner],
    ["milestone", card.milestone],
    ["trend", card.trend],
    ["budget", card.budget],
    ["ARR", card.arr]
  ];
  const shown = rows2.filter(([, v]) => v);
  if (!shown.length) return null;
  return /* @__PURE__ */ jsx28("dl", { className: "hb-card-facts", children: shown.map(([k, v]) => /* @__PURE__ */ jsxs25("div", { children: [
    /* @__PURE__ */ jsx28("dt", { children: k }),
    /* @__PURE__ */ jsx28("dd", { className: k === "trend" ? trendTone(v) : void 0, children: v })
  ] }, k)) });
}
function trendTone(v) {
  const t = v.trim();
  const down = t.startsWith("-") || /down|▼|↓/i.test(t);
  const up = t.startsWith("+") || /up|▲|↑/i.test(t);
  return `hb-tone-${down ? "bad" : up ? "good" : "neutral"}`;
}
function NeedsLine({ card }) {
  if (card.needs?.text) {
    return /* @__PURE__ */ jsxs25("p", { className: `hb-card-needs hb-tone-${card.needs.tone ?? "warn"}`, children: [
      /* @__PURE__ */ jsx28("span", { className: "hb-card-dot" }),
      card.needs.text
    ] });
  }
  const word = cardIsUnknown(card) ? "unknown" : "clear";
  return /* @__PURE__ */ jsxs25("p", { className: `hb-card-needs hb-tone-${word === "unknown" ? "neutral" : "good"}`, children: [
    /* @__PURE__ */ jsx28("span", { className: "hb-card-dot" }),
    word
  ] });
}
function Ring({ ring }) {
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const arc2 = circumference / 4 * 0.9;
  const centre = ring.label ?? (ring.at !== void 0 ? ring.stages[ring.at] : "unknown");
  const stroke = RING_STROKE[ring.tone ?? "neutral"] ?? "var(--hb-accent)";
  return /* @__PURE__ */ jsxs25(
    "svg",
    {
      className: "hb-card-ring",
      viewBox: "0 0 40 40",
      width: "40",
      height: "40",
      role: "img",
      "aria-label": ringLabel(ring),
      children: [
        ring.stages.map((_, i) => {
          const current = ring.at === i;
          return /* @__PURE__ */ jsx28(
            "circle",
            {
              cx: "20",
              cy: "20",
              r,
              fill: "none",
              stroke: current ? stroke : "var(--hb-line-strong, var(--hb-line))",
              strokeOpacity: current ? 1 : 0.55,
              strokeWidth: current ? 4.6 : 3,
              strokeLinecap: "round",
              strokeDasharray: `${arc2} ${circumference - arc2}`,
              transform: `rotate(${i * 90 - 90} 20 20)`
            },
            i
          );
        }),
        /* @__PURE__ */ jsx28("text", { x: "20", y: "22.5", textAnchor: "middle", className: "hb-card-ring-label", children: centre.slice(0, 7) })
      ]
    }
  );
}
function isUnknownWord(value) {
  return value.trim().toLowerCase() === "unknown";
}
function cardIsUnknown(card) {
  const metricUnknown = (card.metrics ?? []).some((m) => isUnknownWord(m.value));
  const ringUnknown = card.ring?.label ? isUnknownWord(card.ring.label) : false;
  return metricUnknown || ringUnknown;
}
function ringLabel(ring) {
  const path = `Lifecycle ${ring.stages.join(" to ")}`;
  const now = ring.at !== void 0 ? `, now ${ring.stages[ring.at]}` : "";
  const health = ring.label ? `, health ${ring.label}` : "";
  return `${path}${now}${health}`;
}
function cardLabel(card) {
  const status3 = card.status ? `, ${card.status}` : "";
  const needs = card.needs?.text ? `, needs you: ${card.needs.text}` : "";
  return `${card.title}${status3}${needs}`;
}

// src/blocks/cards/read.ts
var MAX_CARDS = 14;
var MAX_METRICS = 3;
var STATUSES = ["active", "parked", "done", "archived"];
var TONES2 = ["good", "warn", "bad", "neutral"];
function tone(v) {
  if (typeof v !== "string") return void 0;
  const word = v.trim().toLowerCase();
  return TONES2.includes(word) ? word : void 0;
}
function status(v) {
  if (typeof v !== "string") return void 0;
  const word = v.trim().toLowerCase();
  return STATUSES.includes(word) ? word : void 0;
}
function readCards(raw, here) {
  const list = firstList([raw.items, raw.cards]);
  if (!list) return here.drop("cards needs items");
  const items = [];
  list.forEach((item, i) => {
    const card = readCard(item);
    if (!card) {
      here.at("items").at(i).drop("card has no title");
      return;
    }
    if (card.action?.run && actsBeforeTheModel(card.action.run)) {
      here.at("items").at(i).drop(NO_SEND);
      return;
    }
    items.push(card);
  });
  if (!items.length) return here.drop("cards has no card with a title");
  const columns = raw.columns === 1 ? 1 : raw.columns === 2 ? 2 : void 0;
  return clean({ type: "cards", columns, items: keepFirst(items, MAX_CARDS, here, "cards") });
}
function readCard(item) {
  if (!item || typeof item !== "object") return null;
  const title = str(item.title, 80);
  if (!title) return null;
  return clean({
    title,
    id: str(item.id, 40),
    status: status(item.status),
    ring: readRing(item.ring),
    metrics: readMetrics(item.metrics),
    needs: readNeeds(item.needs),
    freshness: str(item.freshness, 60),
    action: readAction(item.action),
    owner: str(item.owner, 40),
    milestone: str(item.milestone, 60),
    trend: str(item.trend, 20),
    budget: str(item.budget, 40),
    arr: str(item.arr, 40)
  });
}
function readRing(v) {
  if (!v || typeof v !== "object" || !Array.isArray(v.stages)) return void 0;
  const stages = v.stages.filter((s) => typeof s === "string" && s.trim() !== "").map((s) => s.trim().slice(0, 24)).slice(0, 4);
  if (stages.length !== 4) return void 0;
  const at2 = Number.isInteger(v.at) && v.at >= 0 && v.at <= 3 ? v.at : void 0;
  return clean({ stages, at: at2, label: str(v.label, 24), tone: tone(v.tone) });
}
function readMetrics(v) {
  if (!Array.isArray(v)) return void 0;
  const out = [];
  for (const m of v) {
    if (!m || typeof m !== "object") continue;
    const label = str(m.label, 60);
    const value = str(m.value, 60) ?? (typeof m.value === "number" ? String(m.value) : void 0);
    if (!label || value === void 0) continue;
    out.push(clean({ label, value, tone: tone(m.tone) }));
    if (out.length >= MAX_METRICS) break;
  }
  return out.length ? out : void 0;
}
function readNeeds(v) {
  if (!v || typeof v !== "object") return void 0;
  const text = str(v.text, 160);
  return text ? clean({ text, tone: tone(v.tone) }) : void 0;
}
function readAction(v) {
  if (!v || typeof v !== "object") return void 0;
  const label = str(v.label, 60);
  if (!label) return void 0;
  return clean({ label, run: str(v.run, 300), url: https(v.url) });
}

// src/blocks/tasks/Tasks.tsx
import { useContext as useContext5 } from "react";
import { Fragment as Fragment7, jsx as jsx29, jsxs as jsxs26 } from "react/jsx-runtime";
var GLYPH = { todo: "\u25CB", doing: "\u25D0", blocked: "\u2715", done: "\u25CF" };
var STATUS_TONE2 = { todo: "neutral", doing: "good", blocked: "bad", done: "good" };
var PRIORITY_TONE = { low: "neutral", med: "warn", high: "bad" };
function Tasks({ items, title }) {
  const { send } = useContext5(BlockActions);
  return /* @__PURE__ */ jsxs26("figure", { className: "hb-tasks", children: [
    title && /* @__PURE__ */ jsx29("figcaption", { className: "hb-chart-title", children: title }),
    /* @__PURE__ */ jsx29("ul", { className: "hb-task-list", children: items.map((task, i) => /* @__PURE__ */ jsx29(Task, { task, onRun: task.run ? () => send(task.run) : void 0 }, i)) })
  ] });
}
function Task({ task, onRun }) {
  const status3 = task.status ?? "todo";
  const body = /* @__PURE__ */ jsxs26(Fragment7, { children: [
    /* @__PURE__ */ jsx29("span", { className: `hb-task-box hb-tone-${STATUS_TONE2[status3]}`, "aria-hidden": "true", children: GLYPH[status3] }),
    /* @__PURE__ */ jsxs26("span", { className: "hb-task-text", children: [
      /* @__PURE__ */ jsx29("span", { className: `hb-task-title${status3 === "done" ? " hb-task-done" : ""}`, children: task.title }),
      (task.owner || task.due || task.priority) && /* @__PURE__ */ jsxs26("span", { className: "hb-task-meta", children: [
        task.owner && /* @__PURE__ */ jsx29("span", { className: "hb-task-owner", children: task.owner }),
        task.due && /* @__PURE__ */ jsx29("span", { className: "hb-task-due", children: task.due }),
        task.priority && /* @__PURE__ */ jsx29("span", { className: `hb-task-prio hb-tone-${PRIORITY_TONE[task.priority]}`, children: task.priority })
      ] }),
      task.note && /* @__PURE__ */ jsx29("span", { className: "hb-task-note", children: task.note })
    ] })
  ] });
  const label = `${task.title}, ${status3}${task.owner ? `, ${task.owner}` : ""}`;
  return /* @__PURE__ */ jsx29("li", { className: "hb-task", "aria-label": label, children: onRun ? /* @__PURE__ */ jsx29("button", { type: "button", className: "hb-task-hit", onClick: onRun, children: body }) : /* @__PURE__ */ jsx29("div", { className: "hb-task-hit hb-task-static", children: body }) });
}

// src/blocks/tasks/read.ts
var MAX_TASKS = 40;
var STATUSES2 = ["todo", "doing", "blocked", "done"];
var PRIORITIES = ["low", "med", "high"];
function status2(v) {
  if (typeof v !== "string") return void 0;
  const w = v.trim().toLowerCase();
  return STATUSES2.includes(w) ? w : void 0;
}
function priority(v) {
  if (typeof v !== "string") return void 0;
  const w = v.trim().toLowerCase();
  return PRIORITIES.includes(w) ? w : void 0;
}
function readTasks(raw, here) {
  const list = Array.isArray(raw.items) ? raw.items : void 0;
  if (!list) return here.drop("tasks needs items");
  const items = [];
  list.forEach((item, i) => {
    const title = item && typeof item === "object" ? str(item.title, 140) : void 0;
    if (!title) {
      here.at("items").at(i).drop("task needs a title");
      return;
    }
    if (actsBeforeTheModel(item.run)) {
      here.at("items").at(i).drop(NO_SEND);
      return;
    }
    items.push(clean({
      title,
      owner: str(item.owner, 40),
      due: str(item.due, 40),
      status: status2(item.status),
      priority: priority(item.priority),
      note: str(item.note, 200),
      run: str(item.run, 300)
    }));
  });
  if (!items.length) return here.drop("tasks has no titled task");
  return clean({ type: "tasks", title: str(raw.title, 80), items: keepFirst(items, MAX_TASKS, here, "tasks") });
}

// src/blocks/result/Result.tsx
import { jsx as jsx30, jsxs as jsxs27 } from "react/jsx-runtime";
function Result2({ title, body, sources, model }) {
  return /* @__PURE__ */ jsxs27("figure", { className: "hb-result", children: [
    title && /* @__PURE__ */ jsx30("figcaption", { className: "hb-result-title", children: title }),
    /* @__PURE__ */ jsx30("p", { className: "hb-result-body", children: body }),
    sources && sources.length > 0 && /* @__PURE__ */ jsx30("ul", { className: "hb-result-sources", children: sources.map((s, i) => /* @__PURE__ */ jsx30("li", { children: s.url ? /* @__PURE__ */ jsx30("a", { href: s.url, target: "_blank", rel: "noreferrer", children: s.label }) : s.label }, i)) }),
    model && /* @__PURE__ */ jsxs27("div", { className: "hb-result-model", children: [
      "by ",
      model
    ] })
  ] });
}

// src/blocks/result/read.ts
var MAX_SOURCES = 6;
function readResult(raw, here) {
  const body = str(raw.body, 2e3);
  if (!body) return here.drop("result needs body text");
  const sources = Array.isArray(raw.sources) ? raw.sources.map((s) => {
    const label = s && typeof s === "object" ? str(s.label, 80) : void 0;
    return label ? clean({ label, url: https(s.url) }) : null;
  }).filter(Boolean).slice(0, MAX_SOURCES) : [];
  return clean({
    type: "result",
    title: str(raw.title, 80),
    body,
    sources: sources.length ? sources : void 0,
    model: str(raw.model, 60)
  });
}

// src/blocks/suggestions/Suggestions.tsx
import { useContext as useContext6 } from "react";
import { jsx as jsx31, jsxs as jsxs28 } from "react/jsx-runtime";
function Suggestions({ items, title }) {
  const { send } = useContext6(BlockActions);
  return /* @__PURE__ */ jsxs28("figure", { className: "hb-suggestions", children: [
    title && /* @__PURE__ */ jsx31("figcaption", { className: "hb-chart-title", children: title }),
    /* @__PURE__ */ jsx31("ul", { className: "hb-sug-list", children: items.map((s, i) => /* @__PURE__ */ jsxs28("li", { className: "hb-sug", children: [
      /* @__PURE__ */ jsx31("span", { className: "hb-sug-text", children: s.text }),
      s.reason && /* @__PURE__ */ jsx31("span", { className: "hb-sug-reason", children: s.reason }),
      (s.accept || s.skip) && /* @__PURE__ */ jsxs28("span", { className: "hb-sug-actions", children: [
        s.accept && /* @__PURE__ */ jsx31("button", { type: "button", className: "hb-sug-btn hb-sug-accept", onClick: () => send(s.accept), children: "Accept" }),
        s.skip && /* @__PURE__ */ jsx31("button", { type: "button", className: "hb-sug-btn hb-sug-skip", onClick: () => send(s.skip), children: "Skip" })
      ] })
    ] }, i)) })
  ] });
}

// src/blocks/suggestions/read.ts
var MAX_SUG = 20;
function readSuggestions(raw, here) {
  const list = Array.isArray(raw.items) ? raw.items : void 0;
  if (!list) return here.drop("suggestions needs items");
  const items = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      here.at("items").at(i).drop("suggestion needs text");
      return;
    }
    const text = str(item.text, 200);
    if (!text) {
      here.at("items").at(i).drop("suggestion needs text");
      return;
    }
    if (actsBeforeTheModel(item.accept) || actsBeforeTheModel(item.skip)) {
      here.at("items").at(i).drop(NO_SEND);
      return;
    }
    items.push(clean({ text, reason: str(item.reason, 200), accept: str(item.accept, 300), skip: str(item.skip, 300) }));
  });
  if (!items.length) return here.drop("suggestions has no suggestion with text");
  return clean({ type: "suggestions", title: str(raw.title, 80), items: keepFirst(items, MAX_SUG, here, "suggestions") });
}

// src/blocks/chart/read.ts
function readChart(raw, here) {
  const spec = readSpec(raw);
  if (!spec) return here.drop("chart needs x labels and at least one series");
  return { type: "chart", spec };
}
function readSpec(d) {
  const type = chartKind(d.kind);
  if (!Array.isArray(d.x) && type !== "histogram" && type !== "gauge" && type !== "box") return null;
  if (!Array.isArray(d.series) || !d.series.length) return null;
  const unit = typeof d.unit === "string" ? d.unit : void 0;
  let x = Array.isArray(d.x) ? d.x.map(String) : [];
  let series = d.series.filter((s) => s && Array.isArray(s.data)).slice(0, maxSeries(type)).map((s, k) => readSeries(s, k, type, unit));
  if (!series.length || series.every((s) => s.data.every((v) => v === null))) return null;
  if (type === "pie" || type === "donut") {
    const slices2 = pieSlices(x, series[0].data);
    if (!slices2.x.length) return null;
    x = slices2.x;
    series = [{ ...series[0], data: slices2.data }];
  }
  if (type === "histogram") {
    const bins = histogramBins(series[0].data.filter((v) => v !== null));
    if (!bins.labels.length) return null;
    x = bins.labels;
    series = [{ name: series[0].name, data: bins.counts }];
  }
  const spec = {
    type,
    title: typeof d.title === "string" ? d.title : void 0,
    x,
    series,
    unit: type === "histogram" ? void 0 : unit,
    source: typeof d.source === "string" ? d.source : void 0
  };
  if (typeof d.figure === "boolean") spec.figure = d.figure;
  if (d.tone === "change") spec.tone = "change";
  if (type === "gauge") {
    if (typeof d.min === "number" && isFinite(d.min)) spec.min = d.min;
    if (typeof d.max === "number" && isFinite(d.max)) spec.max = d.max;
    if (typeof d.target === "number" && isFinite(d.target)) spec.target = d.target;
  }
  if (type === "bullet" && Array.isArray(d.bands)) {
    const bands = d.bands.filter((v) => typeof v === "number" && isFinite(v));
    if (bands.length) spec.bands = bands;
  }
  return spec;
}
function readSeries(s, k, type, chartUnit) {
  const name = typeof s.name === "string" ? s.name : void 0;
  const data = s.data.map((v) => typeof v === "number" && isFinite(v) ? v : null);
  const unit = typeof s.unit === "string" ? s.unit : void 0;
  const right = isOnRightScale(type, k, unit, s.axis, chartUnit);
  return { name, data, unit, right };
}

// src/blocks/checklist/Checklist.tsx
import { jsx as jsx32, jsxs as jsxs29 } from "react/jsx-runtime";
function Checklist({ title, numbered, items, ticked, path }) {
  const [ticks, tap] = useSavedTicks(path, ticked, items.length);
  const done = ticks.length;
  const allDone = done === items.length;
  return /* @__PURE__ */ jsxs29("div", { className: "hb-card hb-checklist", children: [
    /* @__PURE__ */ jsxs29("div", { className: "hb-checklist-head", children: [
      title && /* @__PURE__ */ jsx32("span", { className: "hb-card-title", children: /* @__PURE__ */ jsx32(InlineText, { text: title }) }),
      /* @__PURE__ */ jsx32("span", { className: allDone ? "hb-checklist-count hb-checklist-count-done" : "hb-checklist-count", "aria-live": "polite", children: allDone ? "All done" : `${done} of ${items.length} done` })
    ] }),
    /* @__PURE__ */ jsx32("div", { className: "hb-checklist-track", children: /* @__PURE__ */ jsx32("span", { className: "hb-checklist-fill", style: { width: `${done / items.length * 100}%` } }) }),
    items.map((item, i) => /* @__PURE__ */ jsxs29("div", { children: [
      startsGroup(items, i) && /* @__PURE__ */ jsx32("div", { className: "hb-checklist-group", children: /* @__PURE__ */ jsx32(InlineText, { text: item.group }) }),
      /* @__PURE__ */ jsxs29(
        "button",
        {
          type: "button",
          role: "checkbox",
          "aria-checked": ticks.includes(i),
          onClick: () => tap(i),
          className: ticks.includes(i) ? "hb-check hb-check-on" : "hb-check",
          children: [
            /* @__PURE__ */ jsx32("span", { className: "hb-check-mark", children: ticks.includes(i) ? /* @__PURE__ */ jsx32(Icon, { name: "check", size: 13, stroke: 3 }) : numbered ? i + 1 : null }),
            /* @__PURE__ */ jsx32("span", { className: "hb-check-text", children: /* @__PURE__ */ jsx32(InlineText, { text: item.text }) })
          ]
        }
      )
    ] }, i))
  ] });
}
function startsGroup(items, i) {
  const group = items[i].group;
  if (!group) return false;
  return items[i - 1]?.group !== group;
}
function useSavedTicks(path, ticked, count) {
  const [ticks, setTicks] = useStoredValue({
    path,
    door: "always",
    initial: () => ticked,
    revive: (saved) => readTicks(saved, count),
    stored: (value) => value
  });
  return [ticks, (i) => setTicks(toggleTick(ticks, i))];
}

// src/blocks/checklist/read.ts
var MAX_ITEMS = 40;
function readChecklist(raw, here) {
  const found = collectItems(raw, here);
  if (!found.length) return here.drop("checklist has no item with text");
  const kept = keepFirst(found, MAX_ITEMS, here, "items");
  const items = [];
  const ticked = [];
  kept.forEach((item, i) => {
    items.push(clean({ text: item.text, group: item.group }));
    if (item.done) ticked.push(i);
  });
  const numbered = raw.numbered === true || raw.ordered === true;
  const title = firstText([raw.title, raw.label], 80);
  return clean({ type: "checklist", title, numbered, items, ticked, path: here.path });
}
function collectItems(raw, here) {
  const found = [];
  const flat = firstList([raw.items, raw.tasks, raw.steps]);
  flat?.forEach((item, i) => {
    const read = readItem(item, void 0);
    if (read) found.push(read);
    else here.at("items").at(i).drop("item has no text");
  });
  const groups = firstList([raw.groups, raw.sections]) ?? [];
  groups.forEach((g, gi) => {
    const label = firstText([g?.label, g?.title, g?.name], 60);
    const list = firstList([g?.items, g?.tasks]) ?? [];
    list.forEach((item, i) => {
      const read = readItem(item, label);
      if (read) found.push(read);
      else here.at("groups").at(gi).at("items").at(i).drop("item has no text");
    });
  });
  return found;
}
function readItem(item, groupLabel) {
  if (typeof item === "string") {
    const text2 = firstText([item], 160);
    if (!text2) return null;
    return { text: text2, group: groupLabel, done: false };
  }
  if (!item || typeof item !== "object") return null;
  const text = firstText([item.text, item.title, item.label, item.name], 160);
  if (!text) return null;
  const group = firstText([item.group, item.section, item.category], 60) ?? groupLabel;
  return { text, group, done: item.done === true || item.checked === true };
}

// src/blocks/flip/Flip.tsx
import { useState as useState9 } from "react";

// src/blocks/flip/columns.ts
function flipColumns(cards) {
  if (cards <= 4) return Math.max(1, cards);
  const lastRow = (cols) => cards % cols || cols;
  return lastRow(3) / 3 > lastRow(4) / 4 ? 3 : 4;
}

// src/blocks/flip/Flip.tsx
import { jsx as jsx33, jsxs as jsxs30 } from "react/jsx-runtime";
function Flip({ title, cards }) {
  const [turned, setTurned] = useState9(() => cards.map(() => false));
  const toggle = (i) => setTurned((was) => was.map((t, k) => k === i ? !t : t));
  const tall = cards.some((c) => c.image);
  return /* @__PURE__ */ jsxs30("div", { className: "hb-flip", children: [
    title && /* @__PURE__ */ jsx33("div", { className: "hb-card-title", children: title }),
    /* @__PURE__ */ jsx33(
      "div",
      {
        className: tall ? "hb-flip-grid hb-flip-tall" : "hb-flip-grid",
        style: { "--hb-flip-cols": flipColumns(cards.length) },
        children: cards.map((c, i) => /* @__PURE__ */ jsx33(Card2, { card: c, place: `${i + 1} of ${cards.length}`, turned: turned[i] === true, onTurn: () => toggle(i) }, i))
      }
    )
  ] });
}
function Card2({ card, place, turned, onTurn }) {
  const [photoFailed, setPhotoFailed] = useState9(false);
  const photo = card.image && !photoFailed ? card.image : void 0;
  const label = turned ? `${card.front}: ${card.back}` : `${card.front}, tap to see the answer`;
  return /* @__PURE__ */ jsx33("button", { type: "button", className: "hb-flip-card", onClick: onTurn, "aria-pressed": turned, "aria-label": label, children: /* @__PURE__ */ jsxs30("span", { className: turned ? "hb-flip-inner hb-flip-turned" : "hb-flip-inner", children: [
    /* @__PURE__ */ jsxs30("span", { className: "hb-flip-face hb-flip-front", children: [
      /* @__PURE__ */ jsx33("span", { className: "hb-flip-label", children: place }),
      /* @__PURE__ */ jsx33("span", { className: "hb-flip-question", children: /* @__PURE__ */ jsx33(InlineText, { text: card.front }) }),
      /* @__PURE__ */ jsxs30("span", { className: "hb-flip-foot", children: [
        /* @__PURE__ */ jsx33("span", { children: "Tap to turn" }),
        /* @__PURE__ */ jsx33("span", { "aria-hidden": "true", children: "\u21BB" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs30("span", { className: "hb-flip-face hb-flip-back", children: [
      photo && /* @__PURE__ */ jsx33("img", { src: photo, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onError: () => setPhotoFailed(true) }),
      /* @__PURE__ */ jsx33("span", { className: "hb-flip-label", children: "Answer" }),
      /* @__PURE__ */ jsx33("span", { className: "hb-flip-answer", children: /* @__PURE__ */ jsx33(InlineText, { text: card.back }) })
    ] })
  ] }) });
}

// src/blocks/flip/read.ts
var FRONT_MAX = 140;
var BACK_MAX = 260;
function readFlip(raw, here) {
  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
  const cards = [];
  rawCards.forEach((c, i) => {
    const front = firstWords([c?.front, c?.question], FRONT_MAX);
    const back = firstWords([c?.back, c?.answer], BACK_MAX);
    if (!front || !back) {
      here.at("cards").at(i).drop("card needs a front and a back");
      return;
    }
    cards.push(clean({ front, back, image: https(c.image) }));
  });
  if (!cards.length) return here.drop("flip has no cards");
  return clean({ type: "flip", title: str(raw.title, 60), cards: keepFirst(cards, 12, here, "cards") });
}

// src/blocks/flow/Flow.tsx
import { Fragment as Fragment8, useId as useId2, useLayoutEffect as useLayoutEffect3, useMemo as useMemo4, useRef as useRef7, useState as useState10 } from "react";

// src/lib/motion.ts
import { createContext as createContext4, useContext as useContext7 } from "react";
var MotionScope = createContext4("full");
function lessMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function useLessMotion() {
  const word = useContext7(MotionScope);
  return lessMotion() || word === "reduced";
}

// src/blocks/flow/packet.ts
function packetPath(a, b, backward) {
  const across = b.left >= a.right - 1 || a.left >= b.right - 1;
  const middle = (e) => ({ x: (e.left + e.right) / 2, y: (e.top + e.bottom) / 2 });
  if (!backward) {
    return across ? [{ x: a.right, y: middle(a).y }, { x: b.left, y: middle(a).y }] : [{ x: middle(a).x, y: a.bottom }, { x: middle(b).x, y: b.top }];
  }
  if (across) {
    const start2 = { x: middle(a).x, y: a.top };
    const end2 = { x: middle(b).x, y: b.top };
    return arc(start2, { x: (start2.x + end2.x) / 2, y: Math.min(a.top, b.top) - 40 }, end2);
  }
  const start = { x: a.right, y: middle(a).y };
  const end = { x: b.right, y: middle(b).y };
  return arc(start, { x: Math.max(a.right, b.right) + 34, y: (start.y + end.y) / 2 }, end);
}
function arc(a, control, b, count = 16) {
  return Array.from({ length: count + 1 }, (_, k) => {
    const t = k / count;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
  });
}

// src/blocks/flow/walk.ts
function flowState(nodes, groups, steps, at2) {
  const holds = nodes.map((n) => n.holds ?? []);
  const place = (id) => id === void 0 ? -1 : nodes.findIndex((n) => n.id === id);
  const moving = isMoving(nodes, steps);
  let seen = /* @__PURE__ */ new Set();
  let layers = groups.map(() => 0);
  let lit;
  for (const step of steps.slice(0, at2 + 1)) {
    const i = place(step.node);
    if (i === 0 && seen.size) {
      seen = /* @__PURE__ */ new Set();
      layers = groups.map(() => 0);
    }
    if (i >= 0) seen.add(i);
    for (const [id, chips] of Object.entries(step.holds ?? {})) {
      const k = place(id);
      if (k >= 0) holds[k] = chips;
    }
    const g = groups.findIndex((gr) => i >= gr.from && i <= gr.to);
    if (g >= 0) {
      const most = groups[g].count ?? Infinity;
      layers[g] = Math.min(most, Math.max(1, layers[g]) + (step.tick ?? 0));
    }
    lit = i >= 0 ? i : void 0;
  }
  return { holds, seen: moving && steps.length ? seen : null, lit, layers };
}
function isMoving(nodes, steps) {
  return nodes.some((n) => n.holds) || steps.some((s) => s.holds || s.send || s.tick);
}

// src/blocks/flow/Flow.tsx
import { Fragment as Fragment9, jsx as jsx34, jsxs as jsxs31 } from "react/jsx-runtime";
var NODE_MIN = 88;
var ARROW = 24;
var FRAME = 16;
var HOLDS_MIN = 104;
var SEND_MS = 420;
var TICK_MS = 260;
var TICK_TOTAL_MS = 3e3;
var NO_STEPS = [];
function fitsAcross(nodes, groups, width, holds = false) {
  return nodes * (holds ? HOLDS_MIN : NODE_MIN) + (nodes - 1) * ARROW + groups * FRAME <= width;
}
function pieces(count, groups) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const group = groups.find((g) => g.from === i);
    if (group) {
      out.push({ start: i, end: group.to, group });
      i = group.to;
    } else out.push({ start: i, end: i });
  }
  return out;
}
function Flow({ id, title, direction, nodes, groups = [] }) {
  const box = useRef7(null);
  const packet = useRef7(null);
  const boxes = useRef7([]);
  const width = useWidth(box);
  const [open, setOpen] = useState10(null);
  const walk = useWalk(id);
  const steps = walk?.steps ?? NO_STEPS;
  const target = useMemo4(() => flowState(nodes, groups, steps, walk?.at ?? 0), [nodes, groups, steps, walk?.at]);
  const travelling = useTravel(walk, nodes, groups, target, packet, boxes, box);
  const state = travelling ?? target;
  const moving = isMoving(nodes, steps);
  const holds = state.holds.some((h) => h.length > 0);
  const panelId = useId2();
  const down = direction === "down" || !fitsAcross(nodes.length, groups.length, width, holds);
  const shown = open === null ? void 0 : nodes[open];
  const node = (n, i, arrow) => /* @__PURE__ */ jsxs31("li", { className: "hb-flow-step", children: [
    arrow && /* @__PURE__ */ jsx34(Arrow, {}),
    /* @__PURE__ */ jsx34(
      NodeBox,
      {
        node: n,
        chips: state.holds[i],
        lit: state.lit === i,
        idle: state.seen !== null && !state.seen.has(i),
        open: open === i,
        panelId,
        boxRef: (el) => {
          boxes.current[i] = el;
        },
        onTap: () => setOpen((was) => was === i ? null : i)
      }
    )
  ] }, i);
  function onKeyDown(e) {
    if (e.key === "Escape" && open !== null) setOpen(null);
  }
  return /* @__PURE__ */ jsxs31("div", { className: "hb-card hb-flow", onKeyDown, children: [
    title && /* @__PURE__ */ jsx34("div", { className: "hb-card-title", children: title }),
    /* @__PURE__ */ jsxs31("div", { ref: box, className: "hb-flow-box", children: [
      /* @__PURE__ */ jsx34("ol", { className: `hb-flow-chain ${down ? "hb-flow-down" : "hb-flow-right"}`, children: pieces(nodes.length, groups).map(({ start, end, group }) => group ? /* @__PURE__ */ jsxs31("li", { className: "hb-flow-step", style: { flexGrow: end - start + 1 }, children: [
        start > 0 && /* @__PURE__ */ jsx34(Arrow, {}),
        /* @__PURE__ */ jsxs31("div", { className: "hb-flow-group", children: [
          /* @__PURE__ */ jsxs31("div", { className: "hb-flow-group-head", children: [
            /* @__PURE__ */ jsx34("span", { className: "hb-flow-group-label", children: group.label }),
            group.count !== void 0 && /* @__PURE__ */ jsx34(Counter, { layer: state.layers[groups.indexOf(group)], count: group.count })
          ] }),
          /* @__PURE__ */ jsx34("ol", { className: "hb-flow-chain", children: nodes.slice(start, end + 1).map((n, k) => node(n, start + k, k > 0)) })
        ] })
      ] }, start) : /* @__PURE__ */ jsx34(Fragment8, { children: node(nodes[start], start, start > 0) }, start)) }),
      moving && walk && /* @__PURE__ */ jsx34("div", { ref: packet, className: "hb-flow-packet", "aria-hidden": "true" })
    ] }),
    shown?.note && /* @__PURE__ */ jsxs31("div", { id: panelId, className: "hb-flow-panel", role: "region", "aria-label": shown.label, children: [
      /* @__PURE__ */ jsx34("div", { className: "hb-flow-panel-title", children: shown.label }),
      /* @__PURE__ */ jsx34("p", { className: "hb-flow-note", children: /* @__PURE__ */ jsx34(InlineText, { text: shown.note }) })
    ] })
  ] });
}
function Counter({ layer, count }) {
  return /* @__PURE__ */ jsx34("span", { className: "hb-chip hb-chip-soft hb-flow-count", children: layer ? `layer ${layer} of ${count}` : `\xD7 ${count}` });
}
function useTravel(walk, nodes, groups, target, packet, boxes, frame) {
  const [travelling, setTravelling] = useState10(null);
  const less = useLessMotion();
  useLayoutEffect3(() => {
    const step = walk && walk.from !== null && walk.at === walk.from + 1 ? walk.steps[walk.at] : void 0;
    const dot = packet.current;
    if (!walk || !step || !(step.send || step.tick) || !dot || typeof dot.animate !== "function" || less) {
      setTravelling(null);
      return;
    }
    const before = flowState(nodes, groups, walk.steps, walk.from);
    let live = true;
    let flight = null;
    const edges = (i) => {
      const el = boxes.current[i];
      const outer = frame.current?.getBoundingClientRect();
      if (!el || !outer) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - outer.left, top: r.top - outer.top, right: r.right - outer.left, bottom: r.bottom - outer.top };
    };
    const hop = async (from, to, ms) => {
      const a = edges(from);
      const b = edges(to);
      if (!a || !b) return live;
      const path = packetPath(a, b, to <= from);
      dot.style.opacity = "1";
      flight = dot.animate(path.map((p) => ({ transform: `translate(${p.x}px, ${p.y}px)` })), { duration: ms, easing: "ease-in-out", fill: "forwards" });
      try {
        await flight.finished;
        return live;
      } catch {
        return false;
      } finally {
        dot.style.opacity = "0";
      }
    };
    setTravelling(before);
    (async () => {
      const g = step.tick ? groups.findIndex((gr) => target.lit !== void 0 && target.lit >= gr.from && target.lit <= gr.to) : -1;
      if (g >= 0) {
        const { from: first, to: last } = groups[g];
        const ms = Math.min(TICK_MS, TICK_TOTAL_MS / (2 * step.tick));
        for (let k = 1; k <= step.tick; k++) {
          const layers = before.layers.map((v, j) => j === g ? Math.min(groups[g].count ?? Infinity, Math.max(1, v) + k) : v);
          if (!await hop(last, first, ms)) return;
          setTravelling({ ...before, lit: first, layers });
          if (!await hop(first, last, ms)) return;
          setTravelling({ ...before, lit: last, layers });
        }
      }
      if (step.send && before.lit !== void 0 && target.lit !== void 0 && !await hop(before.lit, target.lit, SEND_MS)) return;
      if (live) setTravelling(null);
    })();
    return () => {
      live = false;
      flight?.cancel();
    };
  }, [walk]);
  return travelling;
}
function NodeBox({ node, chips, lit, idle, open, panelId, boxRef, onTap }) {
  const className = `hb-flow-node${lit ? " hb-flow-lit" : ""}${open ? " hb-flow-open" : ""}${idle ? " hb-flow-idle" : ""}`;
  const holds = chips.length > 0 && /* @__PURE__ */ jsx34(Chips, { chips }, JSON.stringify(chips));
  const inside2 = /* @__PURE__ */ jsxs31(Fragment9, { children: [
    node.icon && /* @__PURE__ */ jsx34("span", { className: "hb-flow-icon", children: /* @__PURE__ */ jsx34(Icon, { name: node.icon, size: 14 }) }),
    /* @__PURE__ */ jsx34("span", { className: "hb-flow-label", children: node.label })
  ] });
  if (!node.note) return /* @__PURE__ */ jsxs31("div", { ref: boxRef, className, "aria-current": lit ? "step" : void 0, children: [
    inside2,
    holds
  ] });
  return /* @__PURE__ */ jsxs31(
    "button",
    {
      ref: boxRef,
      type: "button",
      className,
      "aria-expanded": open,
      "aria-controls": open ? panelId : void 0,
      "aria-current": lit ? "step" : void 0,
      onClick: onTap,
      children: [
        inside2,
        /* @__PURE__ */ jsx34("span", { className: "hb-flow-more", "aria-hidden": "true", children: open ? "\u2212" : "+" }),
        holds
      ]
    }
  );
}
function Chips({ chips }) {
  return /* @__PURE__ */ jsx34("span", { className: "hb-flow-holds", children: chips.map((c, k) => /* @__PURE__ */ jsx34("span", { className: c.accent ? "hb-flow-chip hb-flow-chip-accent" : "hb-flow-chip", children: c.text }, k)) });
}
function Arrow() {
  return /* @__PURE__ */ jsx34("span", { className: "hb-flow-arrow", "aria-hidden": "true", children: /* @__PURE__ */ jsx34(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ jsx34("path", { d: "M4 12h15M13 6l6 6-6 6" })
    }
  ) });
}

// src/blocks/flow/read.ts
var MAX_NODES = 10;
var MAX_GROUPS = 3;
var MAX_CHIPS = 10;
var CHIP = 16;
var NO_RUN = "group needs a label and a run of node ids next to each other";
function readFlow(raw, here) {
  const list = firstList([raw.nodes, raw.stages]) ?? [];
  const nodes = [];
  const seen = /* @__PURE__ */ new Set();
  list.forEach((n, i) => {
    const label = firstText([n?.label, n?.title, n?.name], 40);
    if (!label) {
      here.at("nodes").at(i).drop("node needs a label");
      return;
    }
    let id = slug(n.id);
    if (id !== void 0 && seen.has(id)) id = void 0;
    if (id !== void 0) seen.add(id);
    const holds = readChips(n.holds, here.at("nodes").at(i).at("holds"));
    nodes.push(clean({ id, label, icon: icon(n.icon), note: firstText([n.note, n.text, n.description], 280), holds }));
  });
  if (nodes.length < 2) return here.drop("flow needs at least 2 nodes");
  const kept = keepFirst(nodes, MAX_NODES, here, "nodes");
  const groups = readGroups(raw.groups, kept, here);
  return clean({
    type: "flow",
    id: slug(raw.id),
    title: str(raw.title, 80),
    direction: raw.direction === "down" ? "down" : "right",
    nodes: kept,
    groups: groups.length ? groups : void 0
  });
}
function readGroups(rawGroups, nodes, here) {
  if (!Array.isArray(rawGroups)) return [];
  const groups = [];
  const taken = /* @__PURE__ */ new Set();
  rawGroups.forEach((g, j) => {
    const at2 = here.at("groups").at(j);
    const label = str(g?.label, 40);
    const ids = Array.isArray(g?.nodes) ? g.nodes : [];
    const spots = ids.map((id) => nodes.findIndex((n) => n.id !== void 0 && n.id === id));
    const from = spots[0];
    const isRun = spots.length > 0 && spots.every((p, k) => p >= 0 && p === from + k);
    if (!label || !isRun) {
      at2.drop(NO_RUN);
      return;
    }
    if (spots.some((p) => taken.has(p))) {
      at2.drop("groups can't share nodes");
      return;
    }
    spots.forEach((p) => taken.add(p));
    const count = num(g.count);
    const counted = count !== null && Number.isInteger(count) && count >= 2 && count <= 100 ? count : void 0;
    if (g.count !== void 0 && counted === void 0) at2.drop("count is a whole number from 2 to 100; left out");
    groups.push(clean({ label, from, to: spots[spots.length - 1], count: counted }));
  });
  return keepFirst(groups, MAX_GROUPS, here, "groups");
}
function readChips(raw, here) {
  if (!Array.isArray(raw)) return void 0;
  const chips = [];
  for (const c of raw) {
    const text = textOrNumber(c && typeof c === "object" ? c.text : c, CHIP);
    if (text !== void 0) chips.push(clean({ text, accent: c?.tone === "accent" ? true : void 0 }));
  }
  return keepFirst(chips, MAX_CHIPS, here, "chips");
}

// src/blocks/form/Form.tsx
import { useContext as useContext8 } from "react";

// src/blocks/form/read.ts
var MAX_FIELDS = 12;
var MAX_OPTIONS = 60;
var LABEL = 100;
var OPTION = 80;
var NOTE = 80;
var GROUP = 40;
var END = 20;
var PLACEHOLDER = 60;
var TEXT_VALUE = 500;
var KINDS = ["select", "radio", "checkbox", "text", "slider"];
var FIELD_ID = /^[A-Za-z_][\w-]{0,39}$/;
var RESERVED_IDS = ["__proto__", "constructor", "prototype"];
var KIND_NAMES = {
  select: "select",
  dropdown: "select",
  radio: "radio",
  choice: "radio",
  checkbox: "checkbox",
  checkboxes: "checkbox",
  multi: "checkbox",
  multiselect: "checkbox",
  text: "text",
  input: "text",
  textarea: "text",
  slider: "slider",
  range: "slider"
};
function readForm(raw, here) {
  const rawFields = firstList([raw.fields, raw.inputs, raw.questions]);
  if (!rawFields) return here.drop("form needs fields");
  const fields = [];
  rawFields.forEach((item, i) => {
    const where = here.at("fields").at(i);
    const field = readField(item, where);
    if (!field) return;
    if (fields.some((f) => f.id === field.id)) {
      where.drop(`field id "${field.id}" is used twice`);
      return;
    }
    fields.push(field);
  });
  if (!fields.length) return here.drop("form has no usable field");
  const title = firstText([raw.title, raw.label], 80);
  const id = formIdFrom(firstText([raw.id, raw.name], 60), title);
  const submit = firstText([raw.submit, raw.button], 24) ?? "Send";
  return clean({ type: "form", id, title, submit, fields: keepFirst(fields, MAX_FIELDS, here, "fields"), path: here.path });
}
function formIdFrom(id, title) {
  if (id) return id;
  const slug2 = (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug2 || "form-1";
}
function shortLabel2(text, max = LABEL) {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  const atWord = lastSpace > max / 2 ? room.slice(0, lastSpace) : room;
  return `${atWord.trimEnd()}\u2026`;
}
function readField(item, here) {
  if (!item || typeof item !== "object") return here.drop("field is not an object");
  const named = String(item.kind ?? item.type ?? "").trim().toLowerCase();
  const kind = KIND_NAMES[named];
  if (!kind) return here.drop(`field kind "${named}" isn't one of ${KINDS.join(", ")}`);
  const id = firstText([item.id, item.name, item.key], 200);
  if (!id) return here.drop("field needs an id");
  if (!FIELD_ID.test(id)) return here.drop('field id must be a word like "where" (letters, digits, _ or -)');
  if (RESERVED_IDS.includes(id)) return here.drop(`field id "${id}" is reserved`);
  const whole2 = firstText([item.label, item.title], 400);
  const group = firstText([item.group, item.section], GROUP);
  const base = clean({ id, label: whole2 ? shortLabel2(whole2) : id, group, required: item.required === true });
  if (kind === "text") return readTextField(item, named, base);
  if (kind === "slider") return readSlider(item, base, here);
  const options = readOptions(firstList([item.options, item.choices]) ?? [], here);
  if (!options.length) return here.drop(`${kind} needs options`);
  const values = options.map((o) => o.value);
  if (kind === "checkbox") {
    const ticked = prefilledList(item.value).map((v) => String(v)).filter((v) => values.includes(v));
    return { ...base, kind, options, value: [...new Set(ticked)] };
  }
  const given = firstTextOrNumber([item.value, item.default]);
  const value = given !== void 0 && values.includes(given) ? given : void 0;
  return clean({ ...base, kind, options, value });
}
function prefilledList(value) {
  if (Array.isArray(value)) return value;
  if (value === void 0) return [];
  return [value];
}
function readOptions(list, here) {
  const options = [];
  for (const o of list) {
    const isObject2 = !!o && typeof o === "object";
    const value = isObject2 ? firstTextOrNumber([o.value, o.id, o.label], OPTION) : firstTextOrNumber([o], OPTION);
    if (value === void 0 || options.some((x) => x.value === value)) continue;
    const label = (isObject2 ? firstText([o.label, o.name], OPTION) : void 0) ?? value;
    const note = isObject2 ? firstText([o.note, o.description], NOTE) : void 0;
    options.push(clean({ value, label, note }));
  }
  return keepFirst(options, MAX_OPTIONS, here, "options");
}
function readTextField(item, named, base) {
  const placeholder = firstText([item.placeholder, item.hint], PLACEHOLDER);
  const multiline = item.multiline === true || named === "textarea";
  const value = firstText([item.value, item.default], TEXT_VALUE);
  return clean({ ...base, kind: "text", placeholder, multiline, value });
}
function readSlider(item, base, here) {
  const min = num(item.min) ?? 0;
  const max = num(item.max) ?? 100;
  if (min >= max) return here.drop("slider needs min below max");
  const given = num(item.step);
  const step = given !== null && given > 0 ? given : niceStep((max - min) / 100);
  const value = onStep(num(item.value) ?? num(item.default) ?? min, min, max, step);
  return clean({ ...base, kind: "slider", min, max, step, value, unit: firstText([item.unit], 12), ends: readEnds(item.ends) });
}
function readEnds(v) {
  if (!Array.isArray(v) || v.length !== 2) return void 0;
  const left = firstText([v[0]], END);
  const right = firstText([v[1]], END);
  return left && right ? [left, right] : void 0;
}
function onStep(value, min, max, step) {
  const inRange = Math.min(max, Math.max(min, value));
  const snapped = Math.min(max, min + Math.round((inRange - min) / step) * step);
  return Number(snapped.toFixed(Math.max(decimals(step), decimals(min))));
}
function decimals(n) {
  const text = String(n);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

// src/blocks/form/formMessage.ts
function startingValues(form) {
  const values = {};
  for (const f of form.fields) {
    if (f.kind === "checkbox") values[f.id] = [...f.value];
    else if (f.kind === "slider") values[f.id] = f.value;
    else if (f.kind === "text") values[f.id] = f.value ?? "";
    else values[f.id] = f.value ?? null;
  }
  return values;
}
function hasValue(value) {
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim() !== "";
}
function canSend(form, values, sent) {
  if (sent) return false;
  return form.fields.every((f) => !f.required || hasValue(values[f.id]));
}
function answerWords(field, value) {
  if (!hasValue(value ?? null)) return "";
  if (field.kind === "slider") return formatWithUnit(value, field.unit);
  if (field.kind === "text") return String(value).trim().split(/\s*\n\s*/).join(" / ");
  const labelOf = (v) => field.options.find((o) => o.value === v)?.label ?? v;
  if (field.kind === "checkbox") return value.map(labelOf).join(", ");
  return labelOf(String(value));
}
function startsGroup2(fields, i) {
  const group = fields[i].group;
  if (!group) return false;
  return fields[i - 1]?.group !== group;
}
function answerMessage(form, values) {
  const lines = [form.title ? `Form: ${form.title} (${form.id})` : `Form: ${form.id}`];
  form.fields.forEach((f, i) => {
    if (startsGroup2(form.fields, i)) lines.push(`\u2014 ${f.group} \u2014`);
    lines.push(`${f.label}: ${answerWords(f, values[f.id]) || "(none)"}`);
  });
  return lines.join("\n");
}

// src/blocks/form/sentForm.ts
function sentRecord(values) {
  return { sent: true, values: { ...values } };
}
function readSent(saved, form) {
  if (!saved || typeof saved !== "object" || saved.sent !== true) return null;
  const given = saved.values;
  const values = startingValues(form);
  if (!given || typeof given !== "object" || Array.isArray(given)) return values;
  for (const field of form.fields) {
    if (!Object.prototype.hasOwnProperty.call(given, field.id)) continue;
    const kept = fitting(field, given[field.id]);
    if (kept !== void 0) values[field.id] = kept;
  }
  return values;
}
function draftFits(saved, form) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
  const given = saved;
  const values = startingValues(form);
  for (const field of form.fields) {
    if (!Object.prototype.hasOwnProperty.call(given, field.id)) continue;
    const kept = fitting(field, given[field.id]);
    if (kept !== void 0) values[field.id] = kept;
  }
  return values;
}
function fitting(field, value) {
  if (field.kind === "slider") return typeof value === "number" && isFinite(value) ? onStep(value, field.min, field.max, field.step) : void 0;
  if (field.kind === "text") return typeof value === "string" && value.length <= TEXT_VALUE ? value : void 0;
  const options = field.options.map((o) => o.value);
  if (field.kind === "checkbox") {
    if (!Array.isArray(value)) return void 0;
    return options.filter((o) => value.includes(o));
  }
  if (value === null) return null;
  return typeof value === "string" && options.includes(value) ? value : void 0;
}

// src/blocks/form/Form.tsx
import { jsx as jsx35, jsxs as jsxs32 } from "react/jsx-runtime";
function Form(form) {
  const { send } = useContext8(BlockActions);
  const [draft, writeDraft] = useStoredValue({
    door: "identity",
    field: "~v",
    initial: () => startingValues(form),
    revive: (saved) => draftFits(saved, form),
    stored: (value) => value
  });
  const [record, setRecord] = useStoredValue({
    path: form.path,
    door: "always",
    initial: () => null,
    revive: (saved) => readSent(saved, form) !== null ? saved : null,
    stored: (value) => value
  });
  const sent = record !== null;
  const answers = record !== null ? readSent(record, form) : null;
  const values = answers ?? draft;
  const ready = canSend(form, values, sent);
  function onSend() {
    if (!ready) return;
    setRecord(sentRecord(values));
    send(answerMessage(form, values));
  }
  return /* @__PURE__ */ jsxs32(
    "form",
    {
      className: sent ? "hb-card hb-form hb-form-sent" : "hb-card hb-form",
      "aria-disabled": sent,
      onSubmit: (e) => {
        e.preventDefault();
        onSend();
      },
      children: [
        form.title && /* @__PURE__ */ jsx35("div", { className: "hb-card-title", children: /* @__PURE__ */ jsx35(InlineText, { text: form.title }) }),
        /* @__PURE__ */ jsx35("fieldset", { disabled: sent, children: form.fields.map((field, i) => /* @__PURE__ */ jsxs32("div", { children: [
          startsGroup2(form.fields, i) && /* @__PURE__ */ jsx35("div", { className: "hb-form-group", children: /* @__PURE__ */ jsx35(InlineText, { text: field.group }) }),
          /* @__PURE__ */ jsx35(
            FieldView,
            {
              field,
              value: values[field.id],
              onChange: (v) => writeDraft({ ...values, [field.id]: v })
            }
          )
        ] }, field.id)) }),
        /* @__PURE__ */ jsxs32("div", { className: "hb-form-foot", children: [
          sent && /* @__PURE__ */ jsx35("span", { className: "hb-form-done", children: "\u2713 Sent" }),
          /* @__PURE__ */ jsx35("button", { type: "submit", className: "hb-pill hb-pill-solid", disabled: !ready, children: form.submit })
        ] })
      ]
    }
  );
}
function FieldView({ field, value, onChange }) {
  if (field.kind === "slider") {
    const at2 = typeof value === "number" ? value : field.value;
    return /* @__PURE__ */ jsxs32("label", { className: "hb-form-field", children: [
      /* @__PURE__ */ jsxs32("span", { className: "hb-calc-head", children: [
        /* @__PURE__ */ jsx35("span", { className: "hb-calc-label", children: /* @__PURE__ */ jsx35(InlineText, { text: field.label }) }),
        /* @__PURE__ */ jsx35("span", { className: "hb-calc-value", children: formatWithUnit(at2, field.unit) })
      ] }),
      /* @__PURE__ */ jsx35(
        "input",
        {
          type: "range",
          className: "hb-range",
          min: field.min,
          max: field.max,
          step: field.step,
          value: at2,
          onChange: (e) => onChange(Number(e.target.value))
        }
      ),
      field.ends && /* @__PURE__ */ jsxs32("span", { className: "hb-form-ends", children: [
        /* @__PURE__ */ jsx35("span", { children: field.ends[0] }),
        /* @__PURE__ */ jsx35("span", { children: field.ends[1] })
      ] })
    ] });
  }
  if (field.kind === "text") {
    const text = typeof value === "string" ? value : "";
    const props = { className: "hb-input", value: text, maxLength: TEXT_VALUE, placeholder: field.placeholder };
    return /* @__PURE__ */ jsxs32("label", { className: "hb-form-field", children: [
      /* @__PURE__ */ jsx35("span", { className: "hb-form-label", children: /* @__PURE__ */ jsx35(InlineText, { text: field.label }) }),
      field.multiline ? /* @__PURE__ */ jsx35("textarea", { ...props, rows: 3, onChange: (e) => onChange(e.target.value) }) : /* @__PURE__ */ jsx35("input", { type: "text", ...props, onChange: (e) => onChange(e.target.value) })
    ] });
  }
  if (field.kind === "select") {
    const chosen2 = field.options.find((o) => o.value === value);
    return /* @__PURE__ */ jsxs32("label", { className: "hb-form-field", children: [
      /* @__PURE__ */ jsx35("span", { className: "hb-form-label", children: /* @__PURE__ */ jsx35(InlineText, { text: field.label }) }),
      /* @__PURE__ */ jsxs32("select", { className: "hb-input", value: chosen2 ? chosen2.value : "", onChange: (e) => onChange(e.target.value), children: [
        !chosen2 && /* @__PURE__ */ jsx35("option", { value: "", disabled: true, children: "Choose\u2026" }),
        field.options.map((o) => /* @__PURE__ */ jsx35("option", { value: o.value, children: o.label }, o.value))
      ] }),
      chosen2?.note && /* @__PURE__ */ jsx35("span", { className: "hb-form-note", children: chosen2.note })
    ] });
  }
  return /* @__PURE__ */ jsx35(Pills, { field, value, onChange });
}
function Pills({ field, value, onChange }) {
  const isRadio = field.kind === "radio";
  const picked = isRadio ? [String(value ?? "")] : Array.isArray(value) ? value : [];
  function tap(option) {
    if (isRadio) return onChange(option.value);
    const ticked = picked.includes(option.value) ? picked.filter((v) => v !== option.value) : [...picked, option.value];
    onChange(field.options.map((o) => o.value).filter((v) => ticked.includes(v)));
  }
  return /* @__PURE__ */ jsxs32("div", { className: "hb-form-field", role: isRadio ? "radiogroup" : "group", "aria-label": field.label, children: [
    /* @__PURE__ */ jsx35("span", { className: "hb-form-label", children: /* @__PURE__ */ jsx35(InlineText, { text: field.label }) }),
    /* @__PURE__ */ jsx35("div", { className: "hb-options", children: field.options.map((o) => {
      const on = picked.includes(o.value);
      return /* @__PURE__ */ jsxs32(
        "button",
        {
          type: "button",
          role: isRadio ? "radio" : "checkbox",
          "aria-checked": on,
          onClick: () => tap(o),
          className: on ? "hb-option hb-option-on" : "hb-option",
          children: [
            o.label,
            o.note && /* @__PURE__ */ jsx35("span", { className: "hb-option-note", children: o.note })
          ]
        },
        o.value
      );
    }) })
  ] });
}

// src/blocks/heatmap/Heatmap.tsx
import { Fragment as Fragment10, useState as useState11 } from "react";

// src/blocks/heatmap/heatmapColour.ts
var FAINT = 10;
var DEEP = 70;
function rangeOf(values) {
  let low = Infinity;
  let high = -Infinity;
  for (const row of values) {
    for (const v of row) {
      if (v === null) continue;
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
  }
  if (low === Infinity) return { low: 0, high: 0 };
  return { low, high };
}
function cellColour(value, range, scale) {
  if (value === null) return "var(--hb-well)";
  let colour;
  let share;
  if (scale === "diverging") {
    const biggest = Math.max(Math.abs(range.low), Math.abs(range.high));
    colour = value < 0 ? "--hb-warn" : "--hb-good";
    share = biggest === 0 ? 0 : Math.abs(value) / biggest;
  } else {
    const span = range.high - range.low;
    colour = "--hb-accent";
    share = span === 0 ? 1 : (value - range.low) / span;
  }
  const percent = Math.round(FAINT + (DEEP - FAINT) * share);
  return `color-mix(in srgb, var(${colour}) ${percent}%, transparent)`;
}
function cellText(value, unit) {
  if (value === null) return "\u2013";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (!unit) return text;
  if (unit === "%") return `${text}%`;
  return `${text} ${unit}`;
}

// src/blocks/heatmap/Heatmap.tsx
import { jsx as jsx36, jsxs as jsxs33 } from "react/jsx-runtime";
var SHOW_NUMBERS_UP_TO = 6;
function Heatmap({ title, rows: rows2, cols, values, unit, scale }) {
  const [picked, setPicked] = useState11(null);
  const range = rangeOf(values);
  const numbersInCells = cols.length <= SHOW_NUMBERS_UP_TO;
  return /* @__PURE__ */ jsxs33("div", { className: "hb-card hb-heatmap", children: [
    title && /* @__PURE__ */ jsx36("div", { className: "hb-card-title", children: title }),
    /* @__PURE__ */ jsxs33(
      "div",
      {
        className: "hb-heat-grid",
        style: { gridTemplateColumns: `minmax(0, max-content) repeat(${cols.length}, minmax(0, 1fr))` },
        role: "table",
        "aria-label": title ?? "Heat map",
        children: [
          /* @__PURE__ */ jsx36("span", {}),
          cols.map((c, j) => /* @__PURE__ */ jsx36("span", { className: "hb-heat-col", role: "columnheader", children: c }, j)),
          rows2.map((r, i) => /* @__PURE__ */ jsxs33(Fragment10, { children: [
            /* @__PURE__ */ jsx36("span", { className: "hb-heat-row", role: "rowheader", children: r }),
            cols.map((c, j) => {
              const v = values[i][j];
              return /* @__PURE__ */ jsx36(
                "button",
                {
                  type: "button",
                  className: "hb-heat-cell",
                  style: { background: cellColour(v, range, scale) },
                  onClick: () => setPicked({ row: i, col: j }),
                  "aria-label": `${r}, ${c}: ${cellText(v, unit)}`,
                  children: numbersInCells && v !== null ? cellText(v, unit) : ""
                },
                j
              );
            })
          ] }, i))
        ]
      }
    ),
    picked && /* @__PURE__ */ jsxs33("div", { className: "hb-heat-picked", children: [
      rows2[picked.row],
      " \xB7 ",
      cols[picked.col],
      ": ",
      /* @__PURE__ */ jsx36("b", { children: cellText(values[picked.row][picked.col], unit) })
    ] })
  ] });
}

// src/blocks/heatmap/read.ts
var MAX_SIDE = 12;
function readHeatmap(raw, here) {
  const cols = labels(raw.cols);
  const rowLabels = labels(raw.rows);
  const rawValues = Array.isArray(raw.values) ? raw.values : [];
  if (!cols.length || !rowLabels.length || !rawValues.length) return here.drop("heatmap needs rows, cols and values");
  const keptCols = keepFirst(cols, MAX_SIDE, here, "cols");
  const rows2 = [];
  const values = [];
  rowLabels.forEach((label, i) => {
    const cells = rawValues[i];
    if (!Array.isArray(cells)) {
      here.at("values").at(i).drop(`no values for row "${label}"`);
      return;
    }
    if (cells.length < keptCols.length) {
      here.at("values").at(i).drop(`row "${label}" has ${cells.length} values, the heatmap has ${keptCols.length} columns`);
      return;
    }
    rows2.push(label);
    values.push(keptCols.map((_, j) => num(cells[j])));
  });
  if (!rows2.length) return here.drop("heatmap has no usable row");
  const keptRows = keepFirst(rows2, MAX_SIDE, here, "rows");
  const keptValues = values.slice(0, keptRows.length);
  return clean({
    type: "heatmap",
    title: str(raw.title, 80),
    rows: keptRows,
    cols: keptCols,
    values: keptValues,
    unit: str(raw.unit, 12),
    scale: scaleOf(raw.scale, keptValues)
  });
}
function labels(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    const text = textOrNumber(item, 24);
    if (text !== void 0) out.push(text);
  }
  return out;
}
function scaleOf(asked, values) {
  if (asked === "sequential" || asked === "diverging") return asked;
  const anyNegative = values.some((row) => row.some((v) => v !== null && v < 0));
  return anyNegative ? "diverging" : "sequential";
}

// src/blocks/images/Images.tsx
import { useEffect as useEffect3, useRef as useRef8, useState as useState12 } from "react";

// src/blocks/images/localImage.ts
var MAX_PATH = 500;
function isGeneratedImagePath(v) {
  if (typeof v !== "string" || !v || v.length > MAX_PATH || /[\u0000-\u001f\u007f]/.test(v)) return false;
  if (/^[A-Za-z]:[\\/]/.test(v)) return true;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v)) return false;
  return v.startsWith("/") || v.startsWith("\\\\");
}
var reads = /* @__PURE__ */ new Map();
async function readFromHost(path) {
  const bridge = typeof window === "undefined" ? void 0 : window.hermesDesktop;
  if (!bridge?.readFileDataUrl) throw new Error(`no desktop file reader for ${path}`);
  const r = await bridge.readFileDataUrl(path);
  if (typeof r === "string" && r.startsWith("data:")) return r;
  throw new Error(`the desktop file reader gave no data url for ${path}`);
}
function readGeneratedImageDataUrl(path) {
  let read = reads.get(path);
  if (!read) {
    read = readFromHost(path).catch((e) => {
      reads.delete(path);
      throw e;
    });
    reads.set(path, read);
    if (reads.size > 32) {
      const oldest = reads.keys().next().value;
      if (oldest !== void 0 && oldest !== path) reads.delete(oldest);
    }
  }
  return read;
}

// src/blocks/images/Images.tsx
import { jsx as jsx37, jsxs as jsxs34 } from "react/jsx-runtime";
function Images({ block }) {
  const [failed, setFailed] = useState12(/* @__PURE__ */ new Set());
  const [dataUrls, setDataUrls] = useState12({});
  const [open, setOpen] = useState12(null);
  const fail = (url) => setFailed((before) => new Set(before).add(url));
  const srcOf = (p) => isGeneratedImagePath(p.url) ? dataUrls[p.url] : p.url;
  const asked = useRef8(/* @__PURE__ */ new Set());
  useEffect3(() => {
    for (const p of block.images) {
      if (!isGeneratedImagePath(p.url) || asked.current.has(p.url)) continue;
      asked.current.add(p.url);
      readGeneratedImageDataUrl(p.url).then(
        (url) => setDataUrls((before) => before[p.url] ? before : { ...before, [p.url]: url }),
        () => fail(p.url)
      );
    }
  }, [block]);
  const shown = block.images.map((photo) => {
    const src = failed.has(photo.url) ? void 0 : srcOf(photo);
    return src === void 0 ? null : { photo, src };
  }).filter((s) => s !== null);
  if (!shown.length) return null;
  return /* @__PURE__ */ jsxs34("figure", { className: "hb-photos", children: [
    block.title && /* @__PURE__ */ jsx37("figcaption", { className: "hb-chart-title", children: block.title }),
    /* @__PURE__ */ jsx37("div", { className: "hb-photo-strip", children: shown.map(({ photo, src }) => /* @__PURE__ */ jsxs34("button", { type: "button", className: "hb-photo", onClick: () => setOpen({ photo, src }), "aria-label": photo.caption ?? "Open photo", children: [
      /* @__PURE__ */ jsx37("img", { src, alt: photo.caption ?? "", loading: "lazy", referrerPolicy: "no-referrer", onError: () => fail(photo.url) }),
      (photo.caption || photo.source) && /* @__PURE__ */ jsxs34("span", { className: "hb-photo-text", children: [
        photo.caption && /* @__PURE__ */ jsx37("span", { className: "hb-photo-caption", children: photo.caption }),
        photo.source && /* @__PURE__ */ jsx37("span", { className: "hb-photo-source", children: photo.source })
      ] })
    ] }, photo.url)) }),
    open && /* @__PURE__ */ jsx37(Overlay, { shown: open, onClose: () => setOpen(null) })
  ] });
}
function Overlay({ shown, onClose }) {
  useEffect3(() => {
    const layer = pushLayer();
    const onKey = (e) => {
      if (e.key !== "Escape" || !isTopLayer(layer)) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [onClose]);
  const { photo, src } = shown;
  return /* @__PURE__ */ jsxs34("div", { className: "hb-photo-overlay", role: "dialog", "aria-label": photo.caption ?? "Photo", onClick: onClose, children: [
    /* @__PURE__ */ jsx37("img", { src, alt: photo.caption ?? "", referrerPolicy: "no-referrer" }),
    (photo.caption || photo.source) && /* @__PURE__ */ jsxs34("div", { className: "hb-photo-overlay-text", children: [
      photo.caption,
      photo.source && /* @__PURE__ */ jsxs34("span", { children: [
        " \xB7 ",
        photo.source
      ] })
    ] })
  ] });
}

// src/blocks/images/read.ts
function readImages(raw, here) {
  const list = Array.isArray(raw.images) ? raw.images : Array.isArray(raw.photos) ? raw.photos : [];
  const photos = [];
  list.forEach((p, i) => {
    const local = isGeneratedImagePath(p?.url) ? p.url : void 0;
    const url = https(p?.url) ?? https(p?.src) ?? local;
    if (!url) {
      here.at("images").at(i).drop("photo needs an https url or a generated image path");
      return;
    }
    photos.push(clean({ url, caption: firstText([p.caption, p.alt, p.title], 120), source: firstText([p.source, p.credit], 60) }));
  });
  if (!photos.length) return here.drop("images has no drawable photo");
  return clean({ type: "images", title: str(raw.title, 60), images: keepFirst(photos, 12, here, "photos") });
}

// src/blocks/kpis/Kpis.tsx
import { jsx as jsx38, jsxs as jsxs35 } from "react/jsx-runtime";
function isYear(k) {
  return typeof k.value === "number" && !k.unit && Number.isInteger(k.value) && k.value >= 1800 && k.value <= 2100;
}
var CURRENCY = /^[$₹€£¥]$/;
function kpiValue(k, { full = false } = {}) {
  if (k.value === null) return "\u2013";
  if (typeof k.value === "string") return k.value;
  if (isYear(k)) return String(k.value);
  const short = !full && Math.abs(k.value) >= SHORT_FROM;
  if (short && k.unit && CURRENCY.test(k.unit)) return fmt(k.value, k.unit);
  const money = formatAmount(k.value, k.unit);
  if (money !== null) return money;
  const plain = short ? fmt(k.value) : formatNumber(k.value, { digits: Math.abs(k.value) >= 1e3 ? 0 : 1 });
  const attached = k.unit === "%" || k.unit?.startsWith("/");
  return attached ? `${plain}${k.unit}` : k.unit ? `${plain} ${k.unit}` : plain;
}
function KpiCard({ item, trendColour }) {
  const shown = kpiValue(item);
  const full = kpiValue(item, { full: true });
  const change = formatChange(item.change, item.change_unit);
  const isText = typeof item.value === "string";
  return /* @__PURE__ */ jsxs35("div", { className: "hb-card hb-kpi", children: [
    /* @__PURE__ */ jsx38("div", { className: "hb-kpi-label", children: item.label }),
    /* @__PURE__ */ jsx38("div", { className: isText ? "hb-kpi-value hb-kpi-value-text" : "hb-kpi-value", title: full !== shown ? full : void 0, children: shown }),
    change && /* @__PURE__ */ jsx38("div", { className: `hb-kpi-change ${changeClass(item.change)}`, children: change }),
    item.trend && /* @__PURE__ */ jsx38(Sparkline, { values: item.trend, colour: trendColour })
  ] });
}
function Kpis({ items }) {
  const several = items.filter((k) => k.trend).length >= 2;
  return /* @__PURE__ */ jsx38("div", { className: "hb-kpis", children: items.map((k, i) => /* @__PURE__ */ jsx38(KpiCard, { item: k, trendColour: several ? partColour(i) : void 0 }, i)) });
}
function changeClass(change) {
  return change > 0 ? "hb-kpi-up" : change < 0 ? "hb-kpi-down" : "hb-kpi-flat";
}
var SPARK_W = 120;
var SPARK_H = 28;
var SPARK_PAD = 2;
function Sparkline({ values, colour }) {
  return /* @__PURE__ */ jsx38("svg", { className: "hb-kpi-spark", viewBox: `0 0 ${SPARK_W} ${SPARK_H}`, preserveAspectRatio: "none", "aria-hidden": "true", children: /* @__PURE__ */ jsx38("path", { d: sparkPath(values), style: colour ? { stroke: colour } : void 0 }) });
}
function sparkPath(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = SPARK_H - 2 * SPARK_PAD;
  const y = (v) => hi === lo ? SPARK_H / 2 : SPARK_PAD + (1 - (v - lo) / (hi - lo)) * span;
  const x = (i) => i / (values.length - 1) * SPARK_W;
  return values.map((v, i) => `${i ? "L" : "M"}${round(x(i))} ${round(y(v))}`).join("");
}
function round(n) {
  return Math.round(n * 10) / 10;
}

// src/blocks/kpis/read.ts
var TREND_FEWEST = 2;
var TREND_MOST = 60;
function readKpi(item) {
  let value = num(item.value);
  if (value === null) value = str(item.value, 40) ?? null;
  const unit = typeof item.unit === "string" ? item.unit : void 0;
  const changeUnit = item.change_unit === "pt" ? "pt" : "%";
  const kpi = { label: item.label, value, unit, change: num(item.change), change_unit: changeUnit };
  if (kpi.unit === void 0) delete kpi.unit;
  if (kpi.change === null) delete kpi.change;
  const trend = readTrend(item.trend);
  if (trend) kpi.trend = trend;
  return kpi;
}
function readTrend(v) {
  if (!Array.isArray(v)) return void 0;
  const numbers = v.map(num).filter((n) => n !== null);
  return numbers.length >= TREND_FEWEST ? numbers.slice(-TREND_MOST) : void 0;
}
function readKpis(raw, here) {
  if (!Array.isArray(raw.items)) return here.drop("kpis needs items");
  const items = [];
  raw.items.forEach((item, i) => {
    if (!item || typeof item.label !== "string") {
      here.at("items").at(i).drop("item has no label");
      return;
    }
    items.push(readKpi(item));
  });
  if (!items.length) return here.drop("kpis has no item with a label");
  return { type: "kpis", items: keepFirst(items, 4, here, "items") };
}
function readStat(raw, here) {
  const label = firstText([raw.label, raw.title], 40);
  if (!label) return here.drop("stat needs a label");
  return { type: "stat", ...readKpi({ ...raw, label }) };
}

// src/blocks/layout/Containers.tsx
import { isValidElement, useState as useState13 } from "react";
import { jsx as jsx39, jsxs as jsxs36 } from "react/jsx-runtime";
function cellKey(child, i) {
  const k = isValidElement(child) ? child.key : null;
  return `c:${k ?? i}`;
}
var OWN_WIDTH_KINDS = ["badge", "button", "link"];
function Row({ kinds, children }) {
  return /* @__PURE__ */ jsx39("div", { className: "hb-row", children: children.map((child, i) => /* @__PURE__ */ jsx39("div", { className: OWN_WIDTH_KINDS.includes(kinds[i]) ? "hb-row-cell hb-row-cell-own" : "hb-row-cell", children: child }, cellKey(child, i))) });
}
function Grid({ children }) {
  return /* @__PURE__ */ jsx39("div", { className: "hb-grid", children: children.map((child, i) => /* @__PURE__ */ jsx39("div", { className: "hb-grid-cell", children: child }, cellKey(child, i))) });
}
function Columns({ children }) {
  return /* @__PURE__ */ jsx39("div", { className: "hb-columns", children: children.map((child, i) => /* @__PURE__ */ jsx39("div", { className: "hb-column", children: child }, cellKey(child, i))) });
}
function Section({ title, collapsed, children }) {
  const [open, setOpen] = useState13(!collapsed);
  if (!collapsed) {
    return /* @__PURE__ */ jsxs36("div", { className: "hb-card hb-section", children: [
      title && /* @__PURE__ */ jsx39("div", { className: "hb-card-title", children: /* @__PURE__ */ jsx39(InlineText, { text: title }) }),
      /* @__PURE__ */ jsx39("div", { className: "hb-section-body", children })
    ] });
  }
  return /* @__PURE__ */ jsxs36("div", { className: "hb-card hb-section", children: [
    /* @__PURE__ */ jsxs36("button", { type: "button", className: "hb-section-toggle", onClick: () => setOpen(!open), "aria-expanded": open, children: [
      /* @__PURE__ */ jsx39("span", { className: "hb-card-title", children: /* @__PURE__ */ jsx39(InlineText, { text: title ?? "" }) }),
      /* @__PURE__ */ jsx39(
        "svg",
        {
          className: open ? "hb-chevron hb-chevron-open" : "hb-chevron",
          width: "18",
          height: "18",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2.2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          children: /* @__PURE__ */ jsx39("path", { d: "M9 6l6 6-6 6" })
        }
      )
    ] }),
    open && /* @__PURE__ */ jsx39("div", { className: "hb-section-body hb-appear", children })
  ] });
}

// src/blocks/layout/read.ts
var WIDE_KINDS = [
  "chart",
  "timeline",
  "images",
  "table",
  "section",
  "grid",
  "list",
  "heatmap",
  "flip",
  "progress",
  "streak",
  "actions",
  "tiles",
  "checklist",
  "calculator",
  "form"
];
var MAX_IN_ROW = 3;
var MAX_IN_GRID = 6;
var MAX_COLUMNS = 3;
function readContainer(raw, here, depth, readChild) {
  const kind = raw.type;
  const list = firstList([raw.children, raw.items, raw.blocks, raw.content]) ?? [];
  const deepestAllowed = kind === "section" || kind === "columns" ? 0 : 1;
  const flatten = depth > deepestAllowed;
  const childDepth = flatten ? depth : depth + 1;
  let children = [];
  list.forEach((child, i) => {
    children.push(...readChild(child, here.at("children").at(i), childDepth));
  });
  if (!children.length) {
    here.drop(`${kind} has no children it can draw`);
    return [];
  }
  const title = firstText([raw.title, raw.label], 60);
  if (flatten) {
    here.drop(`${kind} nested too deep; drawn in place`);
    if (kind === "section" && title) return [{ type: "heading", text: title }, ...children];
    return children;
  }
  if (kind === "section") {
    const collapsed = raw.collapsed === true;
    let shownTitle = title;
    if (!shownTitle && collapsed) shownTitle = "Details";
    return [clean({ type: "section", title: shownTitle, collapsed, children })];
  }
  if (kind === "columns") {
    if (children.length === 1) return children;
    return [{ type: "columns", children: keepFirst(children, MAX_COLUMNS, here, "children") }];
  }
  const wide = children.find((b) => WIDE_KINDS.includes(b.type));
  if (kind === "row" && wide) {
    here.drop(`a ${wide.type} can't sit in a row; drawn as a stack`);
    return children;
  }
  if (children.length === 1) return children;
  if (kind === "row") {
    children = keepFirst(children, MAX_IN_ROW, here, "children");
    return [{ type: "row", children }];
  }
  children = keepFirst(children, MAX_IN_GRID, here, "children");
  return [{ type: "grid", children }];
}

// src/blocks/layout/readTabs.ts
var MAX_TABS = 6;
var MAX_LABEL = 30;
function readTabs(raw, here, depth, readChild, inTab = false) {
  const list = firstList([raw.tabs, raw.items]) ?? [];
  const flatten = depth > 0 || inTab;
  const tabs = [];
  for (let i = 0; i < list.length; i++) {
    const tab = readTab(list[i], here.at("tabs").at(i), depth, readChild);
    if (!tab) continue;
    tabs.push(tab);
    if (flatten) break;
  }
  if (!tabs.length) {
    here.drop("tabs has no tab it can draw");
    return [];
  }
  if (flatten) {
    here.drop("tabs go at the top level only; first tab drawn in place");
    return tabs[0].children;
  }
  if (tabs.length === 1) {
    here.drop("tabs has only one tab; drawn in place");
    return tabs[0].children;
  }
  return [{ type: "tabs", tabs: keepFirst(tabs, MAX_TABS, here, "tabs") }];
}
function readTab(item, here, depth, readChild) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return here.drop("tab is not an object");
  const label = firstText([item.label, item.title], MAX_LABEL);
  if (!label) return here.drop("tab needs a label");
  const children = readTabChildren(firstList([item.children, item.items, item.blocks, item.content]) ?? [], here, depth, readChild);
  if (!children.length) return here.drop("tab has no children it can draw");
  return { label, children };
}
function readTabChildren(list, here, depth, readChild) {
  const out = [];
  list.forEach((child, i) => {
    const at2 = here.at("children").at(i);
    if (depth === 0 && child?.type === "tabs") out.push(...readTabs(child, at2, 0, readChild, true));
    else out.push(...readChild(child, at2, depth));
  });
  return out;
}

// src/blocks/layout/Tabs.tsx
import { useId as useId3, useRef as useRef9 } from "react";
import { jsx as jsx40, jsxs as jsxs37 } from "react/jsx-runtime";
function tabAfterKey(current, count, key) {
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  return current;
}
function Tabs({ labels: labels2, panel }) {
  const [answer, pick2] = useStoredValue({
    door: "identity",
    initial: () => 0,
    revive: (saved) => Number.isInteger(saved) && saved >= 0 ? saved : null,
    stored: (value) => value
  });
  const picked = answer < labels2.length ? answer : 0;
  const buttons = useRef9([]);
  const base = useId3().replace(/[^a-zA-Z0-9]/g, "");
  const onKey = (e) => {
    const next = tabAfterKey(picked, labels2.length, e.key);
    if (next === picked) return;
    e.preventDefault();
    pick2(next);
    buttons.current[next]?.focus();
  };
  return /* @__PURE__ */ jsxs37("div", { className: "hb-tabs", children: [
    /* @__PURE__ */ jsx40("div", { className: "hb-tab-bar", role: "tablist", onKeyDown: onKey, children: labels2.map((label, i) => /* @__PURE__ */ jsx40(
      "button",
      {
        type: "button",
        role: "tab",
        id: `${base}-tab-${i}`,
        "aria-controls": `${base}-panel`,
        "aria-selected": i === picked,
        tabIndex: i === picked ? 0 : -1,
        className: i === picked ? "hb-tab hb-tab-on" : "hb-tab",
        ref: (el) => {
          buttons.current[i] = el;
        },
        onClick: () => pick2(i),
        children: /* @__PURE__ */ jsx40(InlineText, { text: label })
      },
      i
    )) }),
    /* @__PURE__ */ jsx40("div", { className: "hb-tab-panel hb-appear", role: "tabpanel", id: `${base}-panel`, "aria-labelledby": `${base}-tab-${picked}`, children: panel(picked) }, picked)
  ] });
}

// src/blocks/list/List.tsx
import { useContext as useContext9, useState as useState14 } from "react";

// src/blocks/list/rowAvatar.ts
var AVATAR_COLOURS = [1, 3, 8, 4, 6];
function rowLead(item, ranked, photoFailed) {
  if (item.image && !photoFailed) return "image";
  if (item.icon) return "icon";
  if (ranked) return "none";
  if (initialOf(item.title) === null) return "none";
  return "initial";
}
function initialOf(title) {
  const first = title.match(/[\p{L}\p{N}]/u);
  if (!first) return null;
  return first[0].toLocaleUpperCase();
}
function avatarColour(title) {
  const name = title.replaceAll("**", "").split(" \xB7 ")[0].trim().toLowerCase();
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + ch.codePointAt(0)) % 1000003;
  }
  return `var(--hb-chart-${AVATAR_COLOURS[hash % AVATAR_COLOURS.length]})`;
}

// src/blocks/list/List.tsx
import { Fragment as Fragment11, jsx as jsx41, jsxs as jsxs38 } from "react/jsx-runtime";
function List({ title, ranked, items }) {
  return /* @__PURE__ */ jsxs38("div", { className: "hb-card hb-list", children: [
    title && /* @__PURE__ */ jsx41("div", { className: "hb-list-heading", children: /* @__PURE__ */ jsx41(InlineText, { text: title }) }),
    items.map((item, i) => /* @__PURE__ */ jsx41(ListRow, { item, rank: ranked ? i + 1 : null }, i))
  ] });
}
function ListRow({ item, rank }) {
  const { send } = useContext9(BlockActions);
  const [photoFailed, setPhotoFailed] = useState14(false);
  const lead = rowLead(item, rank !== null, photoFailed);
  const body = /* @__PURE__ */ jsxs38(Fragment11, { children: [
    rank !== null && /* @__PURE__ */ jsx41("span", { className: "hb-list-rank", children: rank }),
    lead === "image" && /* @__PURE__ */ jsx41("img", { className: "hb-list-photo", src: item.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onError: () => setPhotoFailed(true) }),
    lead === "icon" && item.icon && /* @__PURE__ */ jsx41("span", { className: "hb-list-icon", children: /* @__PURE__ */ jsx41(Icon, { name: item.icon, size: 17, stroke: 2.2 }) }),
    lead === "initial" && /* @__PURE__ */ jsx41("span", { className: "hb-list-initial", style: { background: avatarColour(item.title) }, "aria-hidden": "true", children: initialOf(item.title) }),
    /* @__PURE__ */ jsxs38("span", { className: "hb-list-body", children: [
      /* @__PURE__ */ jsx41("span", { className: "hb-list-title", children: /* @__PURE__ */ jsx41(InlineText, { text: item.title }) }),
      item.subtitle && /* @__PURE__ */ jsx41("span", { className: "hb-list-subtitle", children: /* @__PURE__ */ jsx41(InlineText, { text: item.subtitle }) })
    ] }),
    item.value && /* @__PURE__ */ jsx41("span", { className: "hb-list-value", children: /* @__PURE__ */ jsx41(InlineText, { text: item.value }) }),
    (item.run || item.url) && /* @__PURE__ */ jsx41(Chevron, {})
  ] });
  if (item.run) {
    const run = item.run;
    return /* @__PURE__ */ jsx41("button", { type: "button", className: "hb-list-row hb-list-link hb-list-button", title: run, onClick: () => send(run), children: body });
  }
  if (item.url) {
    return /* @__PURE__ */ jsx41("a", { className: "hb-list-row hb-list-link", href: item.url, target: "_blank", rel: "noreferrer", children: body });
  }
  return /* @__PURE__ */ jsx41("div", { className: "hb-list-row", children: body });
}
function Chevron() {
  return /* @__PURE__ */ jsx41(
    "svg",
    {
      className: "hb-list-chevron",
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx41("path", { d: "M9 6l6 6-6 6" })
    }
  );
}

// src/blocks/layers/Layers.tsx
import { useEffect as useEffect5, useRef as useRef10, useState as useState16 } from "react";

// src/lib/canvas.ts
import { useEffect as useEffect4, useState as useState15 } from "react";
function fitCanvas(canvas, height) {
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const tall = height ?? canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(tall * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height: tall };
}
function colourOf(el, token) {
  const before = el.style.color;
  el.style.color = `var(${token})`;
  const colour = getComputedStyle(el).color;
  el.style.color = before;
  return colour;
}
function useTheme() {
  const [version2, setVersion] = useState15(0);
  useEffect4(() => {
    const bump = () => setVersion((v) => v + 1);
    const watcher = typeof MutationObserver === "undefined" ? null : new MutationObserver(bump);
    watcher?.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const scheme = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    scheme?.addEventListener?.("change", bump);
    return () => {
      watcher?.disconnect();
      scheme?.removeEventListener?.("change", bump);
    };
  }, []);
  return version2;
}

// src/blocks/layers/geometry.ts
var SLAB = { width: 2.4, depth: 1.5, thick: 0.16, gap: 0.34, open: 0.5, pull: 0.6 };
function rotate([x, y, z], yaw, pitch) {
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return { x: x1, y: y * Math.cos(pitch) - z1 * Math.sin(pitch), depth: y * Math.sin(pitch) + z1 * Math.cos(pitch) };
}
function stackShapes(n, open, yaw, pitch, width, height) {
  const tall = n * SLAB.thick + (n - 1) * SLAB.gap + SLAB.open;
  const reach = Math.hypot(SLAB.width, SLAB.depth + SLAB.pull);
  const scale = Math.min(width * 0.6 / reach, height * 0.9 / (tall * Math.cos(pitch) + reach * Math.sin(pitch)));
  const cx = width * 0.36;
  const cy = height / 2;
  const screen = ([x, y, z]) => {
    const r = rotate([x, y - tall / 2, z], yaw, pitch);
    return { x: cx + r.x * scale, y: cy - r.y * scale };
  };
  const w = SLAB.width / 2;
  const d = SLAB.depth / 2;
  let floor = 0;
  return Array.from({ length: n }, (_, i) => {
    const z = (open[i] ?? 0) * SLAB.pull;
    const room = SLAB.open * (open[i] ?? 0) / 2;
    const bottom = floor + room;
    const top = bottom + SLAB.thick;
    floor = top + SLAB.gap + room;
    const face = (corners, strength) => ({ corners: corners.map(screen), strength });
    const faces = [];
    const side = Math.sin(yaw) > 0 ? -w : w;
    if (Math.sin(yaw) !== 0) faces.push(face([[side, bottom, z - d], [side, bottom, z + d], [side, top, z + d], [side, top, z - d]], 0.62));
    faces.push(face([[-w, bottom, z + d], [w, bottom, z + d], [w, top, z + d], [-w, top, z + d]], 0.5));
    const roof = face([[-w, top, z - d], [w, top, z - d], [w, top, z + d], [-w, top, z + d]], 0.22);
    faces.push(roof);
    const edge = roof.corners.reduce((a, b) => b.x > a.x ? b : a);
    return { faces, label: { x: edge.x + 12, y: edge.y + 2 } };
  });
}
function inside(corners, x, y) {
  let hit = false;
  for (let a = 0, b = corners.length - 1; a < corners.length; b = a++) {
    const p = corners[a];
    const q = corners[b];
    if (p.y > y !== q.y > y && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) hit = !hit;
  }
  return hit;
}
function slabAt(shapes, x, y) {
  for (let k = shapes.length - 1; k >= 0; k--) {
    if (shapes[k].faces.some((f) => inside(f.corners, x, y))) return k;
  }
  return null;
}

// src/blocks/layers/Layers.tsx
import { jsx as jsx42, jsxs as jsxs39 } from "react/jsx-runtime";
var TURN = 40;
var START_YAW = 28;
var PITCH = 30;
var OPEN_MS = 340;
var TONE_TOKEN = {
  blue: "--hb-chart-1",
  amber: "--hb-chart-2",
  green: "--hb-chart-3",
  violet: "--hb-chart-4",
  accent: "--hb-accent",
  grey: "--hb-muted"
};
var rad = (deg) => deg * Math.PI / 180;
function Layers({ title, caption, layers }) {
  const canvas = useRef10(null);
  const shapes = useRef10([]);
  const drag = useRef10(null);
  const [at2, setAt] = useState16(0);
  const [yaw, setYaw] = useState16(START_YAW);
  const open = useOpening(at2, layers.length);
  const width = useWidth(canvas);
  const theme = useTheme();
  const layer = layers[at2];
  const go = (i) => setAt(Math.max(0, Math.min(layers.length - 1, i)));
  const turn = (by) => setYaw((was) => Math.max(-TURN, Math.min(TURN, was + by)));
  useEffect5(() => {
    const el = canvas.current;
    const fit = el && fitCanvas(el);
    if (!el || !fit) return;
    shapes.current = stackShapes(layers.length, open, rad(yaw), rad(PITCH), fit.width, fit.height);
    paint(fit.ctx, el, fit.width, fit.height, shapes.current, layers.map((l) => l.tone), layers.map((l) => l.label), open);
  }, [open, yaw, width, theme, layers]);
  function onPointerDown(e) {
    drag.current = { x: e.clientX, moved: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    drag.current = { x: e.clientX, moved: drag.current.moved + Math.abs(dx) };
    turn(dx * 0.5);
  }
  function onPointerUp(e) {
    if (drag.current && drag.current.moved < 5) {
      const box = e.currentTarget.getBoundingClientRect();
      const hit = slabAt(shapes.current, e.clientX - box.left, e.clientY - box.top);
      if (hit !== null) go(hit);
    }
    drag.current = null;
  }
  function onCanvasKey(e) {
    const moves = {
      ArrowLeft: () => turn(-5),
      ArrowRight: () => turn(5),
      ArrowUp: () => go(at2 + 1),
      ArrowDown: () => go(at2 - 1)
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    moves[e.key]();
  }
  function onSideKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    go(at2 + (e.key === "ArrowRight" ? 1 : -1));
  }
  const plainNote = layer.note ? ` ${layer.note.replace(/\*\*/g, "")}` : "";
  return /* @__PURE__ */ jsxs39("div", { className: "hb-card hb-layers", children: [
    title && /* @__PURE__ */ jsx42("div", { className: "hb-card-title", children: title }),
    /* @__PURE__ */ jsxs39("div", { className: "hb-layers-body", children: [
      /* @__PURE__ */ jsxs39("div", { className: "hb-layers-stage", children: [
        /* @__PURE__ */ jsx42(
          "canvas",
          {
            ref: canvas,
            className: "hb-layers-canvas",
            tabIndex: 0,
            role: "img",
            "aria-label": `${title ?? "Layers"} in 3D, ${layer.label} pulled out, ${at2 + 1} of ${layers.length}.${plainNote}`,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: () => {
              drag.current = null;
            },
            onKeyDown: onCanvasKey
          }
        ),
        /* @__PURE__ */ jsx42("p", { className: "hb-layers-hint", children: "Drag the drawing, or use \u2190 \u2192 on it, to turn it; \u2191 \u2193 change the slab." }),
        caption && /* @__PURE__ */ jsx42("p", { className: "hb-layers-caption", children: caption })
      ] }),
      /* @__PURE__ */ jsxs39("div", { className: "hb-layers-side", onKeyDown: onSideKey, children: [
        /* @__PURE__ */ jsxs39("div", { className: "hb-steps-head", children: [
          /* @__PURE__ */ jsx42("div", { className: "hb-steps-title", children: layer.label }),
          /* @__PURE__ */ jsx42("span", { className: "hb-steps-place", children: `${at2 + 1} of ${layers.length}` })
        ] }),
        /* @__PURE__ */ jsx42("div", { className: "hb-steps-body", "aria-live": "polite", children: layer.note && /* @__PURE__ */ jsx42("p", { className: "hb-steps-text", children: /* @__PURE__ */ jsx42(InlineText, { text: layer.note }) }) }),
        /* @__PURE__ */ jsx42("div", { className: "hb-steps-foot", children: /* @__PURE__ */ jsxs39("div", { className: "hb-steps-moves", children: [
          /* @__PURE__ */ jsx42("button", { type: "button", className: "hb-pill", disabled: at2 === 0, onClick: () => go(at2 - 1), children: "Back" }),
          /* @__PURE__ */ jsx42("button", { type: "button", className: "hb-pill hb-pill-solid", disabled: at2 === layers.length - 1, onClick: () => go(at2 + 1), children: "Next" })
        ] }) }),
        /* @__PURE__ */ jsx42("ol", { className: "hb-layers-list", "aria-label": "Slabs", children: layers.map((l, i) => /* @__PURE__ */ jsx42("li", { children: /* @__PURE__ */ jsx42("button", { type: "button", className: "hb-layers-slab", "aria-pressed": i === at2, onClick: () => go(i), children: l.label }) }, i)) })
      ] })
    ] })
  ] });
}
function useOpening(at2, n) {
  const [open, setOpen] = useState16(() => Array.from({ length: n }, (_, i) => i === at2 ? 1 : 0));
  const less = useLessMotion();
  const now = useRef10(open);
  now.current = open;
  useEffect5(() => {
    const target = Array.from({ length: n }, (_, i) => i === at2 ? 1 : 0);
    if (less || typeof requestAnimationFrame !== "function") return setOpen(target);
    const from = now.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(time) {
      const p = Math.min(1, (time - start) / OPEN_MS);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      setOpen(target.map((v, k) => (from[k] ?? 0) + (v - (from[k] ?? 0)) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [at2, n]);
  return open;
}
function paint(ctx, el, width, height, shapes, tones, labels2, open) {
  const surface = colourOf(el, "--hb-surface");
  const ink = colourOf(el, "--hb-ink");
  const accent = colourOf(el, "--hb-accent");
  const font = getComputedStyle(el).fontFamily || "system-ui";
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.textBaseline = "middle";
  shapes.forEach((shape, i) => {
    const lit = (open[i] ?? 0) > 0.5;
    const tone2 = lit ? accent : colourOf(el, TONE_TOKEN[tones[i]]);
    shape.faces.forEach((face, f) => {
      const roof = f === shape.faces.length - 1;
      ctx.beginPath();
      face.corners.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.shadowColor = accent;
      ctx.shadowBlur = lit && roof ? 18 * (open[i] ?? 0) : 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = roof && lit ? 0.45 : face.strength;
      ctx.fillStyle = tone2;
      ctx.fill();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = ink;
      ctx.stroke();
    });
    ctx.globalAlpha = lit ? 1 : 0.65;
    ctx.fillStyle = lit ? accent : ink;
    ctx.font = `${lit ? 700 : 600} 12.5px ${font}`;
    ctx.fillText(labels2[i], shape.label.x, shape.label.y);
  });
  ctx.globalAlpha = 1;
}

// src/blocks/layers/read.ts
var TONES3 = ["blue", "amber", "green", "violet", "accent", "grey"];
function readLayers(raw, here) {
  const layers = [];
  (firstList([raw.layers, raw.levels]) ?? []).forEach((l, i) => {
    const label = firstText([l?.label, l?.title, l?.name], 24);
    if (!label) return here.at("layers").at(i).drop("layer needs a label");
    const tone2 = TONES3.includes(l.tone) ? l.tone : "blue";
    layers.push(clean({ label, tone: tone2, note: firstText([l.note, l.text, l.description], 280) }));
  });
  if (layers.length < 2) return here.drop("layers needs at least 2 slabs");
  return clean({
    type: "layers",
    title: str(raw.title, 80),
    caption: str(raw.caption, 200),
    layers: keepFirst(layers, 12, here, "layers")
  });
}

// src/blocks/list/read.ts
var MAX_ITEMS2 = 12;
function readList(raw, here) {
  const list = firstList([raw.items, raw.rows]);
  if (!list) return here.drop("list needs items");
  const items = [];
  list.forEach((item, i) => {
    const row = readListItem(item);
    if (!row) {
      here.at("items").at(i).drop("row has no title");
      return;
    }
    if (actsBeforeTheModel(row.run)) {
      here.at("items").at(i).drop(NO_SEND);
      return;
    }
    items.push(row);
  });
  if (!items.length) return here.drop("list has no row with a title");
  const ranked = raw.ranked === true || raw.numbered === true;
  return clean({ type: "list", title: firstText([raw.title], 60), ranked, items: keepFirst(items, MAX_ITEMS2, here, "rows") });
}
function readListItem(item) {
  if (typeof item === "string") {
    const title2 = firstText([item], 80);
    return title2 ? { title: title2 } : null;
  }
  if (!item || typeof item !== "object") return null;
  const named = firstText([item.title, item.name, item.label], 80);
  const title = named ?? firstText([item.text], 160);
  if (!title) return null;
  const textUnder = named ? item.text : void 0;
  return clean({
    title,
    subtitle: firstWords([item.subtitle, item.description, item.detail, item.note, textUnder], 160),
    value: firstTextOrNumber([item.value, item.price, item.rating, item.score, item.meta, item.badge], 30),
    icon: icon(item.icon),
    image: https(item.image),
    run: firstText([item.run], 300),
    url: https(item.url)
  });
}

// src/blocks/progress/Progress.tsx
import { Fragment as Fragment12, jsx as jsx43, jsxs as jsxs40 } from "react/jsx-runtime";
function trackShare(value, goal, steps) {
  if (!steps.length) return Math.max(0, Math.min(1, value / goal));
  if (value <= steps[0].at) return 0;
  for (let k = 1; k < steps.length; k++) {
    if (value < steps[k].at) return (k - 1 + (value - steps[k - 1].at) / (steps[k].at - steps[k - 1].at)) / (steps.length - 1);
  }
  return 1;
}
function amountOf(value, goal, unit) {
  const plain = fmt(goal);
  const joined = fmt(goal, unit);
  if (!unit || joined !== plain && joined !== `${plain} ${unit}`) return `${fmt(value, unit)} / ${joined}`;
  return `${fmt(value)} / ${plain} ${unit}`;
}
function Progress({ title, value, goal, unit, steps }) {
  const share = trackShare(value, goal, steps);
  return /* @__PURE__ */ jsxs40("div", { className: "hb-card hb-progress", children: [
    /* @__PURE__ */ jsxs40("div", { className: "hb-progress-head", children: [
      /* @__PURE__ */ jsx43("span", { className: "hb-progress-icon", children: /* @__PURE__ */ jsx43(Icon, { name: "trophy", size: 19, stroke: 2.2 }) }),
      /* @__PURE__ */ jsx43("span", { className: "hb-card-title", children: title }),
      /* @__PURE__ */ jsxs40("span", { className: "hb-progress-amount", children: [
        /* @__PURE__ */ jsx43(Icon, { name: "flame", size: 15, stroke: 2.2 }),
        amountOf(value, goal, unit)
      ] })
    ] }),
    steps.length === 0 ? /* @__PURE__ */ jsx43("div", { className: "hb-progress-track", children: /* @__PURE__ */ jsx43("span", { className: "hb-progress-fill", style: { width: `${share * 100}%` } }) }) : /* @__PURE__ */ jsx43(Checkpoints, { steps, value, share, unit })
  ] });
}
function Checkpoints({ steps, value, share, unit }) {
  const n = steps.length;
  const edge = `${50 / n}%`;
  const span = (n - 1) / n * 100;
  return /* @__PURE__ */ jsxs40(Fragment12, { children: [
    /* @__PURE__ */ jsxs40("div", { className: "hb-progress-nodes", children: [
      /* @__PURE__ */ jsx43("span", { className: "hb-progress-track hb-progress-track-steps", style: { left: edge, right: edge } }),
      /* @__PURE__ */ jsx43("span", { className: "hb-progress-fill hb-progress-fill-steps", style: { left: edge, width: `${span * share}%` } }),
      steps.map((s, k) => {
        const done = value >= s.at;
        return /* @__PURE__ */ jsx43("span", { className: done ? "hb-progress-node hb-progress-node-done" : "hb-progress-node", style: { left: `${(k + 0.5) / n * 100}%` }, children: /* @__PURE__ */ jsx43(Icon, { name: done ? "check" : "lock", size: 12, stroke: 2.6 }) }, k);
      })
    ] }),
    /* @__PURE__ */ jsx43("div", { className: "hb-progress-labels", style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }, children: steps.map((s, k) => /* @__PURE__ */ jsx43("span", { children: typeof s.label === "number" ? fmt(s.label, unit) : s.label }, k)) })
  ] });
}

// src/blocks/progress/read.ts
function readProgress(raw, here) {
  const title = str(raw.title, 40);
  if (!title) return here.drop("progress needs a title");
  const value = num(raw.value);
  if (value === null) return here.drop("progress needs a numeric value");
  const goal = num(raw.goal);
  if (goal === null || goal <= 0) return here.drop("progress needs a goal above 0");
  const steps = [];
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  rawSteps.forEach((st, i) => {
    const label = str(st?.label, 28) ?? num(st?.label);
    const at2 = num(st?.at);
    if (label === void 0 || label === null || at2 === null) {
      here.at("steps").at(i).drop("checkpoint needs a label and a number `at`");
      return;
    }
    steps.push({ label, at: at2 });
  });
  steps.sort((a, b) => a.at - b.at);
  return clean({ type: "progress", title, value, goal, unit: str(raw.unit, 12), steps: keepFirst(steps, 6, here, "checkpoints") });
}

// src/blocks/simulate/read.ts
var ID3 = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
var MAX_INPUTS2 = 4;
var MAX_VALUES = 8;
var MAX_PILES = 3;
var MAX_STEPS = 1e3;
var MAX_SECONDS = 60;
var DEFAULT_SECONDS = 10;
function readSimulate(raw, here) {
  const t = readTime(raw.t);
  if (!t) return here.drop("t needs a name (not a helper's) and to above 0");
  const taken = /* @__PURE__ */ new Set([t.name]);
  const values = [];
  const rawValues = raw.values && typeof raw.values === "object" && !Array.isArray(raw.values) ? raw.values : {};
  for (const [name, v] of Object.entries(rawValues)) {
    const n = num(v);
    if (!ID3.test(name) || isHelper(name) || taken.has(name) || n === null) {
      here.at("values").drop(`value "${name}" left out: a new name and a number, please`);
      continue;
    }
    taken.add(name);
    values.push([name, n]);
  }
  const inputs = [];
  (firstList([raw.inputs, raw.sliders]) ?? []).forEach((item, i) => {
    const input = readInput(item, here.at("inputs").at(i));
    if (!input) return;
    if (taken.has(input.id)) return here.at("inputs").at(i).drop(`name "${input.id}" is used twice`);
    taken.add(input.id);
    inputs.push(input);
  });
  const view = raw.view && typeof raw.view === "object" ? raw.view : {};
  const piles = [];
  (firstList([view.piles, view.series, raw.piles, raw.series]) ?? []).forEach((p, i) => {
    const pile = readPile(p, taken, here.at("view").at("piles").at(i));
    if (pile) piles.push(pile);
  });
  if (!piles.length) return here.drop("simulate has no pile it can work out");
  const per = num(view.per);
  return clean({
    type: "simulate",
    title: firstText([raw.title], 80),
    t,
    inputs: keepFirst(inputs, MAX_INPUTS2, here, "inputs"),
    values: keepFirst(values, MAX_VALUES, here, "values"),
    view: view.kind === "chart" ? "chart" : "dots",
    per: per !== null && per > 0 ? per : void 0,
    start: str(view.start, 40),
    piles: keepFirst(piles, MAX_PILES, here, "piles"),
    unit: str(raw.unit, 12),
    source: str(raw.source, 120)
  });
}
function readTime(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = str(raw.name, 24);
  const to = num(raw.to);
  if (!name || !ID3.test(name) || isHelper(name) || to === null || to <= 0) return null;
  const given = num(raw.step);
  const step = Math.max(given !== null && given > 0 ? given : 1, to / MAX_STEPS);
  const speed = num(raw.speed);
  const seconds = speed !== null && speed > 0 ? Math.min(MAX_SECONDS, to / speed) : DEFAULT_SECONDS;
  return clean({ name, to, step, unit: str(raw.unit, 12), seconds });
}
function readPile(p, names, here) {
  const name = firstText([p?.name, p?.label], 40);
  const formula = firstText([p?.formula, p?.expr], 300);
  if (!name || !formula) return here.drop("pile needs a name and a formula");
  try {
    const unknown = namesIn(parseFormula(formula)).filter((n) => !names.has(n));
    if (unknown.length) return here.drop(`formula uses ${unknown.join(", ")}, which nothing gives`);
  } catch (e) {
    return here.drop(`formula can't be read (${e.message})`);
  }
  return clean({ name, formula, adds: firstText([p.adds], 40) });
}

// src/blocks/simulate/Simulate.tsx
import { useEffect as useEffect7, useMemo as useMemo5, useRef as useRef13, useState as useState17 } from "react";

// src/blocks/source/Source.tsx
import { jsx as jsx44 } from "react/jsx-runtime";
function Source({ text, url }) {
  if (!url) return /* @__PURE__ */ jsx44("div", { className: "hb-source", children: text });
  return /* @__PURE__ */ jsx44("div", { className: "hb-source", children: /* @__PURE__ */ jsx44("a", { href: url, target: "_blank", rel: "noreferrer", children: text }) });
}

// src/blocks/simulate/Piles.tsx
import { useEffect as useEffect6, useRef as useRef11 } from "react";

// src/blocks/simulate/sim.ts
var MAX_DOTS = 600;
var DEFAULT_DOTS = 150;
function whole(t, step) {
  return Math.round(Math.floor(t / step + 1e-9) * step * 1e9) / 1e9;
}
function timesOf(to, step) {
  const out = [];
  for (let k = 0; k * step <= to + 1e-9; k++) out.push(whole(k * step, step));
  return out;
}
function niceAbove(v) {
  const power = 10 ** Math.floor(Math.log10(v));
  const m = v / power;
  return (m <= 1 + 1e-9 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * power;
}
function dotPer(per, most) {
  if (!(most > 0)) return per ?? 1;
  if (per !== void 0 && most / per <= MAX_DOTS) return per;
  return niceAbove(most / (per === void 0 ? DEFAULT_DOTS : MAX_DOTS));
}
function dotColour(n, start, counts, k) {
  const bands = [start, ...counts.slice(0, k + 1)];
  const band = bands.findIndex((limit) => n < limit);
  return band < 0 ? k + 1 : band;
}

// src/blocks/simulate/Piles.tsx
import { Fragment as Fragment13, jsx as jsx45, jsxs as jsxs41 } from "react/jsx-runtime";
var GROW_MS = 280;
var DOT = 14;
function Piles({ piles, amounts, start, per, most, playing, unit, label }) {
  const counts = amounts.map((a) => Math.max(0, Math.round((a ?? 0) / per)));
  const startDots = Math.max(0, Math.round(start / per));
  const tallest = Math.max(1, ...most.map((m) => Math.round(m / per)));
  return /* @__PURE__ */ jsxs41(Fragment13, { children: [
    /* @__PURE__ */ jsx45("div", { className: "hb-sim-piles", children: piles.map((pile, k) => /* @__PURE__ */ jsx45(
      Pile,
      {
        k,
        name: pile.name,
        amount: amounts[k],
        counts,
        startDots,
        tallest,
        playing,
        unit
      },
      k
    )) }),
    /* @__PURE__ */ jsxs41("div", { className: "hb-legend", children: [
      /* @__PURE__ */ jsxs41("span", { className: "hb-legend-item", children: [
        /* @__PURE__ */ jsx45("i", { className: "hb-legend-dot", style: { background: partColour(0) } }),
        `${label ?? "Start"} (a dot is ${fmt(per, unit, { full: true })})`
      ] }),
      piles.map((pile, k) => /* @__PURE__ */ jsxs41("span", { className: "hb-legend-item", children: [
        /* @__PURE__ */ jsx45("i", { className: "hb-legend-dot", style: { background: partColour(k + 1) } }),
        pile.adds ?? pile.name
      ] }, k))
    ] })
  ] });
}
function Pile({ k, name, amount: amount2, counts, startDots, tallest, playing, unit }) {
  const canvas = useRef11(null);
  const born = useRef11([]);
  const width = useWidth(canvas);
  const theme = useTheme();
  const less = useLessMotion();
  const count = counts[k];
  const cols = Math.max(20, Math.floor(width / DOT));
  const size = width / cols;
  const height = Math.ceil(tallest / cols) * size;
  const shown = amount2 === null ? "\u2013" : fmt(amount2, unit, { full: true });
  useEffect6(() => {
    const el = canvas.current;
    if (!el) return;
    const grow = playing && !less;
    let frame = 0;
    const draw = () => {
      const fit = fitCanvas(el, height);
      if (!fit) return;
      const now = performance.now();
      const palette2 = [1, 2, 3, 4].map((i) => colourOf(el, `--hb-chart-${i}`));
      born.current.length = Math.min(born.current.length, count);
      while (born.current.length < count) born.current.push(grow ? now : 0);
      let growing = false;
      fit.ctx.clearRect(0, 0, fit.width, fit.height);
      for (let n = 0; n < count; n++) {
        const g = Math.min(1, (now - born.current[n]) / GROW_MS);
        if (g < 1) growing = true;
        fit.ctx.fillStyle = palette2[dotColour(n, startDots, counts, k)];
        fit.ctx.beginPath();
        fit.ctx.arc(n % cols * size + size / 2, fit.height - (Math.floor(n / cols) * size + size / 2), size * 0.38 * g, 0, Math.PI * 2);
        fit.ctx.fill();
      }
      if (growing) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [count, counts.join(), startDots, width, height, theme, less]);
  return /* @__PURE__ */ jsxs41("div", { className: "hb-sim-pile", children: [
    /* @__PURE__ */ jsx45("div", { className: "hb-sim-pile-name", children: name }),
    /* @__PURE__ */ jsx45("div", { className: "hb-sim-amount", children: shown }),
    /* @__PURE__ */ jsx45("canvas", { ref: canvas, className: "hb-sim-canvas", style: { height }, role: "img", "aria-label": `${name}: ${shown}, ${count} dots` })
  ] });
}

// src/blocks/simulate/SimChart.tsx
import { useRef as useRef12 } from "react";
import { jsx as jsx46, jsxs as jsxs42 } from "react/jsx-runtime";
var HEIGHT = 220;
var PAD = { left: 52, right: 12, top: 10, bottom: 22 };
function SimChart({ piles, lines, times, index, unit }) {
  const box = useRef12(null);
  const width = useWidth(box);
  const to = times[times.length - 1];
  const top = Math.max(1e-9, ...lines.flat().map((v) => v ?? 0));
  const yStep = niceAbove(top / 4);
  const yMax = Math.ceil(top / yStep) * yStep;
  const xStep = niceAbove(to / 5);
  const x = (t) => PAD.left + t / to * (width - PAD.left - PAD.right);
  const y = (v) => HEIGHT - PAD.bottom - v / yMax * (HEIGHT - PAD.top - PAD.bottom);
  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, k) => k * yStep);
  const xTicks = Array.from({ length: Math.floor(to / xStep + 1e-9) + 1 }, (_, k) => k * xStep);
  const now = times[index];
  const label = piles.map((p, k) => `${p.name} ${valueText(lines[k][index], unit)}`).join(", ");
  return /* @__PURE__ */ jsxs42("div", { ref: box, className: "hb-sim-chart", children: [
    /* @__PURE__ */ jsxs42("svg", { width: "100%", height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, role: "img", "aria-label": `Line chart at ${fmt(now)}: ${label}`, children: [
      yTicks.map((v) => /* @__PURE__ */ jsxs42("g", { children: [
        /* @__PURE__ */ jsx46("line", { x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v), className: "hb-sim-grid" }),
        /* @__PURE__ */ jsx46("text", { x: PAD.left - 6, y: y(v) + 4, textAnchor: "end", children: fmt(v, unit) })
      ] }, v)),
      xTicks.map((t) => /* @__PURE__ */ jsx46("text", { x: x(t), y: HEIGHT - 6, textAnchor: "middle", children: fmt(t) }, t)),
      piles.map((_, k) => {
        const points = lines[k].slice(0, index + 1).flatMap((v, i) => v === null ? [] : [`${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`]);
        const last = lines[k][index];
        return /* @__PURE__ */ jsxs42("g", { style: { color: partColour(k + 1) }, children: [
          /* @__PURE__ */ jsx46("polyline", { points: points.join(" "), className: "hb-sim-line" }),
          last !== null && /* @__PURE__ */ jsx46("circle", { cx: x(now), cy: y(last), r: 4.5, className: "hb-sim-point" })
        ] }, k);
      })
    ] }),
    /* @__PURE__ */ jsx46("div", { className: "hb-legend", children: piles.map((p, k) => /* @__PURE__ */ jsxs42("span", { className: "hb-legend-item", children: [
      /* @__PURE__ */ jsx46("i", { className: "hb-legend-dot", style: { background: partColour(k + 1) } }),
      p.name,
      /* @__PURE__ */ jsx46("span", { className: "hb-legend-value", children: valueText(lines[k][index], unit) })
    ] }, k)) })
  ] });
}
function valueText(v, unit) {
  return v === null || v === void 0 ? "\u2013" : fmt(v, unit, { full: true });
}

// src/blocks/simulate/Simulate.tsx
import { jsx as jsx47, jsxs as jsxs43 } from "react/jsx-runtime";
function Simulate(block) {
  const { title, t: time, inputs, values: fixed, piles, unit, source } = block;
  const root = useRef13(null);
  const clock = useRef13(time.to);
  const [sliders, setSliders] = useState17(() => new Map(inputs.map((x) => [x.id, x.value])));
  const [view, setView] = useState17(block.view);
  const [at2, setAt] = useState17(time.to);
  const [playing, setPlaying] = useState17(false);
  const trees = useMemo5(() => piles.map((p) => parseFormula(p.formula)), [piles]);
  const names = useMemo5(() => new Map([...fixed, ...sliders]), [fixed, sliders]);
  const times = useMemo5(() => timesOf(time.to, time.step), [time]);
  const lines = useMemo5(() => valuesOver(trees, names, time.name, times), [trees, names, time.name, times]);
  const most = useMemo5(() => {
    const tops = new Map([...fixed, ...inputs.map((x) => [x.id, x.max])]);
    const high = valuesOver(trees, tops, time.name, [time.to]);
    return trees.map((_, k) => Math.max(0, high[k][0] ?? 0, ...lines[k].map((v) => v ?? 0)));
  }, [trees, fixed, inputs, lines, time]);
  const per = dotPer(block.per, most.reduce((a, b) => a + b, 0));
  const index = Math.round(at2 / time.step);
  const amounts = lines.map((line) => line[index] ?? null);
  usePlay(playing, () => setPlaying(false), clock, time, setAt);
  usePauseWhenHidden(root, playing, () => setPlaying(false));
  function play() {
    if (playing) return setPlaying(false);
    if (clock.current >= time.to) {
      clock.current = 0;
      setAt(0);
    }
    setPlaying(true);
  }
  function scrub(v) {
    setPlaying(false);
    clock.current = v;
    setAt(v);
  }
  return /* @__PURE__ */ jsxs43("div", { ref: root, className: "hb-card hb-sim", children: [
    /* @__PURE__ */ jsxs43("div", { className: "hb-sim-head", children: [
      title && /* @__PURE__ */ jsx47("div", { className: "hb-card-title", children: /* @__PURE__ */ jsx47(InlineText, { text: title }) }),
      /* @__PURE__ */ jsxs43("div", { className: "hb-sim-switch", role: "group", "aria-label": "View", children: [
        /* @__PURE__ */ jsx47("button", { type: "button", "aria-pressed": view === "dots", onClick: () => setView("dots"), children: "Dots" }),
        /* @__PURE__ */ jsx47("button", { type: "button", "aria-pressed": view === "chart", onClick: () => setView("chart"), children: "Line chart" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs43("div", { className: "hb-sim-controls", children: [
      /* @__PURE__ */ jsxs43("button", { type: "button", className: "hb-pill hb-pill-solid hb-sim-play", onClick: play, children: [
        /* @__PURE__ */ jsx47("svg", { width: "14", height: "14", viewBox: "0 0 24 24", "aria-hidden": "true", fill: "currentColor", children: /* @__PURE__ */ jsx47("path", { d: playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M8 5.5v13l10.5-6.5z" }) }),
        playing ? "Pause" : "Play"
      ] }),
      /* @__PURE__ */ jsxs43("label", { className: "hb-calc-slider hb-sim-time", children: [
        /* @__PURE__ */ jsxs43("span", { className: "hb-calc-head", children: [
          /* @__PURE__ */ jsx47("span", { className: "hb-calc-label", children: time.unit ? capital(time.unit) : time.name }),
          /* @__PURE__ */ jsx47("span", { className: "hb-calc-value", children: `${fmt(at2)} of ${fmt(time.to)}` })
        ] }),
        /* @__PURE__ */ jsx47(
          "input",
          {
            type: "range",
            className: "hb-range",
            min: 0,
            max: time.to,
            step: time.step,
            value: at2,
            "aria-label": time.unit ?? time.name,
            onChange: (e) => scrub(Number(e.target.value))
          }
        )
      ] }),
      inputs.map((input) => /* @__PURE__ */ jsx47(
        Slider,
        {
          input,
          value: sliders.get(input.id) ?? input.value,
          onMove: (v) => setSliders((all) => new Map(all).set(input.id, v))
        },
        input.id
      ))
    ] }),
    view === "dots" ? /* @__PURE__ */ jsx47(Piles, { piles, amounts, start: lines[0][0] ?? 0, per, most, playing, unit, label: block.start }) : /* @__PURE__ */ jsx47(SimChart, { piles, lines, times, index, unit }),
    source && /* @__PURE__ */ jsx47(Source, { text: source })
  ] });
}
function capital(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
function valuesOver(trees, names, tName, times) {
  const budget = newBudget(MAX_CHART_WORK);
  return trees.map((tree) => times.map((t) => evaluate(tree, new Map(names).set(tName, t), budget)));
}
function usePlay(playing, stop, clock, time, show) {
  useEffect7(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      clock.current = Math.min(time.to, clock.current + (now - last) / 1e3 * (time.to / time.seconds));
      last = now;
      show(whole(clock.current, time.step));
      if (clock.current >= time.to) return stop();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);
}
function usePauseWhenHidden(root, playing, pause) {
  useEffect7(() => {
    if (!playing || !root.current || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(([entry2]) => {
      if (!entry2.isIntersecting) pause();
    });
    watcher.observe(root.current);
    return () => watcher.disconnect();
  }, [playing]);
}

// src/blocks/source/read.ts
function readSource(raw, here) {
  const named = [];
  if (Array.isArray(raw.sources)) {
    for (const s of raw.sources) if (s && firstText([s.name, s.title])) named.push(s);
  }
  let text = typeof raw.text === "string" ? raw.text : "";
  if (!text) text = named.map((s) => firstText([s.name, s.title])).join(" \xB7 ");
  if (!text) return here.drop("source needs text");
  const candidates = [raw.url, ...named.map((s) => s.url)];
  const url = candidates.find((u) => typeof u === "string" && /^https?:\/\//.test(u));
  if (url) return { type: "source", text, url };
  return { type: "source", text };
}

// src/blocks/steps/read.ts
function readSteps(raw, here) {
  const list = firstList([raw.items, raw.steps]) ?? [];
  const items = [];
  list.forEach((s, i) => {
    const title = firstText([s?.title, s?.label], 80);
    if (!title) {
      here.at("items").at(i).drop("step needs a title");
      return;
    }
    const tick = num(s.tick);
    items.push(clean({
      title,
      text: firstText([s.text, s.body, s.description], 600),
      node: slug(s.node),
      image: https(s.image),
      holds: readHolds(s.holds, here.at("items").at(i).at("holds")),
      send: s.send === true ? true : void 0,
      tick: tick !== null && Number.isInteger(tick) && tick >= 1 && tick <= 20 ? tick : void 0
    }));
  });
  if (!items.length) return here.drop("steps has no titled step");
  return clean({ type: "steps", title: str(raw.title, 80), for: slug(raw.for) ?? slug(raw.flow), items: keepFirst(items, 12, here, "steps") });
}
function readHolds(raw, here) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const holds = {};
  for (const [key, value] of Object.entries(raw).slice(0, 10)) {
    const id = slug(key);
    const chips = id === void 0 ? void 0 : readChips(value, here.at(id));
    if (id !== void 0 && chips !== void 0) holds[id] = chips;
  }
  return Object.keys(holds).length ? holds : void 0;
}

// src/blocks/steps/Steps.tsx
import { useEffect as useEffect8, useRef as useRef14, useState as useState18 } from "react";
import { jsx as jsx48, jsxs as jsxs44 } from "react/jsx-runtime";
function Steps({ title, for: flow, items }) {
  const [at2, setAt] = useState18(0);
  const [failed, setFailed] = useState18(() => /* @__PURE__ */ new Set());
  const setWalk = useSetWalk();
  const before = useRef14(null);
  const step = items[at2];
  const go = (to) => setAt(Math.max(0, Math.min(items.length - 1, to)));
  useEffect8(() => {
    if (flow !== void 0) setWalk(flow, { steps: items, at: at2, from: before.current });
    before.current = at2;
  }, [flow, items, at2, setWalk]);
  useEffect8(() => () => {
    if (flow !== void 0) setWalk(flow, void 0);
  }, [flow, setWalk]);
  function onKeyDown(e) {
    if (e.key === "ArrowRight") go(at2 + 1);
    else if (e.key === "ArrowLeft") go(at2 - 1);
    else return;
    e.preventDefault();
  }
  const photo = step.image && !failed.has(at2) ? step.image : void 0;
  return /* @__PURE__ */ jsxs44("div", { className: "hb-card hb-steps", role: "group", "aria-label": title ?? "Steps", onKeyDown, children: [
    /* @__PURE__ */ jsxs44("div", { className: "hb-steps-head", children: [
      title && /* @__PURE__ */ jsx48("div", { className: "hb-card-title", children: title }),
      /* @__PURE__ */ jsx48("span", { className: "hb-steps-place", children: `${at2 + 1} of ${items.length}` })
    ] }),
    /* @__PURE__ */ jsxs44("div", { className: "hb-steps-body", "aria-live": "polite", children: [
      /* @__PURE__ */ jsx48("div", { className: "hb-steps-title", children: step.title }),
      step.text && /* @__PURE__ */ jsx48("p", { className: "hb-steps-text", children: /* @__PURE__ */ jsx48(InlineText, { text: step.text }) }),
      photo && /* @__PURE__ */ jsx48(
        "img",
        {
          className: "hb-steps-photo",
          src: photo,
          alt: "",
          loading: "lazy",
          referrerPolicy: "no-referrer",
          onError: () => setFailed((was) => new Set(was).add(at2))
        },
        at2
      )
    ] }),
    /* @__PURE__ */ jsxs44("div", { className: "hb-steps-foot", children: [
      /* @__PURE__ */ jsx48("div", { className: "hb-steps-dots", children: items.map((s, i) => /* @__PURE__ */ jsx48(
        "button",
        {
          type: "button",
          className: i === at2 ? "hb-steps-dot hb-steps-dot-on" : "hb-steps-dot",
          "aria-label": `Step ${i + 1}: ${s.title}`,
          "aria-current": i === at2 ? "step" : void 0,
          onClick: () => go(i)
        },
        i
      )) }),
      /* @__PURE__ */ jsxs44("div", { className: "hb-steps-moves", children: [
        /* @__PURE__ */ jsx48("button", { type: "button", className: "hb-pill", disabled: at2 === 0, onClick: () => go(at2 - 1), children: "Back" }),
        /* @__PURE__ */ jsx48("button", { type: "button", className: "hb-pill hb-pill-solid", disabled: at2 === items.length - 1, onClick: () => go(at2 + 1), children: "Next" })
      ] })
    ] })
  ] });
}

// src/blocks/streak/read.ts
function readStreak(raw, here) {
  const count = num(raw.count);
  if (count === null) return here.drop("streak needs a numeric count");
  const days = [];
  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  rawDays.forEach((d, i) => {
    const label2 = str(d?.label, 4);
    if (!label2) {
      here.at("days").at(i).drop("day has no label");
      return;
    }
    days.push(clean({ label: label2, date: str(d.date, 3), done: d.done === true, today: d.today === true }));
  });
  const label = str(raw.label, 30) ?? "Current streak";
  const unit = str(raw.unit, 12) ?? "days";
  return { type: "streak", count, label, unit, days: keepFirst(days, 7, here, "days") };
}

// src/blocks/streak/Streak.tsx
import { jsx as jsx49, jsxs as jsxs45 } from "react/jsx-runtime";
function unitFor(count, unit) {
  if (count === 1 && unit.endsWith("s")) return unit.slice(0, -1);
  return unit;
}
function Streak({ count, label, unit, days }) {
  return /* @__PURE__ */ jsxs45("div", { className: "hb-card hb-streak", children: [
    /* @__PURE__ */ jsxs45("div", { className: "hb-streak-head", children: [
      /* @__PURE__ */ jsxs45("div", { children: [
        /* @__PURE__ */ jsx49("div", { className: "hb-streak-label", children: label }),
        /* @__PURE__ */ jsxs45("div", { className: "hb-streak-count", children: [
          formatNumber(count, { digits: 3 }),
          " ",
          /* @__PURE__ */ jsx49("span", { children: unitFor(count, unit) })
        ] })
      ] }),
      /* @__PURE__ */ jsx49("span", { className: "hb-streak-medal", children: /* @__PURE__ */ jsx49(Icon, { name: "star", size: 24, stroke: 2.4 }) })
    ] }),
    days.length > 0 && /* @__PURE__ */ jsx49("div", { className: "hb-streak-week", style: { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }, children: days.map((d, k) => /* @__PURE__ */ jsxs45("div", { className: d.today ? "hb-streak-day hb-streak-today" : "hb-streak-day", children: [
      /* @__PURE__ */ jsx49("span", { className: "hb-streak-day-label", children: d.label }),
      d.done ? /* @__PURE__ */ jsx49("span", { className: "hb-streak-done", children: /* @__PURE__ */ jsx49(Icon, { name: "check", size: 15, stroke: 2.6 }) }) : /* @__PURE__ */ jsx49("span", { className: "hb-streak-date", children: d.date ?? "\xB7" }),
      /* @__PURE__ */ jsx49("span", { className: "hb-streak-dot" })
    ] }, k)) })
  ] });
}

// src/blocks/table/read.ts
var MAX_COLUMNS2 = 8;
var MAX_ROWS = 30;
function readTable(raw, here) {
  const rawRows = firstList([raw.rows, raw.data]) ?? [];
  let columns = readColumns(firstList([raw.columns, raw.headers, raw.header]));
  let rowsToRead = rawRows;
  if (!columns.length) {
    const first = rawRows[0];
    if (Array.isArray(first)) {
      columns = readColumns(first);
      rowsToRead = rawRows.slice(1);
    } else if (first && typeof first === "object") {
      columns = readColumns(Object.keys(first));
    }
  }
  if (!columns.length) return here.drop("table needs columns");
  columns = keepFirst(columns, MAX_COLUMNS2, here.at("columns"), "columns");
  const rows2 = [];
  rowsToRead.forEach((row, i) => {
    const cells = readRow(row, columns, here.at("rows").at(i));
    if (cells) rows2.push(cells);
  });
  if (!rows2.length) here.drop("table has no rows");
  const kept = keepFirst(rows2, MAX_ROWS, here.at("rows"), "rows");
  const highlight = readHighlight(raw.highlight, columns, kept, here.at("highlight"));
  const caption = firstText([raw.caption, raw.title], 100);
  const interactive = raw.interactive === true ? true : void 0;
  return clean({ type: "table", columns, rows: kept, highlight, caption, interactive });
}
function readColumns(list) {
  if (!list) return [];
  return list.map((c) => {
    if (c && typeof c === "object") return firstText([c.label, c.name, c.title], 40) ?? "";
    return textOrNumber(c, 40) ?? "";
  });
}
function readRow(row, columns, here) {
  let cells;
  if (Array.isArray(row)) {
    cells = row;
  } else if (row && typeof row === "object") {
    cells = cellsByColumnName(row, columns);
  } else {
    return here.drop("row is not a list of cells");
  }
  if (cells.length > columns.length) return here.drop(`row has ${cells.length} cells, table has ${columns.length} columns`);
  const out = cells.map(cellText2);
  while (out.length < columns.length) out.push("");
  return out;
}
function cellsByColumnName(row, columns) {
  const byLowerName = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  return columns.map((c) => byLowerName.get(c.toLowerCase()));
}
function cellText2(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return textOrNumber(v, 120) ?? "";
}
function readHighlight(v, columns, rows2, here) {
  if (v === void 0 || v === null) return void 0;
  let found;
  if (num(v) !== null) {
    found = { row: v };
  } else if (typeof v === "string") {
    found = highlightByName(v, columns, rows2);
  } else if (typeof v === "object") {
    if (num(v.row) !== null) found = { row: v.row };
    const column = num(v.column) ?? num(v.col);
    if (!found && column !== null) found = { column };
  }
  if (!found) {
    here.drop("highlight should be {row: n} or {column: n}");
    return void 0;
  }
  const inRange = "row" in found ? isIndex(found.row, rows2.length) : isIndex(found.column, columns.length);
  if (!inRange) {
    here.drop("highlight is outside the table");
    return void 0;
  }
  return found;
}
function highlightByName(name, columns, rows2) {
  const wanted = str(name)?.toLowerCase();
  const row = rows2.findIndex((r) => r[0].toLowerCase() === wanted);
  if (row >= 0) return { row };
  const column = columns.findIndex((c) => c.toLowerCase() === wanted);
  if (column >= 0) return { column };
  return void 0;
}
function isIndex(n, length) {
  return Number.isInteger(n) && n >= 0 && n < length;
}

// src/blocks/table/Table.tsx
import { useContext as useContext10, useRef as useRef15, useState as useState19 } from "react";

// src/blocks/table/sort.ts
function cellNumber(cell) {
  const plain = cell.replace(/,/g, "").replace(/^−/, "-");
  const m = /^([-+]?)[^\d\-+]{0,3}([-+]?\d+(?:\.\d+)?)/.exec(plain);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === "-" ? -n : n;
}
function sortedOrder(rows2, sort) {
  const order = rows2.map((_, i) => i);
  if (!sort) return order;
  const sign = sort.direction === "up" ? 1 : -1;
  return order.sort((a, b) => {
    const left = rows2[a][sort.column] ?? "";
    const right = rows2[b][sort.column] ?? "";
    if (!left || !right) return blanksLast(left, right);
    return sign * compareCells(left, right);
  });
}
function blanksLast(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  return -1;
}
function compareCells(left, right) {
  const a = cellNumber(left);
  const b = cellNumber(right);
  if (a !== null && b !== null) return a - b;
  return left.localeCompare(right, void 0, { numeric: true, sensitivity: "base" });
}
function nextSort(sort, column) {
  if (!sort || sort.column !== column) return { column, direction: "up" };
  if (sort.direction === "up") return { column, direction: "down" };
  return null;
}
function isNumberColumn(rows2, column) {
  const filled = rows2.map((r) => r[column]).filter((cell) => cell);
  return filled.length > 0 && filled.every((cell) => cellNumber(cell) !== null);
}

// src/blocks/table/cells.ts
function isChangeColumn(rows2, column) {
  if (!isNumberColumn(rows2, column) || !rows2.some((r) => /^[-+−]/.test(r[column] ?? ""))) return false;
  const filled = rows2.map((r) => (r[column] ?? "").trim()).filter(Boolean);
  const allPercent = filled.every((cell) => cell.endsWith("%"));
  const allSigned = filled.every((cell) => /^[-+−]/.test(cell) || cellNumber(cell) === 0);
  return allPercent || allSigned;
}
function changeOf(cell) {
  const n = cellNumber(cell);
  if (n === null || n === 0) return null;
  return n > 0 ? "up" : "down";
}
function miniBar(value, largest) {
  const width = largest > 0 ? Math.abs(value) / largest * 50 : 0;
  return { left: value < 0 ? 50 - width : 50, width };
}
var AMOUNT = /^([-+−]?)([$₹€£¥]?)(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?$/;
function bigNumber(cell) {
  const m = AMOUNT.exec(cell.trim());
  if (!m) return null;
  const [, sign, currency, digits, decimals2 = ""] = m;
  if (!currency && !digits.includes(",")) return null;
  const magnitude = Number(digits.replace(/,/g, "") + decimals2);
  if (magnitude < SHORT_FROM) return null;
  const v = sign === "-" || sign === "\u2212" ? -magnitude : magnitude;
  const unit = currency || void 0;
  const plus = sign === "+" ? "+" : "";
  return { short: plus + fmt(v, unit), full: plus + fmt(v, unit, { full: true }) };
}

// src/blocks/table/pick.ts
function rowMatches(row, query) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  return row.some((cell) => cell.toLowerCase().includes(wanted));
}
function pickedMessage(caption, columns, rows2, picked) {
  const line = (cells) => cells.join(" | ");
  const order = [...picked].sort((a, b) => a - b);
  return [`${caption ? `${caption}:` : "Table:"}`, line(columns), ...order.map((r) => line(rows2[r]))].join("\n");
}

// src/blocks/table/Table.tsx
import { jsx as jsx50, jsxs as jsxs46 } from "react/jsx-runtime";
var MINI_BARS_FROM = 3;
function Table({ columns, rows: rows2, highlight, caption, interactive }) {
  const [sort, setSort] = useState19(null);
  const [query, setQuery] = useState19("");
  const [picked, setPicked] = useState19([]);
  const [sent, setSent] = useState19(null);
  const taps = useRef15(0);
  const { send } = useContext10(BlockActions);
  const order = sortedOrder(rows2, sort);
  const visible = interactive ? order.filter((r) => rowMatches(rows2[r], query)) : order;
  const message = pickedMessage(caption, columns, rows2, picked);
  const bestRow = highlight && "row" in highlight ? highlight.row : -1;
  const bestColumn = highlight && "column" in highlight ? highlight.column : -1;
  const numeric = columns.map((_, c) => isNumberColumn(rows2, c));
  const change = columns.map((_, c) => isChangeColumn(rows2, c));
  const largest = columns.map((_, c) => change[c] ? largestChange(rows2, c) : 0);
  const withBars = rows2.length >= MINI_BARS_FROM;
  const cellClass = (c, text, extra = "") => [
    numeric[c] ? "hb-num" : "",
    c === 0 ? "hb-first" : "",
    c === bestColumn ? "hb-best-col" : "",
    text.length > 28 ? "hb-wrap" : "",
    extra
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxs46("div", { className: "hb-card hb-table-card", children: [
    caption && /* @__PURE__ */ jsx50("div", { className: "hb-chart-title hb-table-caption", children: /* @__PURE__ */ jsx50(InlineText, { text: caption }) }),
    interactive && /* @__PURE__ */ jsxs46("div", { className: "hb-table-tools", children: [
      /* @__PURE__ */ jsx50(
        "input",
        {
          type: "search",
          className: "hb-table-filter",
          placeholder: "Filter rows",
          "aria-label": "Filter rows",
          value: query,
          onChange: (e) => {
            setQuery(e.target.value);
            setSent(null);
          }
        }
      ),
      /* @__PURE__ */ jsxs46(
        "button",
        {
          type: "button",
          className: "hb-pill",
          "aria-label": "Send selected rows as context",
          title: picked.length ? message : void 0,
          disabled: !picked.length,
          onClick: () => {
            const tap = ++taps.current;
            send(message, { force: true }).then((where) => {
              if (tap === taps.current) setSent(where);
            });
          },
          children: [
            /* @__PURE__ */ jsx50(Icon, { name: "spark", size: 14, stroke: 2.2 }),
            /* @__PURE__ */ jsx50("span", { className: "hb-pill-label", children: "Send selected as context" })
          ]
        }
      ),
      /* @__PURE__ */ jsx50("span", { className: "hb-table-sent", role: "status", "aria-live": "polite", children: sent ? SENT_WORDS[sent] : "" })
    ] }),
    /* @__PURE__ */ jsx50("div", { className: "hb-table-scroll", children: /* @__PURE__ */ jsxs46("table", { className: columns.length >= 3 ? "hb-table hb-table-wide" : "hb-table", children: [
      /* @__PURE__ */ jsx50("thead", { children: /* @__PURE__ */ jsxs46("tr", { children: [
        interactive && /* @__PURE__ */ jsx50("th", { className: "hb-pick", "aria-label": "Selected rows" }),
        columns.map((name, c) => /* @__PURE__ */ jsx50("th", { "aria-sort": ariaSort(sort, c), className: cellClass(c, name, sort?.column === c ? "hb-sorted" : ""), children: /* @__PURE__ */ jsxs46("button", { type: "button", onClick: () => setSort(nextSort(sort, c)), children: [
          /* @__PURE__ */ jsx50("span", { children: name }),
          /* @__PURE__ */ jsx50("span", { className: "hb-sort", "aria-hidden": "true", children: sortMark(sort, c) }),
          c === bestColumn && /* @__PURE__ */ jsx50("span", { className: "hb-chip hb-chip-soft", children: "Best" })
        ] }) }, c))
      ] }) }),
      /* @__PURE__ */ jsxs46("tbody", { children: [
        !rows2.length && /* @__PURE__ */ jsx50("tr", { children: /* @__PURE__ */ jsx50("td", { className: "hb-table-empty", colSpan: interactive ? columns.length + 1 : columns.length, children: "No rows to show." }) }),
        interactive && rows2.length > 0 && visible.length === 0 && query.trim() && /* @__PURE__ */ jsx50("tr", { children: /* @__PURE__ */ jsxs46("td", { className: "hb-table-empty", colSpan: columns.length + 1, children: [
          "Nothing matches \u201C",
          query.trim(),
          "\u201D."
        ] }) }),
        visible.map((r) => /* @__PURE__ */ jsxs46("tr", { className: r === bestRow ? "hb-best" : void 0, children: [
          interactive && /* @__PURE__ */ jsx50("td", { className: "hb-pick", children: /* @__PURE__ */ jsx50(
            "input",
            {
              type: "checkbox",
              checked: picked.includes(r),
              onChange: () => {
                setPicked((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r]);
                setSent(null);
              },
              "aria-label": `Select row ${rows2[r][0] || `#${r + 1}`}`
            }
          ) }),
          rows2[r].map((cell, c) => {
            const big = bigNumber(cell);
            const direction = change[c] ? changeOf(cell) : null;
            return /* @__PURE__ */ jsxs46("td", { className: cellClass(c, cell, direction ? `hb-${direction}` : ""), title: big?.full, children: [
              change[c] && withBars && /* @__PURE__ */ jsx50(MiniBar, { value: cellNumber(cell) ?? 0, largest: largest[c] }),
              big ? big.short : /* @__PURE__ */ jsx50(InlineText, { text: cell }),
              c === 0 && r === bestRow && /* @__PURE__ */ jsx50("span", { className: "hb-chip hb-chip-soft", children: "Best" })
            ] }, c);
          })
        ] }, r))
      ] })
    ] }) })
  ] });
}
function MiniBar({ value, largest }) {
  const { left, width } = miniBar(value, largest);
  return /* @__PURE__ */ jsxs46("span", { className: "hb-mini", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx50("span", { className: "hb-mini-zero" }),
    /* @__PURE__ */ jsx50("span", { className: "hb-mini-bar", style: { left: `${left}%`, width: `${width}%` } })
  ] });
}
function largestChange(rows2, column) {
  return Math.max(0, ...rows2.map((r) => Math.abs(cellNumber(r[column]) ?? 0)));
}
function sortMark(sort, column) {
  if (!sort || sort.column !== column) return "\u2195";
  return sort.direction === "up" ? "\u2191" : "\u2193";
}
function ariaSort(sort, column) {
  if (!sort || sort.column !== column) return void 0;
  return sort.direction === "up" ? "ascending" : "descending";
}

// src/blocks/tiles/read.ts
var MAX_TILES = 8;
var SUBTITLE_MAX = 300;
var TITLE_FIELDS = ["title", "label", "name", "caption", "text"];
var MORE_FIELDS = ["subtitle", "value", "text", "caption", "note", "description"];
function readTiles(raw, here) {
  const list = firstList([raw.items, raw.tiles]);
  if (!list) return here.drop("tiles needs items");
  const items = [];
  list.forEach((item, i) => {
    const tile = readTile(item);
    if (!tile) {
      here.at("items").at(i).drop("tile has no title");
      return;
    }
    if (actsBeforeTheModel(tile.ask) || actsBeforeTheModel(tile.run)) {
      here.at("items").at(i).drop(NO_SEND);
      return;
    }
    items.push(tile);
  });
  if (!items.length) return here.drop("tiles has no item with a title");
  return { type: "tiles", items: keepFirst(items, MAX_TILES, here, "tiles") };
}
function readTile(item) {
  if (!item || typeof item !== "object") return null;
  const titleField = TITLE_FIELDS.find((f) => str(item[f]) !== void 0);
  if (!titleField) return null;
  const more = [];
  for (const f of MORE_FIELDS) {
    const text = textOrNumber(item[f], Infinity);
    if (f !== titleField && text !== void 0) more.push(text);
  }
  const subtitle = more.length ? cutAtWord(more.join(" \xB7 "), SUBTITLE_MAX) : void 0;
  return clean({
    title: str(item[titleField], 40),
    subtitle,
    image: https(item.image),
    icon: icon(item.icon),
    ask: str(item.ask, 300),
    run: str(item.run, 300)
  });
}

// src/blocks/tiles/Tiles.tsx
import { useContext as useContext11, useState as useState20 } from "react";
import { Fragment as Fragment14, jsx as jsx51, jsxs as jsxs47 } from "react/jsx-runtime";
var WASHES = [1, 4, 8, 3, 6];
function Tiles({ items }) {
  return /* @__PURE__ */ jsx51("div", { className: "hb-tiles", children: items.map((tile, i) => /* @__PURE__ */ jsx51(Tile, { tile, wash: WASHES[i % WASHES.length] }, i)) });
}
function tapOf(tile, send, fill) {
  if (tile.run) return () => send(tile.run);
  if (tile.ask) return () => fill(tile.ask);
  return void 0;
}
function Tile({ tile, wash }) {
  const { send, fill } = useContext11(BlockActions);
  const [photoFailed, setPhotoFailed] = useState20(false);
  const tap = tapOf(tile, send, fill);
  const colour = `var(--hb-chart-${wash})`;
  const content = /* @__PURE__ */ jsxs47(Fragment14, { children: [
    tile.image && !photoFailed && /* @__PURE__ */ jsx51("img", { src: tile.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onError: () => setPhotoFailed(true) }),
    /* @__PURE__ */ jsx51("span", { className: "hb-tile-shade" }),
    tile.icon && /* @__PURE__ */ jsx51("span", { className: "hb-tile-icon", children: /* @__PURE__ */ jsx51(Icon, { name: tile.icon, size: 18, stroke: 2.2 }) }),
    /* @__PURE__ */ jsxs47("span", { className: "hb-tile-text", children: [
      /* @__PURE__ */ jsx51("span", { className: "hb-tile-title", children: tile.title }),
      tile.subtitle && /* @__PURE__ */ jsx51("span", { className: "hb-tile-subtitle", children: tile.subtitle })
    ] })
  ] });
  const style = { background: `linear-gradient(140deg, ${colour}, color-mix(in srgb, ${colour} 55%, #140c24))` };
  return tap ? /* @__PURE__ */ jsx51("button", { type: "button", className: "hb-tile", onClick: tap, title: tile.run, style, children: content }) : /* @__PURE__ */ jsx51("div", { className: "hb-tile hb-tile-static", style, children: content });
}

// src/blocks/timeline/read.ts
var TIME_MAX = 12;
function readTimeline(raw, here) {
  const found = groupsOf(raw, here);
  if (!found) return here.drop("timeline needs groups");
  const groups = [];
  found.forEach(({ group: g, at: at2 }) => {
    const list = firstList([g?.items, g?.events, g?.stops, g?.steps]);
    if (!list) {
      at2.drop("group has no items list");
      return;
    }
    const stops = [];
    list.forEach((it, i) => {
      const stop = readStop(it);
      if (!stop) {
        at2.at("items").at(i).drop("stop has no title");
        return;
      }
      stops.push(stop);
    });
    if (!stops.length) {
      at2.drop("group has no stop with a title");
      return;
    }
    groups.push({ label: str(g.label, 50) ?? "", items: keepFirst(stops, 12, at2, "stops") });
  });
  if (!groups.length) return here.drop("timeline has no group with a stop");
  return clean({ type: "timeline", title: str(raw.title, 60), groups: keepFirst(groups, 14, here, "groups") });
}
function groupsOf(raw, here) {
  if (Array.isArray(raw.groups)) {
    return raw.groups.map((group, gi) => ({ group, at: here.at("groups").at(gi) }));
  }
  const flat = firstList([raw.events, raw.items, raw.steps, raw.stops]);
  if (!flat) return null;
  return [{ group: { label: "", items: flat }, at: here }];
}
function readStop(it) {
  if (!it || typeof it !== "object") return null;
  let title = firstText([it.title, it.name, it.label, it.activity, it.event], 80);
  let time = str(it.time, 60);
  const note = firstWords([it.note, it.text, it.description, it.detail], 160);
  if (!title && time && time.length > TIME_MAX) {
    title = time;
    time = void 0;
  }
  if (!title) return null;
  return clean({ time: time?.slice(0, TIME_MAX), title, place: firstText([it.place, it.location], 60), note, icon: icon(it.icon) });
}

// src/blocks/timeline/Timeline.tsx
import { jsx as jsx52, jsxs as jsxs48 } from "react/jsx-runtime";
function Timeline({ title, groups }) {
  return /* @__PURE__ */ jsxs48("div", { className: "hb-card hb-timeline", children: [
    title && /* @__PURE__ */ jsx52("div", { className: "hb-card-title", children: title }),
    groups.map((g, gi) => /* @__PURE__ */ jsxs48("div", { className: "hb-timeline-group", children: [
      g.label && /* @__PURE__ */ jsx52("span", { className: "hb-chip hb-chip-soft", children: g.label }),
      g.items.map((s, k) => {
        const last = k === g.items.length - 1;
        return /* @__PURE__ */ jsxs48("div", { className: "hb-stop", children: [
          /* @__PURE__ */ jsx52("span", { className: "hb-stop-time", children: s.time ?? "" }),
          /* @__PURE__ */ jsxs48("span", { className: "hb-stop-rail", children: [
            /* @__PURE__ */ jsx52("span", { className: "hb-stop-dot", children: s.icon ? /* @__PURE__ */ jsx52(Icon, { name: s.icon, size: 12, stroke: 2.4 }) : /* @__PURE__ */ jsx52("span", { className: "hb-stop-pip" }) }),
            !last && /* @__PURE__ */ jsx52("span", { className: "hb-stop-line" })
          ] }),
          /* @__PURE__ */ jsxs48("div", { className: last ? "hb-stop-body" : "hb-stop-body hb-stop-body-gap", children: [
            /* @__PURE__ */ jsx52("div", { className: "hb-stop-title", children: s.title }),
            s.place && /* @__PURE__ */ jsxs48("div", { className: "hb-stop-place", children: [
              /* @__PURE__ */ jsx52(Icon, { name: "pin", size: 12, stroke: 2.2 }),
              s.place
            ] }),
            s.note && /* @__PURE__ */ jsx52("div", { className: "hb-stop-note", children: s.note })
          ] })
        ] }, k);
      })
    ] }, gi))
  ] });
}

// src/registry.tsx
import { jsx as jsx53 } from "react/jsx-runtime";
var REGISTRY = {
  chart: { read: readChart, Component: ({ block }) => /* @__PURE__ */ jsx53(Chart, { spec: block.spec }) },
  kpis: { read: readKpis, Component: ({ block }) => /* @__PURE__ */ jsx53(Kpis, { items: block.items }) },
  source: { read: readSource, Component: ({ block }) => /* @__PURE__ */ jsx53(Source, { text: block.text, url: block.url }) },
  timeline: { read: readTimeline, Component: ({ block }) => /* @__PURE__ */ jsx53(Timeline, { ...block }) },
  images: { read: readImages, Component: ({ block }) => /* @__PURE__ */ jsx53(Images, { block }) },
  callout: { read: readCallout, Component: ({ block }) => /* @__PURE__ */ jsx53(Callout, { ...block }) },
  table: { read: readTable, Component: ({ block }) => /* @__PURE__ */ jsx53(Table, { ...block }) },
  list: { read: readList, Component: ({ block }) => /* @__PURE__ */ jsx53(List, { ...block }) },
  progress: { read: readProgress, Component: ({ block }) => /* @__PURE__ */ jsx53(Progress, { ...block }) },
  streak: { read: readStreak, Component: ({ block }) => /* @__PURE__ */ jsx53(Streak, { ...block }) },
  heatmap: { read: readHeatmap, Component: ({ block }) => /* @__PURE__ */ jsx53(Heatmap, { ...block }) },
  flip: { read: readFlip, Component: ({ block }) => /* @__PURE__ */ jsx53(Flip, { ...block }) },
  flow: { read: readFlow, Component: ({ block }) => /* @__PURE__ */ jsx53(Flow, { ...block }) },
  steps: { read: readSteps, Component: ({ block }) => /* @__PURE__ */ jsx53(Steps, { ...block }) },
  layers: { read: readLayers, Component: ({ block }) => /* @__PURE__ */ jsx53(Layers, { ...block }) },
  heading: { read: readHeading, Component: ({ block }) => /* @__PURE__ */ jsx53(Heading, { text: block.text }) },
  text: { read: readText, Component: ({ block }) => /* @__PURE__ */ jsx53(Text, { text: block.text }) },
  stat: { read: readStat, Component: ({ block }) => /* @__PURE__ */ jsx53(KpiCard, { item: block }) },
  divider: { read: readDivider, Component: () => /* @__PURE__ */ jsx53(Divider, {}) },
  badge: { read: readBadge, Component: ({ block }) => /* @__PURE__ */ jsx53(Badge, { ...block }) },
  link: { read: readLink, Component: ({ block }) => /* @__PURE__ */ jsx53(LinkLine, { ...block }) },
  image: { read: readImage, Component: ({ block }) => /* @__PURE__ */ jsx53(Picture, { ...block }) },
  bar: { read: readBar, Component: ({ block }) => /* @__PURE__ */ jsx53(Bar, { ...block }) },
  actions: { read: readActions, Component: ({ block }) => /* @__PURE__ */ jsx53(Actions, { items: block.items }) },
  button: { read: readButton, Component: ({ block }) => /* @__PURE__ */ jsx53(Button, { ...block }) },
  tiles: { read: readTiles, Component: ({ block }) => /* @__PURE__ */ jsx53(Tiles, { items: block.items }) },
  cards: { read: readCards, Component: ({ block }) => /* @__PURE__ */ jsx53(Cards, { ...block }) },
  tasks: { read: readTasks, Component: ({ block }) => /* @__PURE__ */ jsx53(Tasks, { ...block }) },
  result: { read: readResult, Component: ({ block }) => /* @__PURE__ */ jsx53(Result2, { ...block }) },
  suggestions: { read: readSuggestions, Component: ({ block }) => /* @__PURE__ */ jsx53(Suggestions, { ...block }) },
  checklist: { read: readChecklist, Component: ({ block }) => /* @__PURE__ */ jsx53(Checklist, { ...block }) },
  calculator: { read: readCalculator, Component: ({ block }) => /* @__PURE__ */ jsx53(Calculator, { ...block }) },
  simulate: { read: readSimulate, Component: ({ block }) => /* @__PURE__ */ jsx53(Simulate, { ...block }) },
  form: { read: readForm, Component: ({ block }) => /* @__PURE__ */ jsx53(Form, { ...block }) },
  row: { read: readContainer, Component: ({ block, draw }) => /* @__PURE__ */ jsx53(Row, { kinds: block.children.map((c) => c.type), children: draw(block.children) }) },
  section: { read: readContainer, Component: ({ block, draw }) => /* @__PURE__ */ jsx53(Section, { title: block.title, collapsed: block.collapsed, children: draw(block.children) }) },
  grid: { read: readContainer, Component: ({ block, draw }) => /* @__PURE__ */ jsx53(Grid, { children: draw(block.children) }) },
  columns: { read: readContainer, Component: ({ block, draw }) => /* @__PURE__ */ jsx53(Columns, { children: draw(block.children) }) },
  tabs: { read: readTabs, Component: ({ block, draw }) => /* @__PURE__ */ jsx53(Tabs, { labels: block.tabs.map((t) => t.label), panel: (i) => draw(block.tabs[i].children) }) }
};

// src/core/readBlocks.ts
var BLOCK_TYPES = Object.keys(REGISTRY);
function readBlocksNoted(data) {
  let list = data;
  let board;
  let boardText;
  let asOf;
  let live;
  let followUps;
  let boardDensity;
  let boardPalette;
  let boardMotion;
  let boardVersion;
  let boardUpdatedAt;
  let boardLinks;
  const top = new Trail();
  if (isObject(list) && Array.isArray(list.blocks)) {
    if (typeof list.type !== "string") {
      board = align(list.align);
      boardText = align(list.text_align);
      boardDensity = density(list.density);
      boardPalette = palette(list.palette);
      boardMotion = motion(list.motion);
      asOf = str(list.as_of, 80);
      live = typeof list.live === "boolean" ? list.live : void 0;
      followUps = readFollowUps(list.follow_ups, top.at("follow_ups"));
      boardVersion = version(list.version);
      boardUpdatedAt = str(list.updated_at, 40);
      boardLinks = readBoardLinks(list.links, top.at("links"));
    }
    list = list.blocks;
  }
  if (isObject(list) && typeof list.type === "string") list = [list];
  const blocks = [];
  if (Array.isArray(list)) {
    list.forEach((raw, i) => {
      blocks.push(...readOne(raw, top.at(i), 0));
    });
  }
  return {
    blocks,
    dropped: top.dropped,
    align: board,
    textAlign: boardText,
    asOf,
    live,
    followUps,
    density: boardDensity,
    palette: boardPalette,
    motion: boardMotion,
    version: boardVersion,
    updatedAt: boardUpdatedAt,
    links: boardLinks
  };
}
function alignOf(block) {
  return block.align;
}
function textAlignOf(block) {
  return block.text_align;
}
function readFollowUps(value, here) {
  if (!Array.isArray(value)) return void 0;
  const items = [];
  value.forEach((item, i) => {
    const label = firstText([item?.label, item?.text], Infinity);
    const run = firstText([item?.run, item?.ask, item?.message], Infinity);
    if (!label || !run) {
      here.at(i).drop("button needs a label and a run message");
      return;
    }
    if (actsBeforeTheModel(run)) {
      here.at(i).drop(NO_SEND);
      return;
    }
    items.push({ label, run });
  });
  const kept = keepFirst(items, 4, here, "follow-ups");
  return kept.length ? kept : void 0;
}
function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function readBoardLinks(value, here) {
  if (!Array.isArray(value)) return void 0;
  const items = [];
  value.forEach((item, i) => {
    const id = boardId(typeof item === "string" ? item : item?.id);
    if (!id) {
      here.at(i).drop("a link must name a board by its address");
      return;
    }
    const note = typeof item === "object" && item !== null ? str(item.note, 80) : void 0;
    if (note === void 0 && typeof item === "object" && item !== null && "note" in item && item.note !== void 0 && typeof item.note !== "string") here.at(i).drop("the link's note must be one line of text");
    items.push(note ? { id, note } : { id });
  });
  const kept = keepFirst(items, 3, here, "links");
  return kept.length ? kept : void 0;
}
function readOne(raw, here, depth) {
  if (!isObject(raw)) {
    here.drop("not a block object");
    return [];
  }
  const kind = raw.type;
  const entry2 = Object.hasOwn(REGISTRY, kind) ? REGISTRY[kind] : void 0;
  if (!entry2) {
    here.drop(`unknown type "${kind}"`);
    return [];
  }
  const read = entry2.read(raw, here, depth, readOne);
  if (!read) return [];
  const blocks = Array.isArray(read) ? read : [read];
  const asked = align(raw.align);
  if (asked) {
    for (const block of blocks) if (alignOf(block) === void 0) Object.assign(block, { align: asked });
  }
  const askedText = align(raw.text_align);
  if (askedText) {
    for (const block of blocks) if (textAlignOf(block) === void 0) Object.assign(block, { text_align: askedText });
  }
  return blocks;
}

// src/core/provenance.ts
function provenanceOf(blocks, asOf, live) {
  const declared = asOf !== void 0 || live !== void 0;
  if (!declared) return { declared, list: blocks, chartSources: [], asOf, live };
  let list = blocks;
  let source;
  const at2 = blocks.findIndex((b) => b.type === "source");
  if (at2 >= 0) {
    source = blocks[at2];
    list = blocks.filter((_, i) => i !== at2);
  }
  const said = new Set(source ? [source.text] : []);
  const chartSources = [];
  for (const b of list) {
    if (b.type !== "chart") continue;
    const s = b.spec.source;
    if (typeof s === "string" && s.trim() && !said.has(s)) {
      said.add(s);
      chartSources.push(s);
    }
  }
  return { declared, list, source, chartSources, asOf, live };
}
function provenanceLine(p) {
  const parts = [];
  if (p.source) parts.push(p.source.text);
  parts.push(...p.chartSources);
  if (p.asOf) parts.push(`as of ${p.asOf}`);
  if (p.live !== void 0) parts.push(p.live ? "Live" : "Snapshot");
  return parts.join(" \xB7 ");
}

// src/core/FollowUps.tsx
import { useContext as useContext12, useRef as useRef16, useState as useState21 } from "react";
import { jsx as jsx54, jsxs as jsxs49 } from "react/jsx-runtime";
var PENDING_WORD = "Pending\u2026";
function FollowUps({ items, place }) {
  const { send } = useContext12(BlockActions);
  const [said, setSaid] = useState21(null);
  const taps = useRef16(0);
  const cls = ["hb-followups"];
  if (place === "center") cls.push("hb-followups-center");
  if (place === "right") cls.push("hb-followups-right");
  return /* @__PURE__ */ jsxs49("div", { className: cls.join(" "), children: [
    items.map((f, i) => /* @__PURE__ */ jsxs49(
      "button",
      {
        type: "button",
        className: "hb-pill",
        title: f.run,
        onClick: () => {
          const tap = ++taps.current;
          setSaid("pending");
          send(f.run, { force: true }).then((where) => {
            if (tap === taps.current) setSaid(where);
          });
        },
        children: [
          /* @__PURE__ */ jsx54(Icon, { name: "spark", size: 14, stroke: 2.2 }),
          /* @__PURE__ */ jsx54("span", { className: "hb-followup-label", children: f.label })
        ]
      },
      i
    )),
    /* @__PURE__ */ jsx54("span", { className: "hb-followups-said", role: "status", "aria-live": "polite", children: said === "pending" ? PENDING_WORD : said ? SENT_WORDS[said] : "" })
  ] });
}

// src/core/Blocks.tsx
import { jsx as jsx55, jsxs as jsxs50 } from "react/jsx-runtime";
var motionPref = (word) => word === "reduced" ? "reduced" : "full";
var AlignScope = createContext5({ board: void 0, text: void 0 });
var TEXT_BEARING = /* @__PURE__ */ new Set(["heading", "text", "stat", "callout"]);
function BlockView({ block }) {
  const entry2 = REGISTRY[block.type];
  if (!entry2) return null;
  const { Component } = entry2;
  return /* @__PURE__ */ jsx55(Component, { block, draw: drawAll });
}
function Placed({ block, flat }) {
  const parent = useContext13(BlockSlot);
  const slot = parent === null ? flat : `${parent}/${flat}`;
  const { board, text } = useContext13(AlignScope);
  const at2 = alignOf(block) ?? board ?? "left";
  const ta = TEXT_BEARING.has(block.type) ? textAlignOf(block) ?? text ?? "left" : "left";
  const cls = ["hb-place"];
  if (at2 !== "left") cls.push(`hb-place-${at2}`);
  if (ta !== "left") cls.push(`hb-ta-${ta}`);
  if (at2 === "left" && ta === "left") cls.push("hb-bare");
  return /* @__PURE__ */ jsx55(BlockSlot.Provider, { value: slot, children: /* @__PURE__ */ jsx55(
    "div",
    {
      className: cls.join(" "),
      ...at2 !== "left" ? { "data-align": at2 } : {},
      ...ta !== "left" ? { "data-text-align": ta } : {},
      children: /* @__PURE__ */ jsx55(BlockView, { block })
    }
  ) });
}
function blockKey(b, id, occ, carried2) {
  const asked = carriedKey(b);
  if (asked !== void 0) {
    noteMounted(b, asked);
    return asked;
  }
  if (carried2) {
    const fresh = mintKey(b);
    noteMounted(b, fresh);
    return fresh;
  }
  const legacy = `${id}:${occ}`;
  noteMounted(b, legacy);
  return legacy;
}
function drawAll(blocks) {
  const seen = /* @__PURE__ */ new Map();
  const carried2 = blocks.some((b) => carriedKey(b) !== void 0);
  return blocks.map((b) => {
    const id = identityOf(b);
    const occ = seen.get(id) ?? 0;
    seen.set(id, occ + 1);
    return /* @__PURE__ */ jsx55(Placed, { block: b, flat: `${id}:${occ}` }, blockKey(b, id, occ, carried2));
  });
}
function Provenance({ source, chartSources, asOf, live }) {
  const parts = [];
  const add = (key, node) => {
    if (parts.length) parts.push(/* @__PURE__ */ jsx55("span", { className: "hb-provenance-dot", "aria-hidden": "true", children: "\xB7" }, `${key}-dot`));
    parts.push(/* @__PURE__ */ jsx55(Fragment15, { children: node }, key));
  };
  for (const [i, s] of (chartSources ?? []).entries()) {
    add(`chart-${i}`, /* @__PURE__ */ jsx55("span", { className: "hb-provenance-source", children: s }));
  }
  if (asOf) add("as_of", /* @__PURE__ */ jsx55("span", { className: "hb-provenance-time", children: asOf }));
  if (live !== void 0) {
    add("live", /* @__PURE__ */ jsx55("span", { className: "hb-provenance-badge", "data-live": live ? "live" : "snapshot", children: live ? "Live" : "Snapshot" }));
  }
  return /* @__PURE__ */ jsxs50("div", { className: "hb-provenance", children: [
    source && /* @__PURE__ */ jsx55(Placed, { block: source, flat: `${identityOf(source)}:0` }),
    /* @__PURE__ */ jsx55("div", { className: "hb-provenance-line", children: parts })
  ] });
}
function Blocks({
  blocks,
  boardAlign,
  boardTextAlign,
  boardAsOf,
  boardLive,
  boardFollowUps,
  boardDensity,
  boardPalette,
  boardMotion
}) {
  const { declared, list, source, chartSources } = provenanceOf(blocks, boardAsOf, boardLive);
  const look = {};
  if (boardDensity === "compact") look["data-density"] = "compact";
  if (boardPalette === "cool" || boardPalette === "warm") look["data-palette"] = boardPalette;
  if (boardMotion === "reduced") look["data-motion"] = "reduced";
  return /* @__PURE__ */ jsx55(AlignScope.Provider, { value: { board: boardAlign, text: boardTextAlign }, children: /* @__PURE__ */ jsx55(MotionScope.Provider, { value: motionPref(boardMotion), children: /* @__PURE__ */ jsxs50("div", { className: "hb-blocks", ...look, children: [
    /* @__PURE__ */ jsx55(FlowLightBoard, { children: drawAll(list) }),
    declared && /* @__PURE__ */ jsx55(Provenance, { source, chartSources, asOf: boardAsOf, live: boardLive }),
    !!boardFollowUps?.length && /* @__PURE__ */ jsx55(FollowUps, { items: boardFollowUps, place: boardAlign })
  ] }) }) });
}

// src/core/boardRoster.ts
var entries = /* @__PURE__ */ new Map();
function entry(id) {
  let e = entries.get(id);
  if (!e) entries.set(id, e = { owner: null, pointers: [], meta: {}, listeners: /* @__PURE__ */ new Set(), pokers: /* @__PURE__ */ new Set() });
  return e;
}
function shout(e) {
  for (const cb of e.listeners) cb();
}
function claim(id, token) {
  const e = entry(id);
  if (e.owner === token) return true;
  if (e.pointers.includes(token)) return false;
  if (e.owner === null) {
    e.owner = token;
    shout(e);
    return true;
  }
  e.pointers.push(token);
  return false;
}
function release(id, token) {
  const e = entries.get(id);
  if (e !== void 0) {
    if (e.owner === token) {
      e.owner = e.pointers.shift() ?? null;
      shout(e);
    } else {
      const at2 = e.pointers.indexOf(token);
      if (at2 >= 0) e.pointers.splice(at2, 1);
    }
    if (e.owner === null && e.pointers.length === 0 && e.listeners.size === 0 && e.pokers.size === 0) {
      entries.delete(id);
      return true;
    }
  }
  return !occupied(id);
}
function occupied(id) {
  const e = entries.get(id);
  return e !== void 0 && (e.owner !== null || e.pointers.length > 0);
}
function owns(id, token) {
  const e = entries.get(id);
  return !!e && e.owner === token;
}
function listed(id, token) {
  const e = entries.get(id);
  return !!e && (e.owner === token || e.pointers.includes(token));
}
function setMeta(id, meta) {
  const e = entry(id);
  const same = e.meta.version === meta.version && e.meta.updatedAt === meta.updatedAt;
  e.meta = meta;
  if (!same) shout(e);
}
function getMeta(id) {
  return entry(id).meta;
}
function poke(id) {
  const e = entries.get(id);
  if (e && e.owner !== null) for (const cb of e.pokers) cb();
}
function onPoke(id, cb) {
  const e = entry(id);
  e.pokers.add(cb);
  return () => {
    e.pokers.delete(cb);
    if (e.owner === null && e.pointers.length === 0 && e.listeners.size === 0 && e.pokers.size === 0) {
      entries.delete(id);
    }
  };
}
function subscribe(id, cb) {
  const e = entry(id);
  e.listeners.add(cb);
  return () => {
    e.listeners.delete(cb);
    if (e.owner === null && e.pointers.length === 0 && e.listeners.size === 0 && e.pokers.size === 0) {
      entries.delete(id);
    }
  };
}

// src/core/LivingBoards.tsx
import { useContext as useContext14, useEffect as useEffect9, useState as useState22 } from "react";
import { jsx as jsx56, jsxs as jsxs51 } from "react/jsx-runtime";
var HISTORY_SHOWN = 4;
function LiveRow({ id, version: version2, updatedAt, links, viewing, onShow, canReach }) {
  const older = version2 != null ? Array.from({ length: Math.min(version2 - 1, HISTORY_SHOWN) }, (_, i) => version2 - 1 - i) : [];
  return /* @__PURE__ */ jsxs51("div", { className: "hb-live", "data-board": id, children: [
    /* @__PURE__ */ jsxs51("div", { className: "hb-live-line", children: [
      /* @__PURE__ */ jsx56("span", { className: "hb-live-mark", "aria-hidden": "true", children: "\u21BB" }),
      version2 != null && /* @__PURE__ */ jsx56("span", { className: "hb-live-version", children: viewing === null ? `v${version2}` : `viewing v${viewing}` }),
      updatedAt && viewing === null && /* @__PURE__ */ jsx56("span", { className: "hb-live-when", children: updatedAt.slice(0, 10) }),
      /* @__PURE__ */ jsxs51("code", { className: "hb-live-addr", children: [
        "#",
        id
      ] }),
      canReach && older.map((n) => /* @__PURE__ */ jsxs51(
        "button",
        {
          type: "button",
          className: "hb-live-history",
          "aria-pressed": viewing === n,
          onClick: () => onShow(viewing === n ? null : n),
          children: [
            "v",
            n,
            " \u21A9"
          ]
        },
        n
      )),
      viewing !== null && /* @__PURE__ */ jsx56("button", { type: "button", className: "hb-live-back", onClick: () => onShow(null), children: "current" })
    ] }),
    !!links?.length && /* @__PURE__ */ jsxs51("div", { className: "hb-links", children: [
      /* @__PURE__ */ jsx56("span", { className: "hb-links-label", children: "linked across time \xB7 AI-suggested" }),
      links.map((l) => /* @__PURE__ */ jsx56(LinkChip, { link: l }, l.id))
    ] })
  ] });
}
function LinkChip({ link }) {
  const [open, setOpen] = useState22(false);
  return /* @__PURE__ */ jsxs51("div", { className: "hb-link", children: [
    /* @__PURE__ */ jsx56(
      "button",
      {
        type: "button",
        className: "hb-link-chip",
        "aria-expanded": open,
        title: link.note ? `${link.note} \u2014 board #${link.id}` : `board #${link.id}`,
        onClick: () => setOpen((o) => !o),
        children: link.note ?? `#${link.id}`
      }
    ),
    open && /* @__PURE__ */ jsx56(LinkedBoard, { link })
  ] });
}
function LinkedBoard({ link }) {
  const actions = useContext14(BlockActions);
  const rest = actions.rest;
  const [board, setBoard] = useState22("loading");
  useEffect9(() => {
    if (!rest) {
      setBoard(null);
      return;
    }
    let live = true;
    rest(`/blocks/${link.id}`).then((data) => {
      const noted = readBlocksNoted(data);
      if ((noted.version ?? 0) >= 2) markLiving(link.id);
      if (live) setBoard(noted.blocks.length ? noted : null);
    }).catch(() => {
      if (live) setBoard(null);
    });
    return () => {
      live = false;
    };
  }, [link.id, rest]);
  if (board === "loading") {
    return /* @__PURE__ */ jsxs51("div", { className: "hb-linked hb-linked-loading", children: [
      "Fetching #",
      link.id,
      " from the store\u2026"
    ] });
  }
  if (!board) {
    return /* @__PURE__ */ jsxs51("div", { className: "hb-linked hb-linked-gone", children: [
      "#",
      link.id,
      " is not a board on this machine."
    ] });
  }
  return /* @__PURE__ */ jsxs51("div", { className: "hb-linked", "data-linked": link.id, children: [
    /* @__PURE__ */ jsxs51("div", { className: "hb-linked-head", children: [
      /* @__PURE__ */ jsx56("span", { "aria-hidden": "true", children: "\u25C8" }),
      /* @__PURE__ */ jsx56("span", { children: link.note ? link.note : "linked board" }),
      /* @__PURE__ */ jsxs51("code", { children: [
        "#",
        link.id
      ] })
    ] }),
    /* @__PURE__ */ jsx56(BlockActions.Provider, { value: { ...actions, blockId: link.id }, children: /* @__PURE__ */ jsx56(
      Blocks,
      {
        blocks: board.blocks,
        boardAlign: board.align,
        boardTextAlign: board.textAlign,
        boardAsOf: board.asOf,
        boardLive: board.live,
        boardFollowUps: board.followUps,
        boardDensity: board.density,
        boardPalette: board.palette,
        boardMotion: board.motion
      }
    ) })
  ] });
}
function LivePointer({ id, address }) {
  const meta = getMeta(address);
  return /* @__PURE__ */ jsxs51("div", { className: "hb-tag hb-live-pointer", "data-pointer": id, children: [
    /* @__PURE__ */ jsx56("span", { className: "hb-live-mark", "aria-hidden": "true", children: "\u21BB" }),
    /* @__PURE__ */ jsxs51("span", { children: [
      "The same live board",
      meta.version ? ` \xB7 v${meta.version}` : "",
      " \u2014 its live view is where its first tag stands above."
    ] }),
    /* @__PURE__ */ jsxs51("code", { className: "hb-live-addr", children: [
      "#",
      id
    ] })
  ] });
}

// src/host/ExportChrome.tsx
import { useContext as useContext15, useEffect as useEffect10, useLayoutEffect as useLayoutEffect4, useRef as useRef17, useState as useState23 } from "react";

// src/lib/csv.ts
function csvCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
function csvOf(headers, rows2) {
  return [headers, ...rows2].map((line) => line.map(csvCell).join(",") + "\r\n").join("");
}

// src/lib/export.ts
var PNG_SCALE = 2;
var PNG_PAD = 14;
var LINE_RATIO = 1.4;
var LINE_GAP = 6;
var SWATCH = 12;
var SWATCH_GAP = 6;
var MINUS = "\u2013";
function measureLine(line) {
  return line.swatch ? SWATCH + SWATCH_GAP : 0;
}
function pngMetrics(lines, measure, svgWidth, svgHeight) {
  const textWidth2 = lines.reduce((widest, l) => Math.max(widest, measure(l) + measureLine(l)), 0);
  const textHeight = lines.length ? lines.reduce((h, l) => h + l.size * LINE_RATIO, 0) + (lines.length - 1) * LINE_GAP : 0;
  return {
    width: Math.round(Math.max(svgWidth, textWidth2)) + PNG_PAD * 2,
    height: Math.round(svgHeight + textHeight) + PNG_PAD * 2
  };
}
function fontOf(cs) {
  const size = Number.parseFloat(cs.fontSize) || 14;
  const parts = [cs.fontStyle !== "normal" ? cs.fontStyle : "", cs.fontWeight, `${size}px`, cs.fontFamily];
  return { font: parts.filter(Boolean).join(" "), size };
}
function captionLines(figure2, provenance = "") {
  const out = [];
  const line = (el, text, swatch) => {
    if (!el || !text.trim()) return;
    const cs = getComputedStyle(el);
    const { font, size } = fontOf(cs);
    out.push({ text, font, colour: cs.color, size, ...swatch ? { swatch } : {} });
  };
  const title = figure2.querySelector(".hb-chart-title");
  line(title, title?.textContent?.trim() ?? "");
  const figureEl = figure2.querySelector(".hb-chart-figure");
  line(figureEl, (figureEl?.textContent ?? "").trim());
  for (const item of figure2.querySelectorAll(".hb-legend-item")) {
    const swatch = item.querySelector(".hb-legend-dot");
    const words = [...item.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE || n.classList?.contains("hb-legend-value") || n.classList?.contains("hb-legend-note")).map((n) => (n.textContent ?? "").trim()).filter(Boolean).join(" ");
    line(item, words, swatch ? getComputedStyle(swatch).backgroundColor : void 0);
  }
  for (const row of figure2.querySelectorAll(".hb-pie-legend tr")) {
    if (!row.querySelector(".hb-pie-swatch")) continue;
    const sw = row.querySelector(".hb-pie-swatch i");
    const words = [...row.querySelectorAll("td")].filter((td) => !td.classList.contains("hb-pie-swatch")).map((td) => (td.textContent ?? "").trim()).filter(Boolean).join(" ");
    line(row, words, sw ? getComputedStyle(sw).backgroundColor : void 0);
  }
  const source = figure2.querySelector(".hb-chart-source");
  line(source, source?.textContent?.trim() ?? "");
  if (provenance.trim() && provenance.trim() !== (source?.textContent?.trim() ?? "")) {
    const styleEl = source ?? figure2;
    const cs = getComputedStyle(styleEl);
    const { font, size } = fontOf(cs);
    out.push({ text: provenance.trim(), font, colour: cs.color, size });
  }
  return out;
}
var RGB = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/;
var TRANSPARENT = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/;
function parseColour(value) {
  const m = RGB.exec(value);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === void 0 ? 1 : Number(m[4])];
}
function over(fg, bg) {
  const a = fg[3];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a))
  ];
}
function opaqueBackdrop(el) {
  const layers = [];
  let base = [255, 255, 255];
  for (let node = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const value = cs.backgroundColor;
    if (value && value !== "transparent" && !TRANSPARENT.test(value)) {
      const rgb = parseColour(value);
      if (!rgb) continue;
      if (rgb[3] >= 1) {
        base = [rgb[0], rgb[1], rgb[2]];
        break;
      }
      layers.push(rgb);
    }
  }
  let out = base;
  for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
  return out;
}
var SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';
function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function hbarSvg(figure2, spec) {
  const box = figure2.querySelector(".hb-hbar-box");
  const grid = box?.querySelector(".hb-hbar-grid");
  if (!box || !grid) return null;
  const rows2 = spec.x.map(String);
  const labelEls = [...grid.querySelectorAll(".hb-hbar-label")];
  const trackEls = [...grid.querySelectorAll(".hb-hbar-tracks")];
  const valueEls = [...grid.querySelectorAll(".hb-hbar-values")];
  if (!labelEls.length || labelEls.length !== rows2.length || trackEls.length !== rows2.length || valueEls.length !== rows2.length) return null;
  const base = box.getBoundingClientRect();
  if (base.width < 2 || base.height < 2) return null;
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  };
  const TRANSPARENT_PAINT = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/;
  const pictureW = Math.ceil(base.width);
  const pictureH = Math.ceil(base.height);
  const fit = (r) => {
    const x = Math.max(r.x, 0);
    const y = Math.max(r.y, 0);
    return { x, y, w: Math.max(Math.min(r.x + r.w, pictureW) - x, 1), h: Math.max(Math.min(r.y + r.h, pictureH) - y, 1) };
  };
  const sample = (el) => {
    if (!el) return "";
    const value = getComputedStyle(el).backgroundColor;
    return value && value !== "transparent" && !TRANSPARENT_PAINT.test(value) && !TRANSPARENT.test(value) ? value : "";
  };
  const look = (el, fallback) => {
    const cs = getComputedStyle(el);
    return {
      family: (cs.fontFamily || "sans-serif").replaceAll('"', "'"),
      size: cs.fontSize || "12px",
      ink: cs.color || fallback
    };
  };
  const parts = [];
  rows2.forEach((_row, i) => {
    const lr = rel(labelEls[i]);
    const lf = look(labelEls[i], "#222");
    const labelWord = (labelEls[i].textContent ?? "").trim() || rows2[i];
    parts.push(`<text data-label="${i}" x="${lr.x.toFixed(1)}" y="${(lr.y + lr.h / 2).toFixed(1)}" dominant-baseline="central" font-family="${esc(lf.family)}" font-size="${esc(lf.size)}" fill="${esc(lf.ink)}">${esc(labelWord)}</text>`);
    const tracks = [...trackEls[i].querySelectorAll(".hb-hbar-track")];
    tracks.forEach((track, k) => {
      const zero = track.querySelector(".hb-hbar-zero");
      if (zero) {
        const zr = fit(rel(zero));
        parts.push(`<rect data-zero="${i}:${k}" x="${zr.x.toFixed(1)}" y="${zr.y.toFixed(1)}" width="${zr.w.toFixed(1)}" height="${zr.h.toFixed(1)}" fill="${esc(sample(zero) || "#999")}"/>`);
      }
      const bar = track.querySelector(".hb-hbar-bar");
      if (!bar) return;
      const br = fit(rel(bar));
      parts.push(`<rect data-bar="${i}:${k}" x="${br.x.toFixed(1)}" y="${br.y.toFixed(1)}" width="${br.w.toFixed(1)}" height="${br.h.toFixed(1)}" rx="3" fill="${esc(sample(bar) || "#888")}"/>`);
    });
    const spans = [...valueEls[i].querySelectorAll("span")];
    spans.forEach((span, k) => {
      const vr = rel(span);
      const vf = look(span, "#222");
      const word = (span.textContent ?? "").trim() || MINUS;
      parts.push(`<text data-word="${i}:${k}" x="${(vr.x + vr.w).toFixed(1)}" y="${(vr.y + vr.h / 2).toFixed(1)}" text-anchor="end" dominant-baseline="central" font-family="${esc(vf.family)}" font-size="${esc(vf.size)}" fill="${esc(vf.ink)}">${esc(word)}</text>`);
    });
  });
  return { width: pictureW, height: pictureH, body: parts.join("") };
}
var PAINT = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "paint-order",
  "vector-effect"
];
function serializeSvg(svg) {
  const clone = svg.cloneNode(true);
  const sources = [svg, ...svg.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  const box = svg.getBoundingClientRect();
  const px = (which, view) => {
    if (view > 0) return String(Math.round(view));
    const attr = (svg.getAttribute(which) ?? "").trim();
    const stated = Number.parseFloat(attr);
    if (attr && !attr.endsWith("%") && Number.isFinite(stated) && stated > 0) return String(Math.round(stated));
    const vb = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4) {
      const side = vb[which === "width" ? 2 : 3];
      if (Number.isFinite(side) && side > 0) return String(Math.round(side));
    }
    return "640";
  };
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", px("width", box.width));
  clone.setAttribute("height", px("height", box.height));
  for (const [i, src] of sources.entries()) {
    const dst = copies[i];
    if (!dst) continue;
    const cs = getComputedStyle(src);
    if (cs.display === "none" || cs.visibility === "hidden") {
      dst.remove();
      continue;
    }
    for (const prop of PAINT) {
      const value = cs.getPropertyValue(prop);
      if (value) dst.style.setProperty(prop, value);
    }
  }
  return new XMLSerializer().serializeToString(clone);
}
async function loadImage(src) {
  const url = URL.createObjectURL(new Blob([src], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function canvasPng(canvas) {
  return new Promise((done) => canvas.toBlob((blob) => done(blob), "image/png"));
}
async function chartPng(figure2, opts = {}) {
  const svg = figure2.querySelector("svg");
  let svgWidth = 0;
  let svgHeight = 0;
  let document_;
  if (svg) {
    const box = svg.getBoundingClientRect();
    const stated = (which) => {
      const raw = Number.parseFloat(svg.getAttribute(which) ?? "");
      return Number.isFinite(raw) && raw > 0 ? raw : 640;
    };
    svgWidth = Math.round(box.width || stated("width"));
    svgHeight = Math.round(box.height || stated("height"));
    document_ = serializeSvg(svg);
  } else if (opts.spec) {
    const picture = hbarSvg(figure2, opts.spec);
    if (!picture) return null;
    svgWidth = Math.round(picture.width);
    svgHeight = Math.round(picture.height);
    document_ = `<svg ${SVG_NS} width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">` + picture.body + "</svg>";
  } else {
    return null;
  }
  const lines = captionLines(figure2, opts.provenance ?? "");
  const probe = document.createElement("canvas").getContext("2d");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!probe || !ctx) return null;
  const measure = (l) => {
    probe.font = l.font;
    return probe.measureText(l.text).width;
  };
  const { width, height } = pngMetrics(lines, measure, svgWidth, svgHeight);
  const img = await loadImage(document_);
  if (!img) return null;
  canvas.width = Math.round(width * PNG_SCALE);
  canvas.height = Math.round(height * PNG_SCALE);
  ctx.scale(PNG_SCALE, PNG_SCALE);
  const [r, g, b] = opaqueBackdrop(figure2);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, width, height);
  const textHeight = lines.reduce((h, l) => h + l.size * LINE_RATIO, 0) + (lines.length ? (lines.length - 1) * LINE_GAP : 0);
  let y = PNG_PAD;
  ctx.textBaseline = "top";
  for (const l of lines) {
    if (l.swatch) {
      ctx.fillStyle = l.swatch;
      ctx.fillRect(PNG_PAD, y + Math.max(0, (l.size * LINE_RATIO - SWATCH) / 2), SWATCH, SWATCH);
    }
    ctx.font = l.font;
    ctx.fillStyle = l.colour;
    ctx.fillText(l.text, PNG_PAD + measureLine(l), y);
    y += l.size * LINE_RATIO + LINE_GAP;
  }
  ctx.drawImage(img, PNG_PAD, PNG_PAD + textHeight, svgWidth, svgHeight);
  return canvasPng(canvas);
}
function csvBlob(columns, rows2, provenance = "") {
  const head = provenance.trim() ? `# ${provenance.trim()}\r
` : "";
  return new Blob([`\uFEFF${head}${csvOf(columns, rows2)}`], { type: "text/csv;charset=utf-8" });
}
function markdownFile(body, provenance) {
  const parts = [];
  const head = body.trimEnd();
  const footer = provenanceText(provenance);
  if (head) parts.push(head);
  if (footer) parts.push(`---

${footer}`);
  return `${parts.join("\n\n")}
`;
}
function provenanceText(p) {
  const parts = [];
  if (p.source) parts.push(p.source.text);
  parts.push(...p.chartSources);
  if (p.asOf) parts.push(`as of ${p.asOf}`);
  if (p.live !== void 0) parts.push(p.live ? "Live" : "Snapshot");
  return parts.join(" \xB7 ");
}
function jsonFile(stored2) {
  return `${JSON.stringify(stored2, null, 2)}
`;
}
function fileBase(name, fallback) {
  const slug2 = (name ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]+/g, "").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return slug2 || fallback;
}
function chartFileBase(figure2) {
  return fileBase(figure2.querySelector(".hb-chart-title")?.textContent ?? "", "chart");
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6e4);
}

// src/lib/markdown.ts
var MAX_DEPTH2 = 6;
var MAX_STRING = 300;
var MAX_URL = 500;
var MAX_CELL = 80;
var CONTROL = new RegExp("[\\x00-\\x08\\x0b-\\x1f\\x7f-\\x9f\\u200b\\u200c\\u200e\\u200f\\u202a-\\u202e\\u2060-\\u2064\\u2066-\\u2069\\ufeff]", "g");
var CONTROL_TEST = new RegExp(CONTROL.source);
var LAYOUT_TYPES = ["row", "section", "grid", "columns", "tabs"];
function isNum(v) {
  return typeof v === "number";
}
function isStr(v) {
  return typeof v === "string";
}
function isDict(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isList(v) {
  return Array.isArray(v);
}
function firstList2(block, ...keys) {
  for (const k of keys) if (isList(block[k])) return block[k];
  return [];
}
function firstOf(block, ...keys) {
  for (const k of keys) {
    const t = safeText(block[k]);
    if (t) return t;
  }
  return "";
}
function orField(block, first, second) {
  const v = block[first];
  if (isPyFalsy(v)) return block[second];
  return v;
}
function isPyFalsy(v) {
  if (v === null || v === void 0 || v === false || v === "" || v === 0 || typeof v === "number" && Number.isNaN(v)) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isDict(v)) return Object.keys(v).length === 0;
  return false;
}
function pick(block, key, dflt) {
  return key in block ? block[key] : dflt;
}
function fmtNum(v) {
  if (!Number.isFinite(v)) return "";
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return groupInt(v);
  if (Math.abs(v) >= 1) return fixed2(v);
  return g3(v);
}
function fixed2(v) {
  const s = roundHalfEven(v, 2).toFixed(2);
  const [intPart, fracPart] = s.split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  let frac = fracPart;
  while (frac.endsWith("0")) frac = frac.slice(0, -1);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${frac ? `.${frac}` : ""}`;
}
function g3(v) {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  let e = Math.floor(Math.log10(a));
  let m = a / 10 ** e;
  if (m >= 10) {
    m /= 10;
    e += 1;
  } else if (m < 1) {
    m *= 10;
    e -= 1;
  }
  let rm = roundHalfEven(m, 2);
  if (rm >= 10) {
    rm /= 10;
    e += 1;
  }
  const digits = String(rm).replace(".", "").replace(/0+$/, "") || "0";
  if (e < -4) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${mant}e-${String(-e).padStart(2, "0")}`;
  }
  if (e < 0) return `${sign}0.${"0".repeat(-e - 1)}${digits}`;
  return `${sign}${digits}${"0".repeat(e)}`;
}
function groupInt(v) {
  const sign = v < 0 ? "-" : "";
  const digits = String(Math.abs(Math.trunc(v)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function roundHalfEven(x, digits) {
  if (!Number.isFinite(x)) return x;
  if (digits < 0) {
    const shifted = roundHalfEven(x / 10 ** -digits, 0);
    return shifted * 10 ** -digits;
  }
  if (Number.isInteger(x)) return x;
  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = Math.abs(x);
  const bits = new DataView(buf).getBigUint64(0, true);
  let m = Number(bits & 2n ** 52n - 1n);
  let e = (Number(bits >> 52n) & 2047) - 1075;
  if (bits >> 52n === 0n) e = -50;
  else m += 2 ** 52;
  const num2 = BigInt(m) * 10n ** BigInt(digits);
  const den = 1n << BigInt(-e);
  const floor = num2 / den;
  const rem = num2 % den;
  const half = den >> 1n;
  const up = rem > half || rem === half && floor % 2n !== 0n;
  const n = up ? floor + 1n : floor;
  const v = Number(n) / 10 ** digits;
  return x < 0 ? -v : v;
}
var MARKDOWN_MARKS = /([\\\[\]<>])/g;
function mdEscape(text) {
  return text.replace(MARKDOWN_MARKS, "\\$1");
}
function safeText(value, limit = MAX_STRING, inline = true) {
  if (isNum(value)) return fmtNum(value);
  if (!isStr(value)) return "";
  let text = value.replace(CONTROL, "").replaceAll("	", " ");
  if (inline) text = text.replaceAll("\n", " ");
  text = text.trim();
  return mdEscape(text.length <= limit ? text : `${text.slice(0, limit - 1)}\u2026`);
}
function safeUrl(value, httpsOnly = false) {
  if (!isStr(value)) return "";
  let url = value.replace(CONTROL, "").trim();
  if (url.length > MAX_URL) return "";
  const lower = url.toLowerCase();
  if (!(httpsOnly ? lower.startsWith("https://") : lower.startsWith("https://") || lower.startsWith("http://"))) return "";
  for (const [raw, safe] of [[" ", "%20"], ["(", "%28"], [")", "%29"], ["<", "%3C"], [">", "%3E"], ["\n", ""]]) {
    url = url.split(raw).join(safe);
  }
  return url;
}
function mdLink(text, url) {
  return url ? `[${text}](${url})` : text;
}
function withUnit(value, unit) {
  if (!unit) return value;
  return unit === "%" ? `${value}${unit}` : `${value} ${unit}`;
}
function changeChip(change, unit = "%") {
  if (!isNum(change)) return "";
  const arrow = change < 0 ? "\u25BC" : "\u25B2";
  return `(${arrow} ${fmtNum(Math.abs(change))}${safeText(unit, 8) || "%"})`;
}
function outOf(label, value, goal, unit) {
  if (!label || !isNum(value) || !isNum(goal)) return "";
  return `${label}: ${fmtNum(value)} / ${withUnit(fmtNum(goal), safeText(unit, 20))}`;
}
function tableCell(value) {
  return safeText(value, MAX_CELL).replaceAll("|", "\\|");
}
function mdTable(header, rows2) {
  const width = header.length;
  const lines = ["| " + header.join(" | ") + " |", "| " + Array(width).fill("---").join(" | ") + " |"];
  for (const row of rows2) {
    lines.push("| " + [...row, ...Array(Math.max(0, width - row.length)).fill("")].slice(0, width).join(" | ") + " |");
  }
  return lines;
}
function childLists(block) {
  if (!isDict(block)) return [];
  if (isList(block.children)) return [block.children];
  if (block.type !== "tabs" || !isList(block.tabs)) return [];
  const out = [];
  for (const tab of block.tabs) {
    if (isDict(tab) && isList(tab.children)) out.push(tab.children);
  }
  return out;
}
function flowLabels(blocks, depth = 0) {
  let found = {};
  if (depth > MAX_DEPTH2) return found;
  for (const block of blocks) {
    if (!isDict(block)) continue;
    if (block.type === "flow" && isStr(block.id) && isList(block.nodes)) {
      const nodes = block.nodes.filter(isDict);
      const map = {};
      for (const n of nodes) if (isStr(n.id) && isStr(n.label)) map[n.id] = n.label;
      found[block.id] = map;
    }
    for (const children of childLists(block)) {
      const deeper = flowLabels(children, depth + 1);
      found = { ...deeper, ...found };
    }
  }
  return found;
}
var F = (v) => isDict(v) ? v : {};
var IMAGE_URL_FIELDS = ["url", "src", "image"];
function textHeading(block) {
  const text = safeText(block.text);
  return text ? `**${text}**` : "";
}
function textText(block) {
  return safeText(block.text, MAX_STRING, false);
}
function textDivider() {
  return "---";
}
function textBadge(block) {
  const text = firstOf(block, "text", "label");
  return text ? `[${text}]` : "";
}
function textLink(block) {
  const text = firstOf(block, "text", "label");
  const url = safeUrl(orField(block, "url", "href"), true);
  return mdLink(text || mdEscape(url), url);
}
function textImage(block) {
  let url = "";
  for (const k of IMAGE_URL_FIELDS) {
    url = safeUrl(block[k]);
    if (url) break;
  }
  const caption = firstOf(block, "caption", "alt", "title");
  if (!url) return caption;
  return `![${caption || "image"}](${url})`;
}
function textBar(block) {
  return outOf(firstOf(block, "label", "title"), block.value, pick(block, "max", 100), block.unit);
}
function textCallout(block) {
  const title = safeText(block.title);
  const text = safeText(block.text, MAX_STRING, false);
  const lines = (title ? [`**${title}**`] : []).concat(text.split("\n").filter((l) => l.trim()));
  return lines.map((l) => `> ${l}`).join("\n");
}
function textSource(block) {
  const text = safeText(block.text);
  return text ? `_Source: ${mdLink(text, safeUrl(block.url))}_` : "";
}
var MAX_TABLE_ROWS = 12;
function textTable(block) {
  const names = block.columns, rows2 = block.rows;
  if (!isList(names) || !names.length || !isList(rows2) || !rows2.length) return "";
  const headerNames = names.slice(0, 8);
  const columns = headerNames.map(tableCell);
  const cells = [];
  for (const row of rows2.slice(0, MAX_TABLE_ROWS)) {
    if (isDict(row)) {
      cells.push(headerNames.map((name) => isStr(name) ? tableCell(row[name]) : ""));
    } else if (isList(row)) {
      cells.push(row.map(tableCell));
    }
  }
  const caption = safeText(orField(block, "caption", "title"));
  const lines = (caption ? [`**${caption}**`] : []).concat(mdTable(columns, cells));
  if (rows2.length > MAX_TABLE_ROWS) lines.push(`_(${rows2.length - MAX_TABLE_ROWS} more rows)_`);
  return lines.join("\n");
}
function textListBlock(block) {
  const items = firstList2(block, "items", "rows");
  const lines = [];
  for (const item of items.slice(0, 12)) {
    const row = isStr(item) ? { title: item } : item;
    const name = isDict(row) ? firstOf(row, "title", "name", "label", "text") : "";
    if (!name) continue;
    const r = F(row);
    const subtitle = safeText(r.subtitle);
    const value = safeText(r.value, 40);
    const mark = block.ranked ? `${lines.length + 1}.` : "-";
    lines.push(`${mark} ${name}${subtitle ? ` \u2014 ${subtitle}` : ""}${value ? ` \xB7 ${value}` : ""}`);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}
function textChecklist(block) {
  const items = isList(block.items) ? block.items : [];
  const lines = [];
  for (const item of items.slice(0, 40)) {
    const text = safeText(isDict(item) ? item.text : item);
    if (text) lines.push(`- [ ] ${text}`);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}
function textTiles(block) {
  const items = isList(block.items) ? block.items : [];
  const lines = [];
  for (const item of items.slice(0, 8)) {
    const t = isDict(item) ? safeText(item.title) : "";
    const subtitle = t ? safeText(F(item).subtitle) : "";
    if (t) lines.push(subtitle ? `- ${t}: ${subtitle}` : `- ${t}`);
  }
  return lines.join("\n");
}
function textStreak(block) {
  const count = block.count;
  if (!isNum(count)) return "";
  const label = safeText(block.label) || "Current streak";
  return `${label}: ${fmtNum(count)} ${safeText(block.unit, 20) || "days"}`;
}
function textProgress(block) {
  return outOf(firstOf(block, "title", "label"), block.value, block.goal, block.unit);
}
function figure(item) {
  const label = firstOf(item, "label", "title");
  const value = safeText(item.value);
  if (!label || !value) return "";
  const line = `${label}: ${withUnit(value, safeText(item.unit, 20))}`;
  const chip = changeChip(item.change, pick(item, "change_unit", "%"));
  return chip ? `${line} ${chip}` : line;
}
function textStat(block) {
  return figure(block);
}
function textKpis(block) {
  const items = isList(block.items) ? block.items : [];
  return items.filter(isDict).map(figure).filter(Boolean).join("\n");
}
var CHART_KINDS2 = ["line", "bar", "area", "stacked", "hbar", "combo", "pie", "donut", "scatter", "histogram"];
var KIND_ALIASES2 = {
  doughnut: "donut",
  stackedbar: "stacked",
  horizontalbar: "hbar",
  barh: "hbar",
  hist: "histogram"
};
function chartKind2(name) {
  if (!isStr(name)) return "line";
  const plain = name.toLowerCase().replace(/[ _-]/g, "");
  return CHART_KINDS2.includes(plain) ? plain : Object.hasOwn(KIND_ALIASES2, plain) ? KIND_ALIASES2[plain] : "line";
}
function seriesLine(series) {
  const data = dataOf(series).filter(isNum);
  if (!data.length) return "";
  const name = safeText(series.name);
  const first = data[0], last = data[data.length - 1];
  let line = `${name} ${fmtNum(first)} \u2192 ${fmtNum(last)}`.trim();
  if (first) line += " " + changeChip(roundHalfEven((last - first) / Math.abs(first) * 100, 1));
  return line;
}
function slices(x, series, top = 4) {
  const data = dataOf(series);
  const parts = [];
  for (let i = 0; i < Math.min(x.length, data.length); i++) {
    const v = data[i];
    if (isNum(v) && v > 0) parts.push([safeText(x[i]), v]);
  }
  const total = parts.reduce((s, [, v]) => s + v, 0);
  if (!total) return "";
  parts.sort((a, b) => b[1] - a[1]);
  const shown = parts.slice(0, top).map(([label, v]) => `${label} ${roundHalfEven(v / total * 100, 0)}`.trim() + "%");
  if (parts.length > top) shown.push(`+${parts.length - top} more`);
  return shown.join(", ");
}
function pointsLine(series) {
  const data = dataOf(series).filter(isNum);
  if (!data.length) return "";
  const name = safeText(series.name);
  const line = name ? `${name} ` : "";
  return `${line}${data.length} points, y ${fmtNum(Math.min(...data))} \u2192 ${fmtNum(Math.max(...data))}`;
}
function histogramLine(values) {
  const data = values.filter(isNum).sort((a, b) => a - b);
  if (!data.length) return "";
  const n = data.length;
  const mid = n % 2 ? data[(n - 1) / 2] : (data[n / 2 - 1] + data[n / 2]) / 2;
  return `${n} values, ${fmtNum(data[0])} \u2192 ${fmtNum(data[n - 1])}, median ${fmtNum(mid)}`;
}
function textChart(block) {
  const series = (isList(block.series) ? block.series : []).filter(isDict);
  if (!series.length) return "";
  const kind = chartKind2(block.kind);
  let body = "";
  if (kind === "histogram") {
    body = histogramLine(dataOf(series[0]));
  } else if (kind === "scatter") {
    body = series.slice(0, 3).map(pointsLine).filter(Boolean).join("; ");
  } else if (kind === "pie" || kind === "donut") {
    body = slices(isList(block.x) ? block.x : [], series[0]);
  } else {
    body = series.slice(0, 6).map(seriesLine).filter(Boolean).join("; ");
  }
  if (!body) return "";
  const unit = safeText(block.unit, 20);
  const title = `**${safeText(block.title) || "Chart"}**` + (unit ? ` (${unit})` : "");
  return `${title}: ${body}`;
}
var LOCAL_PATH = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/;
function isLocalPath(v) {
  if (!isStr(v) || v.length === 0 || v.length > MAX_URL || CONTROL_TEST.test(v)) return false;
  return LOCAL_PATH.test(v);
}
function dataOf(series) {
  return walkable(series, "data", true);
}
function walkable(block, key, missingDefault = false) {
  const v = missingDefault ? pick(block, key, []) : block[key];
  if (v === void 0 && missingDefault) return [];
  if (isList(v)) return v;
  if (isStr(v)) return [...v];
  if (isDict(v)) return Object.keys(v);
  if (v === void 0 && !missingDefault) return [];
  throw new Error(key);
}
function textImages(block) {
  const photos = isList(block.images) ? block.images : [];
  const lines = [];
  for (const photo of photos.slice(0, 12)) {
    if (!isDict(photo)) continue;
    if (isLocalPath(photo.url)) {
      const caption = safeText(photo.caption);
      lines.push(caption ? `${caption} (generated image)` : "Generated image");
      continue;
    }
    const line = textImage(photo);
    const source = safeText(photo.source);
    if (line) lines.push(source ? `${line} [${source}]` : line);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}
function textInclude() {
  return "";
}
function textFlip(block) {
  const cards = isList(block.cards) ? block.cards : [];
  const lines = [];
  for (const card of cards.slice(0, 12)) {
    if (!isDict(card)) continue;
    const front = firstOf(card, "front", "question");
    const back = firstOf(card, "back", "answer");
    if (front && back) lines.push(`- Q: ${front} \u2014 A: ${back}`);
  }
  const title = safeText(block.title);
  return (title && lines.length ? [`**${title}**`] : []).concat(lines).join("\n");
}
function nextSteps(labels2) {
  const kept = labels2.filter(Boolean);
  return kept.length ? "Next: " + kept.join(" \xB7 ") : "";
}
function textButton(block) {
  const label = safeText(block.label);
  return nextSteps([label ? mdLink(label, safeUrl(block.url, true)) : ""]);
}
function textActions(block) {
  const items = isList(block.items) ? block.items : [];
  return nextSteps(items.filter(isDict).map((it) => safeText(F(it).label)));
}
var LAYERS_MAX = 12;
var L_TITLE = 80;
var L_CAPTION = 200;
var L_LABEL = 24;
var L_NOTE = 280;
function textLayers(block) {
  const layers = firstList2(block, "layers").slice(0, LAYERS_MAX).filter((x) => isDict(x) && safeText(x.label));
  const lines = [];
  layers.forEach((layer, i) => {
    const l = F(layer);
    const label = safeText(l.label, L_LABEL);
    const note = safeText(l.note, L_NOTE);
    lines.push(note ? `${i + 1}. ${label} \u2014 ${note}` : `${i + 1}. ${label}`);
  });
  if (!lines.length) return "";
  const title = safeText(block.title, L_TITLE);
  const caption = safeText(block.caption, L_CAPTION);
  return (title ? [`**${title}**`] : []).concat(caption ? [caption] : []).concat(lines).join("\n");
}
function stopsOf(block) {
  if (isList(block.groups)) return block.groups;
  const flat = firstList2(block, "items", "events", "stops", "steps");
  return [{ items: flat }];
}
function textTimeline(block) {
  const title = safeText(block.title);
  const lines = title ? [`**${title}**`] : [];
  for (const group of stopsOf(block).slice(0, 14)) {
    if (!isDict(group) || !isList(group.items)) continue;
    const label = safeText(group.label);
    const stops = [];
    for (const item of group.items.slice(0, 12)) {
      const name = isDict(item) ? safeText(item.title) : "";
      if (!name) continue;
      const it = F(item);
      const time = safeText(it.time, 40);
      const place = safeText(it.place);
      stops.push("- " + (time ? `${time} \xB7 ` : "") + name + (place ? ` (${place})` : ""));
    }
    if (stops.length) {
      if (label) lines.push(`**${label}**`);
      lines.push(...stops);
    }
  }
  return lines.length > (title ? 1 : 0) ? lines.join("\n") : "";
}
function textHeatmap(block) {
  const rows2 = block.rows, cols = block.cols, values = block.values;
  if (!isList(rows2) || !rows2.length || !isList(cols) || !cols.length || !isList(values) || !values.length) return "";
  const columns = cols.slice(0, 12);
  const body = [];
  rows2.slice(0, 12).forEach((label, i) => {
    const line = isList(values[i]) ? values[i].slice(0, columns.length) : [];
    body.push([tableCell(label), ...line.map(tableCell)]);
  });
  const title = safeText(block.title);
  const unit = safeText(block.unit, 20);
  const head = title || unit ? `**${title || "Heatmap"}**` + (unit ? ` (${unit})` : "") : "";
  return (head ? [head] : []).concat(mdTable(["", ...columns.map(tableCell)], body)).join("\n");
}
var FL_TITLE = 80;
var FL_LABEL = 40;
var FL_NOTE = 280;
var FL_GROUP = 40;
var FL_MAX_NODES = 10;
var FL_MAX_GROUPS = 3;
var FL_MIN_COUNT = 2;
var FL_MAX_COUNT = 100;
var CHIP2 = 16;
var MAX_CHIPS2 = 10;
function chipsText(chips) {
  if (!isList(chips)) return "";
  return chips.slice(0, MAX_CHIPS2).map((c) => safeText(isDict(c) ? c.text : c, CHIP2)).filter(Boolean).join(", ");
}
function isCount(value, low, high) {
  return isNum(value) && Number.isInteger(value) && value >= low && value <= high;
}
function textFlow(block) {
  const nodes = firstList2(block, "nodes").slice(0, FL_MAX_NODES).filter((n) => isDict(n) && safeText(n.label));
  const lines = [];
  nodes.forEach((node, i) => {
    const n = F(node);
    const label = safeText(n.label, FL_LABEL);
    const note = safeText(n.note, FL_NOTE);
    const holds = chipsText(n.holds);
    let line = note ? `${i + 1}. ${label} \u2014 ${note}` : `${i + 1}. ${label}`;
    if (holds) line = `${line} (holds: ${holds})`;
    lines.push(line);
  });
  if (!lines.length) return "";
  const numbers = /* @__PURE__ */ new Map();
  nodes.forEach((node, i) => {
    const id = F(node).id;
    if (isStr(id)) numbers.set(id, i + 1);
  });
  for (const group of firstList2(block, "groups").slice(0, FL_MAX_GROUPS)) {
    const label = isDict(group) ? safeText(group.label, FL_GROUP) : "";
    if (!label) continue;
    const g = F(group);
    const at2 = walkable(g, "nodes").filter((k) => isStr(k) && numbers.has(k)).map((k) => numbers.get(k));
    if (!at2.length) continue;
    const span = at2.length === 1 ? `step ${at2[0]}` : `steps ${Math.min(...at2)}-${Math.max(...at2)}`;
    const times = isCount(g.count, FL_MIN_COUNT, FL_MAX_COUNT) ? ` \xD7 ${g.count}` : "";
    lines.push(`_${label}${times}: ${span}_`);
  }
  const title = safeText(block.title, FL_TITLE);
  return (title ? [`**${title}**`] : []).concat(lines).join("\n");
}
var S_TITLE = 80;
var S_TEXT = 600;
var S_MAX_ITEMS = 12;
var S_MAX_TICK = 20;
function changeLines(item, labels2) {
  const holds = isDict(item.holds) ? item.holds : {};
  const lines = [];
  for (const [node, chips] of Object.entries(holds).slice(0, FL_MAX_NODES)) {
    const named = Object.hasOwn(labels2, node) ? labels2[node] : void 0;
    const name = safeText(named, S_TITLE) || safeText(node, 24);
    const held = chipsText(chips);
    if (name && held) lines.push(`${name} now holds: ${held}`);
  }
  if (isCount(item.tick, 1, S_MAX_TICK)) lines.push(`The repeated part runs ${item.tick} more times.`);
  return lines;
}
function textSteps(block, labels2) {
  const items = firstList2(block, "items").slice(0, S_MAX_ITEMS).filter((it) => isDict(it) && safeText(it.title));
  const flowId = isStr(block.for) ? block.for : "";
  const forLabels = labels2 && flowId && Object.hasOwn(labels2, flowId) ? labels2[flowId] : {};
  const parts = [];
  items.forEach((item, i) => {
    const it = F(item);
    const head = `**Step ${i + 1} of ${items.length} \xB7 ${safeText(it.title, S_TITLE)}**`;
    const lines = [head, safeText(it.text, S_TEXT), ...changeLines(it, forLabels)].filter(Boolean);
    parts.push(lines.join("\n"));
  });
  if (!parts.length) return "";
  const title = safeText(block.title, S_TITLE);
  return (title ? [`**${title}**`] : []).concat(parts).join("\n\n");
}
var INPUT_ID = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
function arithmetic(formula, names, powers = false) {
  if (!isStr(formula) || formula.length > MAX_STRING) return null;
  let tree;
  try {
    tree = parseFormula(formula);
  } catch {
    return null;
  }
  if (!simpleTree(tree, powers)) return null;
  return evaluate(tree, names);
}
function simpleTree(node, powers) {
  switch (node.kind) {
    case "number":
    case "name":
      return true;
    case "negate":
      return simpleTree(node.arg, powers);
    case "binary": {
      const ops = ["+", "-", "*", "/"];
      if (node.op === "^") return powers;
      if (!ops.includes(node.op)) return false;
      return simpleTree(node.left, powers) && simpleTree(node.right, powers);
    }
    case "call":
      return false;
  }
}
function textCalculator(block) {
  const inputs = walkable(block, "inputs").slice(0, 6).filter((it) => isDict(it) && isStr(it.id));
  const names = /* @__PURE__ */ new Map();
  const shown = [];
  for (const item of inputs) {
    const it = F(item);
    const start = [it.value, it.min].find(isNum) ?? 0;
    names.set(it.id, start);
    const label = firstOf(it, "label", "id");
    shown.push(`${label} ${withUnit(fmtNum(start), safeText(it.unit, 20))}`);
  }
  const lines = [];
  for (const out of walkable(block, "outputs").slice(0, 6)) {
    const label = isDict(out) ? safeText(out.label) : "";
    if (!label) continue;
    const value = arithmetic(F(out).formula, names);
    lines.push(value === null ? `- ${label}: open in Hermes Desktop for the live calculator` : `- ${label}: ${withUnit(fmtNum(value), safeText(F(out).unit, 20))}`);
  }
  if (!lines.length) return "";
  return (shown.length ? [`With ${shown.join(", ")}:`] : []).concat(lines).join("\n");
}
var SIM_TITLE = 80;
var SIM_UNIT = 12;
var SIM_MAX_PILES = 3;
var SIM_ROWS = 5;
function isName(v) {
  return isStr(v) && INPUT_ID.test(v);
}
function timesOf2(to, step) {
  const out = [];
  for (let k = 0; k < SIM_ROWS; k++) out.push(Math.floor(to * k / (SIM_ROWS - 1) / step + 0.5) * step);
  return out;
}
function amount(v) {
  if (Math.abs(v) >= 100) return fmtNum(roundHalfEven(v, 0));
  if (Math.abs(v) >= 1) return fmtNum(roundHalfEven(v, 2));
  return fmtNum(v);
}
function textSimulate(block) {
  const t = block.t, view = block.view;
  if (!isDict(t) || !isDict(view) || !isName(t.name)) return "";
  const to = t.to, step = pick(t, "step", 1);
  const pilesRaw = Object.hasOwn(view, "piles") ? view.piles : view.series;
  if (!isNum(to) || !isNum(step) || to <= 0 || step <= 0 || !isList(pilesRaw)) return "";
  const piles = pilesRaw.slice(0, SIM_MAX_PILES).filter((p) => isDict(p) && safeText(p.name));
  if (!piles.length) return "";
  const names = /* @__PURE__ */ new Map();
  if (isDict(block.values)) {
    for (const [k, v] of Object.entries(block.values)) if (isName(k) && isNum(v)) names.set(k, v);
  }
  const shown = [];
  const inputs = isList(block.inputs) ? block.inputs : [];
  for (const item of inputs) {
    if (!isDict(item)) continue;
    const it = F(item);
    const key = pick(it, "name", it.id);
    if (!isName(key)) continue;
    const start = [it.value, it.min].find(isNum) ?? 0;
    names.set(key, start);
    const value = withUnit(fmtNum(start), safeText(it.unit, SIM_UNIT));
    shown.push(`${firstOf(it, "label", "name", "id")} ${value}`);
  }
  const unit = safeText(block.unit, SIM_UNIT);
  const rows2 = [];
  for (const when of timesOf2(to, step)) {
    const withTime = new Map(names);
    withTime.set(t.name, when);
    const cells = piles.map((p) => {
      const v = arithmetic(F(p).formula, withTime, true);
      return v === null ? "\u2013" : withUnit(amount(v), unit);
    });
    rows2.push([fmtNum(when), ...cells]);
  }
  const header = [tableCell(t.unit) || t.name, ...piles.map((p) => tableCell(F(p).name))];
  const title = safeText(block.title, SIM_TITLE);
  const lead = (title ? [`**${title}**`] : []).concat(shown.length ? [`With ${shown.join(", ")}:`] : []);
  return lead.concat(mdTable(header, rows2)).join("\n");
}
var FORM_NOTE = 80;
var FORM_GROUP = 40;
function choice(value) {
  if (isList(value)) return value.slice(0, 12).map(choice).filter(Boolean).join(", ");
  if (isDict(value)) return firstOf(value, "label", "value");
  return safeText(value, 60);
}
function optionText(option) {
  const name = choice(option);
  const note = isDict(option) && name ? safeText(option.note, FORM_NOTE) : "";
  return note ? `${name} \u2014 ${note}` : name;
}
function chosen(field, options) {
  const value = field.value;
  for (const option of options) {
    if (isDict(option) && !Array.isArray(value) && option.value === value) return choice(option);
  }
  return choice(value);
}
function textForm(block) {
  const fields = isList(block.fields) ? block.fields : [];
  const lines = [];
  let group = "";
  for (const field of fields.slice(0, 12)) {
    if (!isDict(field)) continue;
    const f = F(field);
    const label = firstOf(f, "label", "id");
    if (!label) continue;
    const heading = safeText(f.group, FORM_GROUP);
    if (heading && heading !== group) lines.push(`${heading}:`);
    group = heading;
    const options = isList(f.options) ? f.options : [];
    const picked = chosen(f, options);
    const value = picked ? withUnit(picked, safeText(f.unit, 20)) : "";
    const listed2 = options.slice(0, 12).map(optionText).filter(Boolean).join(" / ");
    lines.push(`- ${label}${value ? `: ${value}` : ""}${listed2 ? ` (${listed2})` : ""}`);
  }
  if (!lines.length) return "";
  const title = safeText(block.title);
  return (title ? [`**${title}**`] : []).concat(lines, ["(answer in a message)"]).join("\n");
}
var RENDERERS = {
  heading: textHeading,
  text: textText,
  divider: () => textDivider(),
  badge: textBadge,
  link: textLink,
  image: textImage,
  bar: textBar,
  callout: textCallout,
  source: textSource,
  table: textTable,
  list: textListBlock,
  checklist: textChecklist,
  tiles: textTiles,
  streak: textStreak,
  progress: textProgress,
  stat: textStat,
  kpis: textKpis,
  chart: textChart,
  images: textImages,
  include: textInclude,
  flip: textFlip,
  button: textButton,
  actions: textActions,
  layers: textLayers,
  timeline: textTimeline,
  heatmap: textHeatmap,
  flow: textFlow,
  calculator: textCalculator,
  simulate: textSimulate,
  form: textForm,
  steps: textSteps
};
var SIMPLE = {};
for (const [kind, fn] of Object.entries(RENDERERS)) {
  SIMPLE[kind] = (block, _depth, labels2) => fn(block, labels2);
}
function layoutPieces(block, depth, labels2) {
  if (block.type === "tabs") {
    const out = [];
    for (const tab of isList(block.tabs) ? block.tabs : []) {
      const children2 = isDict(tab) && isList(tab.children) ? tab.children : [];
      const inside3 = pieces2(children2, depth + 1, labels2);
      const label = inside3.length ? safeText(F(tab).label) : "";
      if (label) out.push(`**${label}**`);
      out.push(...inside3);
    }
    return out;
  }
  const children = isList(block.children) ? block.children : [];
  const title = block.type === "section" ? safeText(block.title) : "";
  const inside2 = pieces2(children, depth + 1, labels2);
  return (title && inside2.length ? [`**${title}**`] : []).concat(inside2);
}
function renderBlock(block, depth, labels2) {
  if (!isDict(block) || depth > MAX_DEPTH2) return [];
  const kind = block.type;
  if (LAYOUT_TYPES.includes(kind)) return layoutPieces(block, depth, labels2);
  const renderer = isStr(kind) && Object.hasOwn(SIMPLE, kind) ? SIMPLE[kind] : void 0;
  const text = renderer ? renderer(block, depth, labels2) : "";
  return text ? [text] : [];
}
function renderSafely(block, depth, labels2) {
  try {
    return renderBlock(block, depth, labels2);
  } catch {
    return [];
  }
}
function pieces2(blocks, depth, labels2) {
  const out = [];
  for (const block of blocks) out.push(...renderSafely(block, depth, labels2));
  return out;
}
function blocksAsMarkdown(blocks) {
  if (!isList(blocks)) return "";
  let labels2 = {};
  try {
    labels2 = flowLabels(blocks);
  } catch {
    labels2 = {};
  }
  return pieces2(blocks, 0, labels2).join("\n\n");
}

// src/host/ExportChrome.tsx
import { Fragment as Fragment16, jsx as jsx57, jsxs as jsxs52 } from "react/jsx-runtime";
var CONTAINER = ["row", "section", "grid", "columns", "tabs"];
function blocksOf(board) {
  if (Array.isArray(board)) return board;
  if (board && typeof board === "object" && Array.isArray(board.blocks)) {
    return board.blocks;
  }
  return [];
}
function useExportChrome(args) {
  const { blocks, asOf, live, stored: stored2, expanded, getBoard, getHost } = args;
  const actions = useContext15(BlockActions);
  const provenance = provenanceOf(blocks, asOf, live);
  const line = provenanceLine(provenance);
  const [found, setFound] = useState23([]);
  const foundRef = useRef17([]);
  const [lit, setLit] = useState23(null);
  const [said, setSaid] = useState23(null);
  const [open, setOpen] = useState23(false);
  const [failed, setFailed] = useState23(null);
  const menuButtonRef = useRef17(null);
  const menuRef = useRef17(null);
  function scan() {
    const board = getBoard();
    const host2 = getHost();
    const commit = (out2) => {
      const same = out2.length === foundRef.current.length && out2.every((c, i) => c.root === foundRef.current[i].root && c.left === foundRef.current[i].left && c.top === foundRef.current[i].top);
      if (same) return;
      foundRef.current = out2;
      setFound(out2);
    };
    if (!board || !host2) {
      commit([]);
      return;
    }
    const out = [];
    const place = (el) => {
      let node = el;
      while (node instanceof HTMLElement && node.classList.contains("hb-place")) node = node.firstElementChild ?? node;
      return node;
    };
    const measure = (block, el, kind) => {
      const root = place(el);
      const r = root.getBoundingClientRect();
      const t = host2.getBoundingClientRect();
      const name = kind === "table" ? block.caption ?? "" : block.spec.title ?? block.spec.series[0]?.name ?? "Chart";
      out.push({ block, root, kind, name, left: Math.round(r.right - t.left) - 34, top: Math.round(r.top - t.top) + 6 });
    };
    const walk = (list, els) => {
      list.forEach((block, i) => {
        const el = els[i];
        if (!el) return;
        if (block.type === "table" || block.type === "chart") {
          measure(block, el, block.type);
          return;
        }
        if (!CONTAINER.includes(block.type)) return;
        const root = place(el);
        const container = block;
        if (block.type === "tabs") {
          const tabs = [...root.querySelectorAll(":scope > .hb-tab-bar > .hb-tab")];
          const at2 = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
          const panel = root.querySelector(":scope > .hb-tab-panel");
          const children = container.tabs?.[at2 >= 0 ? at2 : 0]?.children ?? [];
          if (panel) walk(children, [...panel.children]);
          return;
        }
        if (block.type === "section") {
          const body = root.querySelector(":scope > .hb-section-body");
          if (body) walk(container.children ?? [], [...body.children]);
          return;
        }
        const cellClass = block.type === "grid" ? ".hb-grid-cell" : block.type === "row" ? ".hb-row-cell" : ".hb-column";
        const cells = [...root.querySelectorAll(`:scope > ${cellClass}`)];
        walk(container.children ?? [], cells.map((c) => c.firstElementChild).filter((c) => !!c));
      });
    };
    walk(provenance.list, [...board.children]);
    commit(out);
  }
  const scanRef = useRef17(scan);
  scanRef.current = scan;
  useLayoutEffect4(() => {
    scanRef.current();
  }, [blocks, asOf, live, expanded]);
  useEffect10(() => {
    const board = getBoard();
    if (!board) return;
    const observer = new MutationObserver(() => scanRef.current());
    observer.observe(board, { childList: true, subtree: true });
    const onResize = () => scanRef.current();
    window.addEventListener("resize", onResize);
    const onScroll = () => scanRef.current();
    window.addEventListener("scroll", onScroll, true);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => scanRef.current());
      ro.observe(board);
    }
    return () => {
      observer.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [getBoard]);
  useEffect10(() => {
    if (!open) return;
    const away = (e) => {
      const node = e.target;
      if (menuRef.current?.contains(node) || menuButtonRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect10(() => {
    if (expanded) {
      setOpen(false);
      setLit(null);
    }
  }, [expanded]);
  function light(e) {
    const node = e.target;
    if (node?.closest?.(".hb-export-btn, .hb-export, .hb-export-menu")) return;
    const at2 = found.findIndex((c) => c.root.contains(node));
    setLit(at2 >= 0 ? at2 : null);
  }
  async function runBlock(c) {
    if (c.block.type === "table") {
      saveBlob(csvBlob(c.block.columns, c.block.rows, line), `${fileBase(c.block.caption, "table")}.csv`);
      return;
    }
    const blob = await chartPng(c.root, { spec: c.block.spec, provenance: line });
    if (blob) saveBlob(blob, `${chartFileBase(c.root)}.png`);
    else setSaid(found.indexOf(c));
  }
  function runBoard(kind) {
    if (stored2 === null || stored2 === void 0) {
      setFailed("Nothing was exported.");
      return;
    }
    const base = `board-${actions.blockId ?? "board"}`;
    if (kind === "markdown") {
      saveBlob(new Blob([markdownFile(blocksAsMarkdown(blocksOf(stored2)), provenance)], {
        type: "text/markdown;charset=utf-8"
      }), `${base}.md`);
    } else {
      saveBlob(new Blob([jsonFile(stored2)], { type: "application/json" }), `${base}.json`);
    }
    setFailed(null);
    setOpen(false);
  }
  const bind = {
    onPointerMove: (e) => light(e),
    onPointerLeave: () => setLit(null),
    onFocus: (e) => light(e),
    onBlur: (e) => {
      const to = e.relatedTarget;
      if (to?.closest?.(".hb-export-btn, .hb-export, .hb-export-menu")) return;
      setLit(null);
    }
  };
  const menu = /* @__PURE__ */ jsx57(
    "button",
    {
      ref: menuButtonRef,
      type: "button",
      className: expanded ? "hb-export hb-export-dialog" : "hb-export",
      "aria-label": "Export board",
      "aria-haspopup": "menu",
      "aria-expanded": open,
      onClick: () => {
        setOpen((o) => !o);
        setFailed(null);
      },
      children: /* @__PURE__ */ jsx57(IconDownload, {})
    }
  );
  const popover = open && /* @__PURE__ */ jsxs52("div", { ref: menuRef, className: "hb-export-menu", role: "menu", "aria-label": "Export the whole board", children: [
    /* @__PURE__ */ jsx57("button", { type: "button", role: "menuitem", onClick: () => runBoard("markdown"), children: "Markdown" }),
    /* @__PURE__ */ jsx57("button", { type: "button", role: "menuitem", onClick: () => runBoard("json"), children: "JSON" }),
    failed && /* @__PURE__ */ jsx57("div", { className: "hb-export-failed", role: "status", "aria-live": "polite", children: failed })
  ] });
  const layer = /* @__PURE__ */ jsxs52("div", { className: "hb-export-layer", children: [
    found.map((c, i) => /* @__PURE__ */ jsx57(
      "button",
      {
        type: "button",
        className: i === lit ? "hb-export-btn lit" : "hb-export-btn",
        style: { left: `${c.left}px`, top: `${c.top}px` },
        "aria-label": `Export ${c.kind === "table" ? "table" : "chart"}${c.name ? ` \u201C${c.name}\u201D` : ""} as ${c.kind === "table" ? "CSV" : "PNG"}`,
        onClick: () => runBlock(c),
        children: /* @__PURE__ */ jsx57(IconDownload, {})
      },
      i
    )),
    said !== null && found[said] && /* @__PURE__ */ jsx57(
      "span",
      {
        className: "hb-export-said",
        role: "status",
        "aria-live": "polite",
        style: { left: `${found[said].left}px`, top: `${found[said].top + 30}px` },
        children: "No picture could be exported."
      }
    )
  ] });
  const whole2 = /* @__PURE__ */ jsxs52(Fragment16, { children: [
    menu,
    popover
  ] });
  return { bind, menu: expanded ? null : whole2, dialogMenu: expanded ? whole2 : null, layer };
}
function IconDownload() {
  return /* @__PURE__ */ jsx57(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx57("path", { d: "M12 4v10m0 0l-4-4m4 4l4-4M4 19h16" })
    }
  );
}

// src/host/LibraryChrome.tsx
import { useCallback as useCallback2, useContext as useContext16, useEffect as useEffect11, useRef as useRef18, useState as useState24 } from "react";

// src/host/tabbable.ts
function tabbableIn(root) {
  const laidOut = root.getClientRects().length > 0;
  return [...root.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].filter(
    (el) => el.tabIndex >= 0 && el.getAttribute("type") !== "hidden" && el.disabled !== true && !el.closest("fieldset[disabled]") && !el.closest("[hidden]") && (!laidOut || el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible")
  );
}
function dialogKeys(root, layer, onEscape) {
  return (e) => {
    if (e.key === "Escape") {
      if (!isTopLayer(layer)) return;
      e.stopImmediatePropagation();
      onEscape();
      return;
    }
    if (e.key !== "Tab") return;
    if (!isTopLayer(layer)) return;
    const items = tabbableIn(root);
    if (!items.length) return;
    e.preventDefault();
    const active = document.activeElement;
    const at2 = active === null ? -1 : items.indexOf(active);
    const step = e.shiftKey ? -1 : 1;
    const next = at2 === -1 ? e.shiftKey ? items.length - 1 : 0 : (at2 + step + items.length) % items.length;
    items[next].focus();
  };
}

// src/host/LibraryChrome.tsx
import { Fragment as Fragment17, jsx as jsx58, jsxs as jsxs53 } from "react/jsx-runtime";
var ID_PATTERN = /^[0-9a-f]{8}$/;
function LibraryEntry() {
  const library = useLibraryChrome({ standalone: true, drawn: false, expanded: false });
  return /* @__PURE__ */ jsxs53(Fragment17, { children: [
    library.controls,
    library.dialog
  ] });
}
function attachText(title, id) {
  return `Saved board \u201C${title}\u201D:
::blocks{id="${id}"}`;
}
function rows(data) {
  const list = data?.entries;
  if (!Array.isArray(list)) return null;
  return list.filter((e) => {
    const id = e?.id;
    return typeof id === "string" && ID_PATTERN.test(id);
  }).map((e) => ({
    id: String(e.id),
    title: typeof e.title === "string" ? e.title : "Board",
    folder: typeof e.folder === "string" && e.folder ? e.folder : null,
    favorite: e.favorite === true,
    pinned: e.pinned !== false,
    saved_at: typeof e.saved_at === "string" ? e.saved_at : "",
    exists: e.exists !== false
  }));
}
function useLibraryChrome(args) {
  const actions = useContext16(BlockActions);
  const rest = actions.rest;
  const valid = typeof args.id === "string" && ID_PATTERN.test(args.id);
  const [entries2, setEntries] = useState24(null);
  const [pinned, setPinned] = useState24(false);
  const [said, setSaid] = useState24(null);
  const [open, setOpen] = useState24(false);
  const [view, setView] = useState24({ kind: "list" });
  const [opened, setOpened] = useState24(null);
  const [openedSaid, setOpenedSaid] = useState24(null);
  const [editing, setEditing] = useState24(null);
  const [draft, setDraft] = useState24("");
  const [attached, setAttached] = useState24(null);
  const pinRef = useRef18(null);
  const askedOnce = useRef18(false);
  const libRef = useRef18(null);
  const closeRef = useRef18(null);
  const dialogRef = useRef18(null);
  const ask = (path, init) => {
    if (!rest) return null;
    try {
      return rest(path, init);
    } catch {
      return Promise.reject(new Error("the door did not answer"));
    }
  };
  const refresh = useCallback2(() => {
    const answer = rest ? ask("/library") : null;
    if (!answer) return Promise.resolve(false);
    return answer.then((data) => {
      const list2 = rows(data);
      setEntries(list2 ?? []);
      setPinned(Boolean(list2?.some((e) => e.id === args.id)));
      return true;
    }).catch(() => false);
  }, [rest, ask, args.id]);
  useEffect11(() => {
    if (valid && args.drawn && !askedOnce.current) {
      askedOnce.current = true;
      void refresh();
    }
  }, [valid, args.drawn, refresh]);
  const togglePin = () => {
    const was = pinned;
    const done = args.id ? ask(`/library/${args.id}`, { method: was ? "DELETE" : "PUT", body: was ? void 0 : {} }) : null;
    if (!done) return;
    done.then(() => {
      setSaid(was ? "Removed from Library \u2014 the board itself was never deleted." : "Saved to Library \u2014 on this machine only.");
      return refresh();
    }).catch(() => setSaid("The Library did not answer."));
  };
  const putWords = (id, words) => {
    const done = ask(`/library/${id}`, { method: "PUT", body: words });
    if (!done) return;
    done.then(refresh).catch(() => setSaid("The Library did not answer."));
  };
  const removeRow = (e) => {
    const gone = ask(`/library/${e.id}`, { method: "DELETE" });
    if (!gone) return;
    gone.then(() => {
      setSaid(`\u201C${e.title}\u201D is off the shelf \u2014 the board itself was never deleted.`);
      return refresh();
    }).catch(() => setSaid("The Library did not answer."));
  };
  const reattach = (e) => {
    void actions.send(attachText(e.title || "Board", e.id), { force: true }).then((r) => setAttached({ id: e.id, word: SENT_WORDS[r] }));
  };
  const openBoard = (e) => {
    const answer = ask(`/blocks/${e.id}`);
    if (!answer) return;
    setOpened(e.id);
    setOpenedSaid(null);
    answer.then((data) => {
      const { blocks, align: align2, textAlign, asOf, live, followUps, density: density2, palette: palette2, motion: motion2, version: version2 } = readBlocksNoted(data);
      if (!blocks.length) {
        setOpenedSaid("This board could not be reopened.");
        return;
      }
      if ((version2 ?? 0) >= 2) markLiving(e.id);
      setView({
        kind: "board",
        id: e.id,
        title: e.title,
        board: {
          blocks,
          boardAlign: align2,
          boardTextAlign: textAlign,
          boardAsOf: asOf,
          boardLive: live,
          boardFollowUps: followUps,
          boardDensity: density2,
          boardPalette: palette2,
          boardMotion: motion2
        }
      });
    }).catch(() => setOpenedSaid("This board could not be reopened.")).finally(() => setOpened(null));
  };
  const openLibrary = () => {
    setOpen(true);
    setView({ kind: "list" });
    setEditing(null);
    void refresh();
  };
  const closeLibrary = () => {
    setOpen(false);
    libRef.current?.focus();
  };
  useEffect11(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  useEffect11(() => {
    if (!open) return;
    const layer = pushLayer();
    const onKey = (e) => {
      if (e.key === "Escape" && isTopLayer(layer) && view.kind === "board") {
        e.stopImmediatePropagation();
        setView({ kind: "list" });
        return;
      }
      dialogKeys(dialogRef.current, layer, closeLibrary)(e);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [open, view.kind]);
  if (!valid && !args.standalone) return { controls: null, dialog: null };
  const libButton = /* @__PURE__ */ jsxs53(
    "button",
    {
      ref: libRef,
      type: "button",
      className: args.standalone ? "hb-lib hb-lib-entry" : "hb-lib",
      "aria-haspopup": "dialog",
      "aria-label": "Open Library",
      "aria-disabled": !rest,
      onClick: openLibrary,
      children: [
        /* @__PURE__ */ jsx58(IconShelf, {}),
        args.standalone && /* @__PURE__ */ jsx58("span", { className: "hb-lib-entry-label", children: "Library" })
      ]
    }
  );
  const saidWord = said !== null && /* @__PURE__ */ jsx58("div", { className: "hb-library-said", role: "status", "aria-live": "polite", children: said });
  const controls = args.expanded ? null : args.standalone ? (
    // The new-chat entry is always visible and in flow: a quiet pill standing where the empty chat
    // invites the first move — not a hover-revealed corner over a board that is not here.
    /* @__PURE__ */ jsxs53("span", { className: "hb-library-entry", children: [
      libButton,
      saidWord
    ] })
  ) : /* @__PURE__ */ jsxs53(Fragment17, { children: [
    /* @__PURE__ */ jsx58(
      "button",
      {
        ref: pinRef,
        type: "button",
        className: "hb-pin",
        "aria-pressed": pinned,
        "aria-label": pinned ? "Remove from Library" : "Save to Library",
        "aria-disabled": !rest,
        title: rest ? void 0 : "Nothing to save here",
        onClick: togglePin,
        children: /* @__PURE__ */ jsx58(IconPin, { filled: pinned })
      }
    ),
    libButton,
    saidWord
  ] });
  if (!open) return { controls, dialog: null };
  const groups = [];
  const list = entries2 ?? [];
  const favorites = list.filter((e) => e.favorite);
  if (favorites.length) groups.push({ head: "Favorites", items: favorites });
  const shelf = list.filter((e) => !e.favorite);
  const names = [...new Set(shelf.map((e) => e.folder).filter((f) => !!f))].sort((a, b) => a.localeCompare(b));
  for (const name of names) groups.push({ head: name, items: shelf.filter((e) => e.folder === name) });
  const unfiled = shelf.filter((e) => !e.folder);
  if (unfiled.length) groups.push({ head: "Unfiled", items: unfiled });
  const row = (e) => {
    const editor = editing && editing.id === e.id && /* @__PURE__ */ jsxs53("span", { className: "hb-library-edit", children: [
      /* @__PURE__ */ jsx58(
        "input",
        {
          type: "text",
          autoFocus: true,
          onFocus: (ev) => ev.target.select(),
          "aria-label": editing.field === "title" ? `New title for \u201C${e.title}\u201D` : `Folder for \u201C${e.title}\u201D`,
          value: draft,
          onChange: (ev) => setDraft(ev.target.value),
          onKeyDown: (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              putWords(e.id, { [editing.field]: draft });
              setEditing(null);
            }
            if (ev.key === "Escape") ev.stopPropagation();
          }
        }
      ),
      /* @__PURE__ */ jsx58("button", { type: "button", onClick: () => {
        putWords(e.id, { [editing.field]: draft });
        setEditing(null);
      }, children: "Save" }),
      /* @__PURE__ */ jsx58("button", { type: "button", onClick: () => setEditing(null), children: "Cancel" })
    ] });
    return /* @__PURE__ */ jsxs53("div", { className: "hb-library-row", "data-board": e.id, children: [
      /* @__PURE__ */ jsxs53(
        "button",
        {
          type: "button",
          className: "hb-library-open",
          onClick: () => openBoard(e),
          disabled: !e.exists,
          title: e.exists ? "Reopen this saved board" : "This board is not on this machine",
          children: [
            /* @__PURE__ */ jsx58("span", { className: "hb-library-name", children: e.title || "Board" }),
            !e.exists && /* @__PURE__ */ jsx58("span", { className: "hb-library-missing", children: " \u2014 not on this machine" }),
            e.id === args.id && /* @__PURE__ */ jsx58("span", { className: "hb-library-here", children: " \u2014 this board" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs53("span", { className: "hb-library-tools", children: [
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-pressed": e.favorite,
            "aria-label": e.favorite ? `Unfavorite \u201C${e.title}\u201D` : `Favorite \u201C${e.title}\u201D`,
            onClick: () => putWords(e.id, { favorite: !e.favorite }),
            children: "\u2605"
          }
        ),
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-label": `Rename \u201C${e.title}\u201D`,
            onClick: () => {
              setEditing({ id: e.id, field: "title" });
              setDraft(e.title);
            },
            children: "Rename"
          }
        ),
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-label": `Move \u201C${e.title}\u201D to a folder`,
            onClick: () => {
              setEditing({ id: e.id, field: "folder" });
              setDraft(e.folder ?? "");
            },
            children: "Folder"
          }
        ),
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-label": `Add \u201C${e.title}\u201D to chat`,
            disabled: !e.exists,
            onClick: () => reattach(e),
            children: "Add to chat"
          }
        ),
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-label": `Remove \u201C${e.title}\u201D from Library`,
            onClick: () => removeRow(e),
            children: "Remove"
          }
        )
      ] }),
      attached?.id === e.id && /* @__PURE__ */ jsx58("span", { className: "hb-library-attached", role: "status", "aria-live": "polite", children: attached.word }),
      editor
    ] }, e.id);
  };
  const dialog = /* @__PURE__ */ jsx58("div", { className: "hb-library-overlay", onClick: (e) => e.target === e.currentTarget && closeLibrary(), children: /* @__PURE__ */ jsxs53("div", { ref: dialogRef, className: "hb-library-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Board Library", children: [
    /* @__PURE__ */ jsx58(
      "button",
      {
        ref: closeRef,
        type: "button",
        className: "hb-overlay-close hb-library-close",
        "aria-label": "Close Library",
        onClick: closeLibrary,
        children: /* @__PURE__ */ jsx58(IconClose, {})
      }
    ),
    view.kind === "board" ? /* @__PURE__ */ jsxs53("div", { className: "hb-library-board", "data-board": view.id, children: [
      /* @__PURE__ */ jsxs53("div", { className: "hb-library-boardhead", children: [
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-label": "Back to Library",
            onClick: () => setView({ kind: "list" }),
            children: "\u2190 Library"
          }
        ),
        /* @__PURE__ */ jsx58("span", { className: "hb-library-boardtitle", children: view.title || "Board" }),
        /* @__PURE__ */ jsx58(
          "button",
          {
            type: "button",
            "aria-label": `Add \u201C${view.title}\u201D to chat`,
            onClick: () => reattach({ ...view, folder: null, favorite: false, pinned: true, saved_at: "", exists: true }),
            children: "Add to chat"
          }
        ),
        attached?.id === view.id && /* @__PURE__ */ jsx58("span", { className: "hb-library-attached", role: "status", "aria-live": "polite", children: attached.word })
      ] }),
      /* @__PURE__ */ jsx58(BlockActions.Provider, { value: { ...actions, blockId: view.id }, children: /* @__PURE__ */ jsx58(
        Blocks,
        {
          blocks: view.board.blocks,
          boardAlign: view.board.boardAlign,
          boardTextAlign: view.board.boardTextAlign,
          boardAsOf: view.board.boardAsOf,
          boardLive: view.board.boardLive,
          boardFollowUps: view.board.boardFollowUps,
          boardDensity: view.board.boardDensity,
          boardPalette: view.board.boardPalette,
          boardMotion: view.board.boardMotion
        }
      ) })
    ] }) : /* @__PURE__ */ jsxs53("div", { className: "hb-library-list", children: [
      /* @__PURE__ */ jsx58("div", { className: "hb-library-title", children: "Library" }),
      entries2 === null ? /* @__PURE__ */ jsx58("div", { className: "hb-library-note", children: "The Library did not answer." }) : !list.length ? /* @__PURE__ */ jsx58("div", { className: "hb-library-note", children: "Nothing saved yet. Save a board with the pin beside it \u2014 it stays on this machine." }) : groups.map((g) => /* @__PURE__ */ jsxs53("div", { className: "hb-library-group", children: [
        /* @__PURE__ */ jsx58("div", { className: "hb-library-head", children: g.head }),
        g.items.map(row)
      ] }, g.head)),
      opened !== null && /* @__PURE__ */ jsx58("div", { className: "hb-library-note", role: "status", children: "Reopening\u2026" }),
      openedSaid !== null && /* @__PURE__ */ jsx58("div", { className: "hb-library-note", role: "status", children: openedSaid }),
      said !== null && /* @__PURE__ */ jsx58("div", { className: "hb-library-note", role: "status", children: said })
    ] })
  ] }) });
  return { controls, dialog };
}
function IconPin({ filled }) {
  return /* @__PURE__ */ jsx58(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx58("path", { d: "M6 3h12v18l-6-4-6 4z" })
    }
  );
}
function IconShelf() {
  return /* @__PURE__ */ jsx58(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx58("path", { d: "M4 19h16M6 19V9m6 10V5m6 14v-6" })
    }
  );
}
function IconClose() {
  return /* @__PURE__ */ jsx58(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx58("path", { d: "M6 6l12 12M18 6L6 18" })
    }
  );
}

// src/host/BlockTag.tsx
import { jsx as jsx59, jsxs as jsxs54 } from "react/jsx-runtime";
var ID_PATTERN2 = /^[0-9a-f]{8}$/;
function isEnvelopeCarrying(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data) && "stored" in data;
}
var NO_BLOCKS = [];
function BlockTag({ id, streaming, load }) {
  const validId = typeof id === "string" && ID_PATTERN2.test(id);
  const actions = useContext17(BlockActions);
  const address = validId ? `${actions.sessionScope ?? ""}|${id}` : "";
  const [state, setState] = useState25({ kind: "loading" });
  const [expanded, setExpanded] = useState25(false);
  const [viewing, setViewing] = useState25(null);
  const hostRef = useRef19(null);
  const expandRef = useRef19(null);
  const closeRef = useRef19(null);
  const drawn = useRef19(null);
  const self = useRef19(null);
  if (self.current === null) self.current = { token: /* @__PURE__ */ Symbol("hb-tag") };
  const [role, setRole] = useState25("unknown");
  const [refresh, setRefresh] = useState25(0);
  const [, force] = useReducer((x) => x + 1, 0);
  const [live, setLive] = useState25({});
  useLayoutEffect5(() => {
    if (streaming || !validId) return;
    const token = self.current.token;
    const claim2 = claim(address, token);
    setRole(claim2 ? "home" : "pointer");
    if (!claim2) poke(address);
    const recompute = () => {
      const mine = owns(address, token);
      setRole(mine ? "home" : listed(address, token) ? "pointer" : "unknown");
      force();
    };
    const unsub = subscribe(address, recompute);
    const offPoke = onPoke(address, () => {
      setViewing(null);
      setRefresh((r) => r + 1);
    });
    return () => {
      unsub();
      offPoke();
      if (release(address, token)) forgetBlock(id);
    };
  }, [address, id, streaming, validId]);
  useEffect12(() => {
    if (streaming || !validId || role !== "home") return;
    let alive = true;
    const ask = viewing === null || !actions.rest ? load(id) : actions.rest(`/blocks/${id}?version=${viewing}`);
    Promise.resolve(ask).then((data) => {
      const {
        blocks,
        align: boardAlign,
        textAlign: boardTextAlign,
        asOf: boardAsOf,
        live: boardLive,
        followUps: boardFollowUps,
        density: boardDensity,
        palette: boardPalette,
        motion: boardMotion,
        version: boardVersion,
        updatedAt: boardUpdatedAt,
        links: boardLinks
      } = readBlocksNoted(data);
      const envelope = isEnvelopeCarrying(data) ? data.stored : data;
      if (!alive) return;
      if (blocks.length) {
        const headless = drawn.current === null && viewing === null && (boardVersion ?? 0) >= 2;
        const commitDraw = () => {
          if (!alive) return;
          if (drawn.current) carryBlocks(drawn.current, blocks);
          if (drawn.current && viewing === null) void promoteOnUpdate(actions.rest, id, drawn.current, blocks);
          if (viewing === null && (boardVersion ?? 0) >= 2) markLiving(id);
          drawn.current = blocks;
          setState({
            kind: "drawn",
            blocks,
            boardAlign,
            boardTextAlign,
            boardAsOf,
            boardLive,
            boardFollowUps,
            boardDensity,
            boardPalette,
            boardMotion,
            boardVersion,
            boardUpdatedAt,
            boardLinks,
            stored: envelope
          });
          if (viewing === null) {
            setLive({ version: boardVersion, updatedAt: boardUpdatedAt, links: boardLinks });
            setMeta(address, { version: boardVersion, updatedAt: boardUpdatedAt });
          }
        };
        if (headless && actions.rest !== void 0) {
          const rest = actions.rest;
          void migrateArchived(
            rest,
            id,
            async (v) => {
              const answer = await rest(`/blocks/${id}?version=${v}`);
              const read = readBlocksNoted(answer).blocks;
              return read.length > 0 ? read : null;
            },
            blocks,
            boardVersion ?? 2
          ).then(commitDraw, commitDraw);
        } else {
          commitDraw();
        }
      } else if (viewing === null) {
        setState({ kind: "failed" });
      } else {
        setViewing(null);
      }
    }).catch(() => {
      if (!alive) return;
      if (viewing === null) setState({ kind: "failed" });
      else setViewing(null);
    });
    return () => {
      alive = false;
    };
  }, [address, id, streaming, validId, role, refresh, viewing]);
  const close = () => {
    setExpanded(false);
    expandRef.current?.focus();
  };
  const chrome = useExportChrome({
    blocks: state.kind === "drawn" ? state.blocks : NO_BLOCKS,
    asOf: state.kind === "drawn" ? state.boardAsOf : void 0,
    live: state.kind === "drawn" ? state.boardLive : void 0,
    stored: state.kind === "drawn" ? state.stored : null,
    expanded,
    getBoard: () => hostRef.current?.querySelector(".hb-blocks") ?? null,
    getHost: () => hostRef.current
  });
  const library = useLibraryChrome({
    id,
    drawn: state.kind === "drawn",
    expanded
  });
  useEffect12(() => {
    if (expanded) closeRef.current?.focus();
  }, [expanded]);
  useEffect12(() => {
    if (!expanded) return;
    const root = hostRef.current;
    if (!root) return;
    const layer = pushLayer();
    const onKey = dialogKeys(root, layer, close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      popLayer(layer);
    };
  }, [expanded]);
  if (!validId && !streaming) return null;
  if (streaming || role === "unknown") return /* @__PURE__ */ jsx59(Note, { text: "drawing\u2026", pulse: true });
  if (role === "pointer") return /* @__PURE__ */ jsx59(LivePointer, { id, address });
  if (state.kind === "loading") return /* @__PURE__ */ jsx59(Note, { text: "drawing\u2026", pulse: true });
  if (state.kind === "failed") return null;
  const board = state;
  return /* @__PURE__ */ jsx59(BlockActions.Provider, { value: { ...actions, blockId: id }, children: /* @__PURE__ */ jsxs54("div", { className: "hb-tag", ...chrome.bind, children: [
    /* @__PURE__ */ jsx59(
      "button",
      {
        ref: expandRef,
        type: "button",
        className: "hb-expand",
        "aria-label": "Expand board",
        "aria-haspopup": "dialog",
        onClick: () => setExpanded(true),
        children: /* @__PURE__ */ jsx59(IconExpand, {})
      }
    ),
    chrome.menu,
    library.controls,
    /* @__PURE__ */ jsxs54(
      "div",
      {
        ref: hostRef,
        className: expanded ? "hb-board-host hb-board-overlay" : "hb-board-host",
        ...expanded ? { role: "dialog", "aria-modal": "true", "aria-label": "Expanded board" } : {},
        onClick: expanded ? (e) => e.target === e.currentTarget && close() : void 0,
        children: [
          expanded && /* @__PURE__ */ jsx59(
            "button",
            {
              ref: closeRef,
              type: "button",
              className: "hb-overlay-close",
              "aria-label": "Close expanded board",
              onClick: close,
              children: /* @__PURE__ */ jsx59(IconClose2, {})
            }
          ),
          chrome.dialogMenu,
          /* @__PURE__ */ jsx59(
            Blocks,
            {
              blocks: board.blocks,
              boardAlign: board.boardAlign,
              boardTextAlign: board.boardTextAlign,
              boardAsOf: board.boardAsOf,
              boardLive: board.boardLive,
              boardFollowUps: board.boardFollowUps,
              boardDensity: board.boardDensity,
              boardPalette: board.boardPalette,
              boardMotion: board.boardMotion
            }
          ),
          (live.version != null || live.links) && /* @__PURE__ */ jsx59(
            LiveRow,
            {
              id,
              version: live.version,
              updatedAt: live.updatedAt,
              links: live.links,
              viewing,
              onShow: setViewing,
              canReach: Boolean(actions.rest)
            }
          ),
          chrome.layer
        ]
      }
    ),
    library.dialog
  ] }) });
}
function Note({ text, pulse = false }) {
  return /* @__PURE__ */ jsx59("div", { className: pulse ? "hb-state hb-pulse" : "hb-state", children: text });
}
function IconExpand() {
  return /* @__PURE__ */ jsx59(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx59("path", { d: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" })
    }
  );
}
function IconClose2() {
  return /* @__PURE__ */ jsx59(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx59("path", { d: "M6 6l12 12M18 6L6 18" })
    }
  );
}

// src/styles/tokens.css
var tokens_default = `/* Hermes GenUI: every class starts with hb- so nothing leaks into the app.
   Colours come from Hermes's own theme variables, so blocks follow light and dark mode. */
.hb-blocks {
  --hb-ink: var(--foreground, #1f2328);
  --hb-ink-2: color-mix(in srgb, var(--hb-ink) 80%, transparent);
  --hb-muted: var(--ui-text-tertiary, color-mix(in srgb, var(--hb-ink) 55%, transparent));
  --hb-line: color-mix(in srgb, var(--hb-ink) 10%, transparent);
  --hb-card: color-mix(in srgb, var(--hb-ink) 3%, transparent);
  --hb-well: color-mix(in srgb, var(--hb-ink) 6%, transparent);
  --hb-accent: var(--theme-primary, #2f6fed);
  --hb-accent-soft: color-mix(in srgb, var(--hb-accent) 13%, transparent);
  --hb-accent-ink: color-mix(in srgb, var(--hb-accent) 85%, var(--hb-ink));
  --hb-good: var(--ui-success, #1a7f37);
  --hb-warn: #c2410c;
  /* The page behind the blocks, for the few marks that must hide what's under them (a progress checkpoint). */
  --hb-surface: var(--background, Canvas);
  /* A raised card (a chart's hover card). */
  --hb-shadow: 0 8px 28px rgba(15, 20, 30, 0.14), 0 1px 3px rgba(15, 20, 30, 0.1);
  /* Series colours in the order they are handed out, checked so neighbours stay apart for colour-blind readers:
     blue, amber, green, violet, cyan, red, lime, pink. */
  --hb-chart-1: #4f7cff;
  --hb-chart-2: #f59e0b;
  --hb-chart-3: #10b981;
  --hb-chart-4: #8b5cf6;
  --hb-chart-5: #06b6d4;
  --hb-chart-6: #ef4444;
  --hb-chart-7: #84cc16;
  --hb-chart-8: #ec4899;

  display: flex;
  flex-direction: column;
  /* The board's rhythm, kept as tokens so the model's \`density\` word can retighten them (enhancement #7).
     comfortable draws exactly what boards have always drawn: 10px between blocks, 8px above and below, and
     card padding 14/16 (shared.css reads the padding pair). */
  --hb-gap: 10px;
  --hb-margin: 8px;
  --hb-card-pad-y: 14px;
  --hb-card-pad-x: 16px;
  gap: var(--hb-gap, 10px);
  margin: var(--hb-margin, 8px) 0;
  /* A board stops at a comfortable reading width on a wide screen. */
  max-width: 1100px;
  color: var(--hb-ink);
  font-family: var(--dt-font-sans, inherit);
  font-size: 14px;
  line-height: 1.45;
}
/* Dark mode (Hermes puts .dark on the page): the warning orange lightened to read on a dark background, a deeper
   shadow. */
.dark .hb-blocks {
  --hb-warn: #f0883e;
  --hb-shadow: 0 8px 28px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
}
/* The model's look words (enhancement #7): core/Blocks.tsx grows these attributes from the stored envelope's
   density, palette and motion \u2014 and only for a word that isn't the default, so a board that never spoke them
   draws exactly what it always drew. There is no reader control that sets these; like alignment, the model's
   ask is the whole rule. */
/* compact: less air between cards, tighter margins, and less padding inside every card. Still semantic \u2014 the
   pixels live here in the renderer, never in the spec. */
.hb-blocks[data-density="compact"] {
  --hb-gap: 5px;
  --hb-margin: 4px;
  --hb-card-pad-y: 9px;
  --hb-card-pad-x: 12px;
}
/* cool: blues, teals and violets \u2014 neighbours stay apart the way the house set's do. */
.hb-blocks[data-palette="cool"] {
  --hb-chart-1: #4f7cff;
  --hb-chart-2: #0d9488;
  --hb-chart-3: #6366f1;
  --hb-chart-4: #06b6d4;
  --hb-chart-5: #8b5cf6;
  --hb-chart-6: #14b8a6;
  --hb-chart-7: #a5b4fc;
  --hb-chart-8: #38bdf8;
}
/* warm: reds, ambers and pinks, likewise. */
.hb-blocks[data-palette="warm"] {
  --hb-chart-1: #ef4444;
  --hb-chart-2: #f59e0b;
  --hb-chart-3: #ec4899;
  --hb-chart-4: #f97316;
  --hb-chart-5: #d946ef;
  --hb-chart-6: #ca8a04;
  --hb-chart-7: #fb7185;
  --hb-chart-8: #b45309;
}
/* reduced: this board settles every CSS animation and glide at once. The word only ADDS stillness \u2014 every
   prefers-reduced-motion media block in the stylesheets stays exactly as it was, so a reader whose system asks
   for less motion always gets less, whatever the model said. */
.hb-blocks[data-motion="reduced"] *,
.hb-blocks[data-motion="reduced"] {
  animation: none !important;
  transition: none !important;
}
/* A stronger line, for chart axes, checkboxes and inputs. */
.hb-blocks { --hb-line-strong: color-mix(in srgb, var(--hb-ink) 18%, transparent); }
.hb-blocks * { box-sizing: border-box; }
/* The chat wraps text "anywhere", which lets a label in a flex row shrink to one letter per line. Blocks wrap only
   between words (long words still break when they must). */
.hb-blocks { overflow-wrap: break-word; }
/* The chat's prose styles give images, figures and tables their own margins; blocks place their own. */
.hb-blocks img, .hb-blocks figure, .hb-blocks table { margin: 0; }
/* Block placement: a board puts a block off the left by drawing it inside a .hb-place box, which fills the column
   or cell just as the block did and keeps a plain block layout inside. That is the point: a block in a plain block
   context sizes exactly as it sized unwrapped (a capped card stays its cap, a fit-content table keeps hugging), and
   the auto margin then shares out only the space the block left over. A block that fills the width (a long line, a
   table card, prose) shifts by nothing. Never auto-margin a block in a flex column: the margin stops the stretch
   and the block collapses to its content. Left is how blocks sit already, so a board with no ask anywhere grows no
   .hb-place at all. */
.hb-place { display: flow-root; }
/* Round 4 (living updates, review defect 1): placement is a class change, never a re-wrap. Every block
   sits in ONE stable .hb-place root; when nothing was asked the root carries .hb-bare and generates no
   box at all \u2014 its block lays out, measures and exports exactly where an unwrapped block has always
   sat, so an unsaid board renders byte-identically while a flip to or from center cannot remount the
   live subtree. */
.hb-place.hb-bare { display: contents; }
/* Round 6 (t_64a23a22): placement outranks a block's own margin reset. chart (and the image/photos roots)
   reset their root margin to 0 \u2014 the host's prose styles give a figure one \u2014 and at EQUAL specificity that
   reset, loaded after tokens, silently vetoed the auto-margin by load order alone: a centered chart sat
   flush left while a calculator centered fine. The compound class raises placement above every root reset
   at once, so the one shared rule keeps sole authority over where a block sits. A block that fills its
   column still shares out nothing: the auto margins only divide leftover space, exactly as above. */
.hb-place.hb-place-center > * { margin-inline: auto; }
.hb-place.hb-place-right > * { margin-inline-start: auto; margin-inline-end: 0; }
/* Text voice: how the words inside a block read (the model's \`text_align\`, the block's word or the board's
   default). The voice is a class on the block's wrapper and reaches the words by inheritance; a text-align
   only moves words that sit in a line box filling the available width, so where a block keeps its words in
   a shrink-wrapped box, the voice first opens that box (below). The box stays exactly where placement put
   it, and only blocks whose draw is words (heading, text, stat, callout) ever carry it. Left is how words
   read anyway, so a board with no ask grows no class and no wrapper. */
.hb-ta-center { text-align: center; }
.hb-ta-right { text-align: right; }
/* The line width a voice needs (round 5 of the review): text-align is no property of a shrink-wrapped flex
   item \u2014 a body that hugs its words has no free line for the words to travel on. Every text-bearing kind is
   audited against that rule, and Chrome measures it (tests/test_layout_alignment.py): heading and text are
   block boxes that already fill their column; a lone stat card fills its column and its label, value and
   change lines stretch across the card; only the callout sets its words in a non-growing body beside the
   fixed icon, so where a voice asks, that body is opened to the row beside the icon. Scoped to the voice
   classes on purpose: a callout nobody asked about keeps every rect it always had. A new text-bearing kind
   joins TEXT_BEARING only once its words measure at their voice in the same Chrome probe. */
.hb-ta-center .hb-callout-body, .hb-ta-right .hb-callout-body { flex: 1 1 auto; min-width: 0; }
/* The provenance footer: the quiet lines a board grows when its envelope says as_of or live \u2014 the source on its
   own row, then the joined line: each chart's own source, the date \xB7 the word Live or Snapshot. The source row is
   a block column on purpose: placement through a .hb-place only shares out space a block context left over, and a
   place inside the join line's flex row would shrink-wrap to its content, parking every word back at the left
   edge (measured in Chrome: 29px where the board puts 800). As its own row it fills the footer's width exactly
   like a board's own column fills the board, so the placement machinery is the same one, untouched. The joins on
   the line are plain text (.hb-provenance-source needs no rule of its own \u2014 the line's voice already fits them).
   The badge always carries its word; colour (the existing good green for Live) only sits beside it. */
.hb-provenance {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--hb-muted);
}
.hb-provenance-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}
.hb-provenance .hb-source { font-size: inherit; }
.hb-provenance-dot { opacity: 0.7; }
.hb-provenance-badge {
  padding: 0 7px;
  border: 1px solid var(--hb-line-strong);
  border-radius: 999px;
  font-size: 10.5px;
  color: var(--hb-ink-2);
}
.hb-provenance-badge[data-live="live"] {
  color: var(--hb-good);
  border-color: color-mix(in srgb, var(--hb-good) 45%, transparent);
}
/* The follow-up strip: the quiet line of taps (core/FollowUps.tsx) a board grows when its envelope offers
   follow-ups. The row is width:0 + min-width:100% on purpose \u2014 the interactive-table tools row's shipped trick:
   it fills the board's column without ever contributing its own width to a fit-content hug, so the strip can
   never widen a board that hugs. Pills WRAP their labels and the row WRAPS its pills: the whole message is the
   point of the tap, so no board is too narrow to read one \u2014 height may grow, width never, nothing clips, no
   nowrap and no ellipsis (the review round-3 lesson, pinned in Chrome by tests/test_follow_ups_chrome.py).
   The word the strip says is only ever the host's own answer, and it follows the same rule. */
.hb-followups {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
  width: 0;
  min-width: 100%;
  box-sizing: border-box;
  padding: 2px 0 0;
}
.hb-followups-center { justify-content: center; }
.hb-followups-right { justify-content: flex-end; }
.hb-followups .hb-pill {
  flex: 0 1 auto;
  min-width: 0;
  min-height: 28px;
  padding: 4px 12px;
  font-size: 12px;
}
.hb-followups .hb-followup-label { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.hb-followups-said {
  flex: 0 1 auto;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--hb-muted);
}
`;

// src/styles/shared.css
var shared_default = "/* Pieces several blocks share: cards, chips, pill buttons and the motion they use. */\n/* Cards */\n.hb-card {\n  background: var(--hb-card);\n  border: 1px solid var(--hb-line);\n  border-radius: 16px;\n  /* The board's density tokens set the padding; without a board above (host chrome) it is what cards always had. */\n  padding: var(--hb-card-pad-y, 14px) var(--hb-card-pad-x, 16px);\n}\n.hb-card-title {\n  font-size: 16px;\n  line-height: 22px;\n  font-weight: 700;\n  letter-spacing: -0.01em;\n}\n/* Chips */\n.hb-chip {\n  display: inline-flex;\n  align-items: center;\n  align-self: flex-start;\n  gap: 4px;\n  padding: 2px 9px;\n  border-radius: 999px;\n  font-size: 12px;\n  font-weight: 600;\n  line-height: 18px;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.hb-chip-soft { background: var(--hb-accent-soft); color: var(--hb-accent-ink); }\n.hb-chip-good { background: color-mix(in srgb, var(--hb-good) 14%, transparent); color: var(--hb-good); }\n.hb-chip-warn { background: color-mix(in srgb, var(--hb-warn) 13%, transparent); color: var(--hb-warn); }\n.hb-chip-plain { background: var(--hb-well); color: var(--hb-ink-2); }\n/* Pill buttons that act (actions, button, a form's Send): soft for buttons in a reply, solid for a form's Send. */\n.hb-pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-height: 36px;\n  max-width: 100%;\n  padding: 7px 14px;\n  border: 0;\n  border-radius: 999px;\n  background: var(--hb-accent-soft);\n  color: var(--hb-accent-ink);\n  font: inherit;\n  font-size: 13.5px;\n  font-weight: 600;\n  line-height: 18px;\n  text-align: left;\n  text-decoration: none;\n  cursor: pointer;\n  transition: background 0.15s, transform 0.1s;\n}\n.hb-pill svg { flex: none; }\n.hb-pill:hover { background: color-mix(in srgb, var(--hb-accent) 22%, transparent); }\n.hb-pill:active { transform: scale(0.97); }\n.hb-pill:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }\n.hb-pill-solid { background: var(--hb-accent); color: #fff; }\n.hb-pill-solid:hover { background: color-mix(in srgb, var(--hb-accent) 86%, #000); }\n.hb-pill:disabled { opacity: 0.45; cursor: default; transform: none; }\n.hb-pill-solid:disabled:hover { background: var(--hb-accent); }\n/* Motion: a panel appearing (section, tabs, photo overlay) and a bar growing (bar, progress). */\n.hb-appear { animation: hb-appear 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }\n@keyframes hb-appear { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n@keyframes hb-grow { from { transform: scaleX(0); } }\n@media (prefers-reduced-motion: reduce) {\n  .hb-pill { transition: none; }\n  .hb-appear { animation: none; }\n}\n";

// src/host/blockTag.css
var blockTag_default = `/* The block tag's own states */
.hb-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 10px 14px;
  max-width: 100%;
  border-radius: 14px;
  background: color-mix(in srgb, var(--foreground, #1f2328) 5%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 13px;
}
.hb-pulse { animation: hb-pulse 1.2s ease-in-out infinite; }
@keyframes hb-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) {
  .hb-pulse { animation: none; }
}
/* Expand / full-screen board (host/BlockTag.tsx): the images strip's full-size overlay pattern, raised to a
   whole board \u2014 the photo scrim's own numbers (fixed, same z, same appear animation) and the same way of
   closing (Escape, the scrim, a close control). One honest correction: a stateless photo may be re-drawn at
   full size, a board may not \u2014 its blocks carry live state. So the host wrapper (.hb-board-host) is a plain
   block container at rest, costing the inline board nothing, and IS the dialog while expanded: the ONE drawn
   .hb-blocks is lifted into it, not duplicated, and settles back into flow on close. The control lives
   OUTSIDE .hb-blocks and out of flow (absolute); it stays quiet until the pointer is on the board or the key
   reaches it. Inside the dialog the board's 1100px reading cap lifts, so full-width blocks ride the wider
   container, while every .hb-blocks > X cap (the 720px cards, the fit-content table) is the board's own rule
   and keeps its number in both views. Chrome measures exactly that (tests/test_expand_fullscreen.py). */
.hb-tag { position: relative; }
.hb-expand {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #ffffff) 85%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  cursor: pointer;
  opacity: 0;
}
.hb-tag:hover .hb-expand, .hb-expand:focus-visible { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .hb-expand { transition: none; }
}
.hb-board-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.82);
  animation: hb-appear 0.18s ease-out;
}
/* A tall board in the dialog overflows the max-height box \u2014 and .hb-blocks is a flex column, so overflow
   beyond it is a SHRINK fight, not a scroll, for any child whose automatic minimum size is zero (the spec
   gives one to every card that sets overflow: hidden \u2014 the table card among them). The dialog is meant to
   SCROLL (overflow: auto above); children must therefore never shrink. Pre-existing defect, exposed by the
   export rework's real-browser coverage of a board taller than the viewport (t_bff8178a round 2): the table
   card collapsed to 6px and the grid slid up over its corner. One rule, inline boards untouched. */
.hb-board-overlay .hb-blocks > * { flex-shrink: 0; }
/* A bare (display:contents) root generates no box, so in the dialog column the flex item is the block
   INSIDE it: pass the no-shrink through. A placed (flow-root) root is itself the item and ignores the
   rule on its child, so this never changes an asked block's number. */
.hb-board-overlay .hb-blocks > .hb-place > * { flex-shrink: 0; }
/* The wider container, in the ONE shipped rule the swap experiment comments out: the expanded board box is a
   single element now \u2014 it sheds the reading cap and margin (folded into the panel's own padding) and carries
   the paper its old separate body used to draw. The caps are .hb-blocks > X rules, scoped to the board
   itself \u2014 this selector reaches none of them. */
.hb-board-overlay .hb-blocks {
  box-sizing: border-box;
  width: min(1600px, 100%);
  max-width: none;
  max-height: 100%;
  overflow: auto;
  margin: 0;
  padding: 24px;
  border-radius: 16px;
  background: var(--background, Canvas);
}
.hb-overlay-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
}
.hb-overlay-close:hover { background: rgba(0, 0, 0, 0.65); }
/* Export affordance (host/ExportChrome.tsx): deterministic host acts, zero requests \u2014 a chart's PNG (the SVG
   kinds and the DOM-drawn bars alike), a table's CSV, the whole board's Markdown or JSON from the envelope the
   page already holds. The board menu sits beside the expand control at rest and in the dialog's corner while
   expanded: quiet until the pointer is on the board or the key reaches it, and visible while its own menu is
   open. The per-block corner buttons live in a layer OUTSIDE .hb-blocks \u2014 inside the board host, so they ride
   the dialog when the board moves there. Every exportable block's button is ALWAYS in the DOM and in the tab
   order (keyboard readers reach it without a mouse); at rest it is merely invisible and unreachable to the
   pointer (opacity 0, pointer-events none \u2014 neither keeps focus away), and the pointer lights its corner while
   any focus, especially a keyboard one, shows it whole. The menu's word (a failure) and the corner's word (no
   2D painting here) WRAP: they may grow taller, never wider than their box, the rule every status word here
   keeps. Controls sit outside .hb-blocks, so --hb-* tokens are undefined here: the app tokens, with fallbacks.
   The host itself takes position:relative and no part in layout \u2014 it only anchors the layer. */
/* Anchors the corner layer at rest. The NOT guard is load-bearing: when the host IS the fixed dialog, its
   own rule below must keep position:fixed \u2014 a class of the same specificity later in this file would
   otherwise silently demote the dialog to static layout (round-2 Chrome caught it at the pixel level). */
.hb-board-host:not(.hb-board-overlay) { position: relative; }
.hb-export {
  position: absolute;
  top: 6px;
  right: 42px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #ffffff) 85%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  cursor: pointer;
  opacity: 0;
}
.hb-tag:hover .hb-export, .hb-export:focus-visible, .hb-export[aria-expanded="true"] { opacity: 1; }
/* While the board lives in the dialog, the menu keeps company with its close control. */
.hb-export-dialog { top: 14px; right: 56px; z-index: 3; }
.hb-export-menu {
  position: absolute;
  top: 38px;
  right: 42px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
  max-width: 240px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 10px;
  background: var(--background, #ffffff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.hb-export-menu > button {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--foreground, #1f2328);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.hb-export-menu > button:hover, .hb-export-menu > button:focus-visible {
  background: color-mix(in srgb, var(--foreground, #1f2328) 7%, transparent);
}
.hb-export-failed {
  padding: 4px 10px 6px;
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 12px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.hb-export-layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.hb-export-btn {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #ffffff) 88%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  cursor: pointer;
  opacity: 0;              /* invisible at rest, never in the pointer's way \u2014 and still in the tab order */
  pointer-events: none;
}
.hb-export-btn.lit, .hb-export-btn:hover, .hb-export-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
  color: var(--foreground, #1f2328);
  background: var(--background, #ffffff);
}
.hb-export-said {
  position: absolute;
  max-width: 220px;
  padding: 4px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #ffffff) 90%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 12px;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* --- the Library (enhancement #8) --------------------------------------------------------------
   The two new chrome controls stand beside the expand/export pair, quiet until the pointer or the
   keyboard reaches them \u2014 and a SAVED board keeps its pin lit at all times, because the pressed
   state is the file's truth, not the pointer's. The dialog is the one window-covering pattern of
   this host (the expand overlay's shape: fixed inset, dark field, centered sheet), so it shares
   .hb-overlay-close and the layer rules in core/overlays.ts. Controls sit OUTSIDE .hb-blocks, so
   the tokens here are the app's, with fallbacks, like every chrome rule above. */
.hb-pin {
  position: absolute;
  top: 6px;
  right: 78px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #ffffff) 85%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  cursor: pointer;
  opacity: 0;
}
.hb-lib {
  position: absolute;
  top: 6px;
  right: 114px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #ffffff) 85%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  cursor: pointer;
  opacity: 0;
}
.hb-tag:hover .hb-pin, .hb-pin:focus-visible, .hb-pin[aria-pressed="true"],
.hb-tag:hover .hb-lib, .hb-lib:focus-visible, .hb-lib[aria-expanded="true"] { opacity: 1; }
.hb-pin[aria-disabled="true"], .hb-lib[aria-disabled="true"] { cursor: default; }
.hb-pin[aria-pressed="true"] {
  color: var(--foreground, #1f2328);
  border-color: color-mix(in srgb, var(--foreground, #1f2328) 34%, transparent);
}
/* The pin's word: below the chrome row, wrapping inside the column \u2014 height may grow, width never
   (the rule every status word in this host keeps; it costs the inline board's DOM nothing). */
.hb-library-said {
  position: absolute;
  top: 38px;
  right: 6px;
  z-index: 1;
  max-width: min(320px, 100%);
  padding: 4px 10px 6px;
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 12px;
  text-align: right;
  background: color-mix(in srgb, var(--background, #ffffff) 85%, transparent);
  border-radius: 8px;
  white-space: normal;
  overflow-wrap: anywhere;
}
/* The new-chat shelf entry (chat.empty, review round 2): the same quiet button, but IN FLOW and always
   visible \u2014 there is no board to hover to reveal it. A pill with its word; the dialog it opens is the
   one shelf unchanged. */
.hb-library-entry {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.hb-lib-entry {
  position: static;
  opacity: 1;
  width: auto;
  height: auto;
  gap: 6px;
  padding: 5px 10px;
  color: var(--foreground, #1f2328);
}
.hb-lib-entry-label { font-size: 12px; font-weight: 550; }
.hb-library-entry .hb-library-said { position: static; text-align: left; padding: 4px 8px; }
.hb-library-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 12px;
  background: rgba(0, 0, 0, 0.82);
  animation: hb-appear 0.18s ease-out;
}
/* The entrance fade, under the same honest gate the chrome controls carry: this block MUST stay below
   the rule that declares the animation (same specificity \u2014 the later rule wins). Chrome reads the
   resting state (tests/test_library_chrome.py). */
@media (prefers-reduced-motion: reduce) {
  .hb-library-overlay { animation: none; }
}
.hb-library-dialog {
  position: relative;
  box-sizing: border-box;
  width: min(620px, 100%);
  max-height: 86vh;
  overflow: auto;
  padding: 18px 20px 20px;
  border-radius: 14px;
  background: var(--background, #ffffff);
  color: var(--foreground, #1f2328);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
}
.hb-library-close { color: #fff; }
.hb-library-title { font-size: 15px; font-weight: 600; margin: 2px 44px 10px 0; }
.hb-library-note {
  padding: 8px 2px;
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 13px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.hb-library-group { margin: 0 0 12px; }
.hb-library-head {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-tertiary, #6b7280);
  padding: 6px 0 4px;
}
.hb-library-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 8%, transparent);
}
.hb-library-open {
  flex: 1 1 180px;
  min-width: 0;
  display: block;
  padding: 4px 6px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--foreground, #1f2328);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  white-space: normal;
  overflow-wrap: anywhere;
}
.hb-library-open:hover:not(:disabled), .hb-library-open:focus-visible {
  background: color-mix(in srgb, var(--foreground, #1f2328) 7%, transparent);
}
.hb-library-open:disabled { cursor: default; color: var(--ui-text-tertiary, #6b7280); }
.hb-library-name { font-weight: 550; }
.hb-library-missing, .hb-library-here { color: var(--ui-text-tertiary, #6b7280); font-size: 12px; font-style: normal; }
.hb-library-tools { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.hb-library-tools > button {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 12%, transparent);
  border-radius: 7px;
  background: none;
  color: var(--ui-text-tertiary, #6b7280);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.hb-library-tools > button:hover:not(:disabled), .hb-library-tools > button:focus-visible {
  background: color-mix(in srgb, var(--foreground, #1f2328) 7%, transparent);
  color: var(--foreground, #1f2328);
}
.hb-library-tools > button:disabled { cursor: default; opacity: 0.5; }
.hb-library-tools > button[aria-pressed="true"] { color: #b8860b; border-color: currentColor; }
.hb-library-edit { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; min-width: 0; }
.hb-library-edit > input {
  flex: 1 1 140px;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 22%, transparent);
  border-radius: 7px;
  background: var(--background, #ffffff);
  color: var(--foreground, #1f2328);
  font: inherit;
  font-size: 13px;
}
.hb-library-attached { font-size: 12px; color: var(--ui-text-tertiary, #6b7280); white-space: normal; overflow-wrap: anywhere; }
/* The reopened board rides the same sheet: it gets the dialog's width, the flex-shrink guard the
   expand dialog proved necessary (a shrink fight is not a scroll), and no extra caps \u2014 the board's
   own .hb-blocks rules keep their numbers, so a reopen lays out the way the board laid out inline. */
.hb-library-board .hb-blocks > * { flex-shrink: 0; }
.hb-library-board .hb-blocks > .hb-place > * { flex-shrink: 0; }  /* bare contents root: pass through */
.hb-library-boardhead {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 0 44px 10px 0;
}
.hb-library-boardhead > button {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 12%, transparent);
  border-radius: 7px;
  background: none;
  color: var(--ui-text-tertiary, #6b7280);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.hb-library-boardhead > button:hover, .hb-library-boardhead > button:focus-visible {
  background: color-mix(in srgb, var(--foreground, #1f2328) 7%, transparent);
  color: var(--foreground, #1f2328);
}
.hb-library-boardtitle { font-size: 14px; font-weight: 600; white-space: normal; overflow-wrap: anywhere; }

/* --- Living Boards v1 (enhancement #9) -----------------------------------------------------------
   The quiet row a live board says under itself, and the pointer a later tag of the same address
   draws instead of a second board. Both sit OUTSIDE .hb-blocks (the board's own DOM is untouched)
   and animate nothing: with no motion of their own there is nothing for prefers-reduced-motion
   to still. Colors ride the app's own variables with fallbacks, as the chrome row's do. */
.hb-live {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: center;
  margin-top: 10px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 10%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background, #ffffff) 60%, transparent);
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.hb-live-line { display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.hb-live-mark { color: var(--ui-success, #1a7f37); }
.hb-live-version { font-weight: 600; color: var(--foreground, #1f2328); }
.hb-live-addr {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--foreground, #1f2328) 7%, transparent);
}
.hb-live-history, .hb-live-back, .hb-link-chip {
  border: 1px solid color-mix(in srgb, var(--foreground, #1f2328) 14%, transparent);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 1px 10px;
  cursor: pointer;
}
.hb-live-history[aria-pressed="true"], .hb-link-chip[aria-expanded="true"] {
  border-color: var(--theme-primary, #e0a83c);
  color: var(--foreground, #1f2328);
}
.hb-links { display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.hb-links-label { font-style: italic; }
.hb-link { display: contents; }
.hb-linked {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px dashed color-mix(in srgb, var(--foreground, #1f2328) 22%, transparent);
  border-radius: 10px;
}
.hb-linked-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.hb-linked-gone { color: var(--ui-text-tertiary, #6b7280); font-style: italic; }
.hb-live-pointer {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 6px 0;
  color: var(--ui-text-tertiary, #6b7280);
  font-size: 13px;
  overflow-wrap: anywhere;
}
`;

// src/blocks/atoms/atoms.css
var atoms_default = "/* Small pieces: heading, text, divider, badge, link, image, bar */\n.hb-heading { font-size: 16px; line-height: 22px; font-weight: 700; letter-spacing: -0.01em; margin-top: 4px; }\n.hb-text { color: var(--hb-ink-2); }\n.hb-text strong { color: var(--hb-ink); font-weight: 650; }\n.hb-divider { height: 1px; background: var(--hb-line); margin: 2px 0; }\n\n.hb-badge { display: flex; align-items: center; }\n.hb-link a {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--hb-accent-ink);\n  text-decoration: underline;\n  text-underline-offset: 2px;\n}\n.hb-image { margin: 0; display: flex; flex-direction: column; gap: 6px; }\n.hb-image img {\n  display: block;\n  width: 100%;\n  max-height: 300px;\n  object-fit: cover;\n  border: 1px solid var(--hb-line);\n  border-radius: 16px;\n  background: var(--hb-well);\n}\n.hb-image figcaption { padding: 0 4px; font-size: 12px; line-height: 16px; color: var(--hb-muted); }\n.hb-bar { display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 11px 14px; }\n.hb-bar-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 13px; }\n.hb-bar-label { flex: 1 0 auto; font-weight: 600; color: var(--hb-ink-2); }\n.hb-bar-amount { color: var(--hb-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }\n.hb-bar-track { height: 8px; border-radius: 999px; background: var(--hb-accent-soft); overflow: hidden; }\n.hb-bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--hb-accent); }\n.hb-bar-fill { transform-origin: left; animation: hb-grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1); }\n@media (prefers-reduced-motion: reduce) {\n  .hb-bar-fill { animation: none; }\n}\n";

// src/blocks/source/source.css
var source_default = ".hb-source { font-size: 11.5px; color: var(--hb-muted); }\n.hb-source a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }\n";

// src/blocks/callout/callout.css
var callout_default = ".hb-callout strong { color: var(--hb-ink); font-weight: 650; }\n.hb-callout {\n  display: flex;\n  gap: 10px;\n  padding: 11px 14px;\n  border-radius: 14px;\n  font-size: 13.5px;\n  line-height: 19px;\n}\n.hb-callout-icon { flex: none; margin-top: 1px; }\n.hb-callout-body { min-width: 0; color: var(--hb-ink-2); }\n.hb-callout-title { font-weight: 700; color: var(--hb-ink); }\n.hb-callout-info { background: var(--hb-accent-soft); }\n.hb-callout-info .hb-callout-icon { color: var(--hb-accent-ink); }\n.hb-callout-tip { background: color-mix(in srgb, var(--hb-good) 11%, transparent); }\n.hb-callout-tip .hb-callout-icon { color: var(--hb-good); }\n.hb-callout-warn { background: color-mix(in srgb, var(--hb-warn) 10%, transparent); }\n.hb-callout-warn .hb-callout-icon { color: var(--hb-warn); }\n";

// src/blocks/kpis/kpis.css
var kpis_default = "/* Headline numbers */\n/* Cards keep a readable width (130-200px) instead of stretching across a wide chat. */\n.hb-kpis {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(130px, 200px));\n  gap: 8px;\n}\n.hb-kpi { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 10px 12px; }\n.hb-kpi-label { font-size: 12px; font-weight: 500; color: var(--hb-muted); }\n.hb-kpi-value {\n  font-size: 22px;\n  line-height: 1.2;\n  font-weight: 650;\n  letter-spacing: -0.01em;\n  font-variant-numeric: tabular-nums;\n  overflow-wrap: anywhere;\n}\n.hb-kpi-value-text { font-size: 15px; font-weight: 700; }\n.hb-kpi-change { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }\n.hb-kpi-up { color: var(--hb-good); }\n.hb-kpi-down { color: var(--hb-warn); }\n.hb-kpi-flat { color: var(--hb-muted); }\n.hb-kpi-spark { display: block; width: 100%; height: 28px; margin-top: 6px; overflow: visible; }\n.hb-kpi-spark path {\n  fill: none;\n  stroke: var(--hb-chart-1);\n  stroke-width: 1.75;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n  vector-effect: non-scaling-stroke;\n}\n";

// src/blocks/cards/cards.css
var cards_default = `/* Cards: a compact wall of project cards. One border, one radius, one padding per card \u2014 no nested panels. A 2-up grid
   on a wide board, a single column when narrow. Colours are tokens only, so light/dark and every theme follow. */
.hb-cards { display: grid; gap: var(--hb-gap, 10px); }
.hb-cards-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.hb-cards-1 { grid-template-columns: 1fr; }

.hb-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: var(--hb-card-pad-y, 14px) var(--hb-card-pad-x, 16px);
  border: 1px solid var(--hb-line);
  border-radius: 14px;
  background: var(--hb-card);
}

.hb-card-head { display: flex; align-items: flex-start; gap: 10px; }
.hb-card-titles { min-width: 0; flex: 1; }
.hb-card-title { margin: 0; font-size: 15.5px; line-height: 20px; font-weight: 650; letter-spacing: -0.01em; }
.hb-card-id {
  margin-top: 2px;
  font-family: var(--dt-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10.5px;
  color: var(--hb-muted);
}

.hb-card-chip {
  flex: none;
  align-self: flex-start;
  padding: 1px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 16px;
  letter-spacing: 0.02em;
  text-transform: capitalize;
}

.hb-card-band { display: flex; align-items: center; gap: 14px; }
.hb-card-ring { flex: none; }
.hb-card-ring-label { font-size: 7px; font-weight: 600; fill: var(--hb-ink-2); }

.hb-card-metrics { flex: 1; min-width: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
.hb-card-metric { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; line-height: 16px; }
.hb-card-metric dt { color: var(--hb-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hb-card-metric dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

.hb-card-needs { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 12px; line-height: 16px; }
.hb-card-dot { flex: none; width: 7px; height: 7px; border-radius: 999px; background: currentColor; }

.hb-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px; }
.hb-card-fresh { font-size: 10.5px; color: var(--hb-muted); }
.hb-card-action {
  flex: none;
  padding: 3px 9px;
  border: 1px solid var(--hb-line);
  border-radius: 8px;
  background: transparent;
  color: var(--hb-accent-ink);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.hb-card-action:hover { background: var(--hb-accent-soft); }
.hb-card-action:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }

/* Compact boards retighten the card's own rhythm (the padding already follows the density tokens). */
.hb-blocks[data-density="compact"] .hb-card { gap: 6px; }
.hb-blocks[data-density="compact"] .hb-card-metrics { gap: 2px; }

.hb-tone-good { color: var(--hb-good); }
.hb-tone-warn { color: var(--hb-warn); }
.hb-tone-bad { color: var(--hb-warn); }
.hb-tone-neutral { color: var(--hb-muted); }

@media (prefers-reduced-motion: reduce) {
  .hb-card-action { transition: none; }
}


/* Card facts: owner \xB7 milestone \xB7 trend \xB7 budget \xB7 ARR (only the ones set). */
.hb-card-facts { display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 8px 0 0; padding: 8px 0 0; border-top: 1px dashed var(--hb-line); }
.hb-card-facts > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.hb-card-facts dt { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--hb-muted); }
.hb-card-facts dd { margin: 0; font-size: 12px; font-weight: 600; color: var(--hb-ink); }
`;

// src/blocks/tasks/tasks.css
var tasks_default = "/* Tasks: work-order / action-item cards. */\n.hb-tasks { margin: 0; padding: 14px 16px 10px; }\n.hb-task-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }\n.hb-task-hit { display: flex; gap: 10px; align-items: flex-start; width: 100%; text-align: left; background: none; border: 0; padding: 6px 8px; border-radius: 10px; font: inherit; color: inherit; }\nbutton.hb-task-hit { cursor: pointer; }\nbutton.hb-task-hit:hover { background: var(--hb-well); }\n.hb-task-box { flex: none; width: 18px; text-align: center; font-size: 13px; font-weight: 700; line-height: 20px; }\n.hb-task-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }\n.hb-task-title { font-size: 13.5px; font-weight: 600; line-height: 19px; }\n.hb-task-done { text-decoration: line-through; color: var(--hb-muted); }\n.hb-task-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--hb-muted); }\n.hb-task-owner { color: var(--hb-ink-2); }\n.hb-task-prio { text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700; font-size: 10px; }\n.hb-task-note { font-size: 11.5px; color: var(--hb-ink-2); }\n";

// src/blocks/result/result.css
var result_default = "/* Result: a delivered result card. */\n.hb-result { margin: 0; padding: 14px 16px 12px; border: 1px solid var(--hb-line); border-radius: 14px; background: var(--hb-card); }\n.hb-result-title { font-size: 14px; font-weight: 650; margin-bottom: 6px; }\n.hb-result-body { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--hb-ink); white-space: pre-wrap; }\n.hb-result-sources { margin: 10px 0 0; padding: 0 0 0 16px; font-size: 11.5px; color: var(--hb-muted); }\n.hb-result-sources a { color: var(--hb-accent-ink); }\n.hb-result-model { margin-top: 8px; font-size: 10.5px; color: var(--hb-muted); }\n";

// src/blocks/suggestions/suggestions.css
var suggestions_default = "/* Suggestions: proposed changes to accept or skip. */\n.hb-suggestions { margin: 0; padding: 14px 16px 10px; }\n.hb-sug-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }\n.hb-sug { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border: 1px solid var(--hb-line); border-radius: 10px; background: var(--hb-card); }\n.hb-sug-text { font-size: 13.5px; font-weight: 600; }\n.hb-sug-reason { font-size: 12px; color: var(--hb-muted); }\n.hb-sug-actions { display: flex; gap: 8px; margin-top: 4px; }\n.hb-sug-btn { padding: 3px 11px; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--hb-line); background: transparent; }\n.hb-sug-accept { color: var(--hb-good); border-color: color-mix(in srgb, var(--hb-good) 45%, transparent); }\n.hb-sug-accept:hover { background: color-mix(in srgb, var(--hb-good) 12%, transparent); }\n.hb-sug-skip { color: var(--hb-muted); }\n.hb-sug-skip:hover { background: var(--hb-well); }\n.hb-sug-btn:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }\n";

// src/blocks/timeline/timeline.css
var timeline_default = "/* Timeline */\n.hb-timeline { display: flex; flex-direction: column; gap: 14px; }\n.hb-timeline-group { display: flex; flex-direction: column; }\n.hb-timeline-group > .hb-chip { margin-bottom: 10px; }\n.hb-stop { display: grid; grid-template-columns: 46px 22px 1fr; column-gap: 8px; }\n.hb-stop-time {\n  padding-top: 2px;\n  text-align: right;\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--hb-muted);\n  font-variant-numeric: tabular-nums;\n}\n.hb-stop-rail { display: flex; flex-direction: column; align-items: center; }\n.hb-stop-dot {\n  display: grid;\n  place-items: center;\n  flex: none;\n  width: 22px;\n  height: 22px;\n  border-radius: 999px;\n  background: var(--hb-accent-soft);\n  color: var(--hb-accent-ink);\n}\n.hb-stop-pip { width: 6px; height: 6px; border-radius: 999px; background: var(--hb-accent); }\n.hb-stop-line { flex: 1; width: 1px; margin: 4px 0; background: var(--hb-line); }\n.hb-stop-body { min-width: 0; }\n.hb-stop-body-gap { padding-bottom: 14px; }\n.hb-stop-title { font-size: 14.5px; line-height: 21px; font-weight: 600; }\n.hb-stop-place {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  margin-top: 1px;\n  font-size: 12.5px;\n  color: var(--hb-muted);\n}\n.hb-stop-note { margin-top: 3px; font-size: 13px; line-height: 18px; color: var(--hb-ink-2); }\n";

// src/blocks/layout/layout.css
var layout_default = "/* Containers. A row's small cards (stats, badges) end at the same height; a tall block never sits in a row\n   (layout/read.ts draws that row as a stack). */\n.hb-row { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; }\n.hb-row-cell { flex: 1 1 140px; min-width: 0; display: flex; flex-direction: column; }\n.hb-row-cell > * { flex: 1; }\n/* A block placed inside a row cell: the wrapper takes the flex:1 above and the block fills it, ending at the\n   same height it would have sitting there directly. A bare round-4 root is NOT a box: the block it names is\n   the cell's flex child, so the flex:1 rule above never reaches it \u2014 pass the property through instead, and\n   leave the height rule to the placed wrappers it was written for. */\n.hb-row-cell > .hb-place:not(.hb-bare) > * { height: 100%; }\n.hb-row-cell > .hb-bare > * { flex: 1; }\n/* Grid: each cell keeps its block's own height, top-aligned in its row. */\n.hb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; align-items: start; }\n.hb-grid-cell { min-width: 0; display: flex; flex-direction: column; }\n.hb-row-cell-own { flex: none; align-self: center; }\n.hb-section { display: flex; flex-direction: column; gap: 8px; }\n.hb-section-body { display: flex; flex-direction: column; gap: 10px; }\n.hb-section .hb-card { background: var(--hb-well); border-color: transparent; }\n.hb-section-toggle {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  padding: 0;\n  border: 0;\n  background: none;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n.hb-section-toggle .hb-card-title { flex: 1; min-width: 0; }\n.hb-chevron { flex: none; color: var(--hb-muted); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }\n.hb-chevron-open { transform: rotate(90deg); }\n/* Tabs: underlined tab buttons in a bar that scrolls sideways when they don't fit, above one panel of blocks. */\n.hb-tabs { display: flex; flex-direction: column; gap: 10px; min-width: 0; }\n.hb-tab-bar {\n  display: flex;\n  gap: 2px;\n  overflow-x: auto;\n  scrollbar-width: none;\n  border-bottom: 1px solid var(--hb-line);\n}\n.hb-tab-bar::-webkit-scrollbar { display: none; }\n.hb-tab {\n  flex: none;\n  margin-bottom: -1px;\n  padding: 7px 12px 8px;\n  border: 0;\n  border-bottom: 2px solid transparent;\n  border-radius: 8px 8px 0 0;\n  background: none;\n  color: var(--hb-muted);\n  font: inherit;\n  font-size: 13.5px;\n  font-weight: 600;\n  white-space: nowrap;\n  cursor: pointer;\n  transition: color 0.15s, border-color 0.15s, background 0.15s;\n}\n.hb-tab:hover { color: var(--hb-ink-2); background: var(--hb-well); }\n.hb-tab-on, .hb-tab-on:hover { color: var(--hb-accent-ink); border-bottom-color: var(--hb-accent); background: none; }\n.hb-tab:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: -2px; }\n.hb-tab-panel { display: flex; flex-direction: column; gap: 10px; min-width: 0; }\n\n/* Columns: dashboards side by side, each block at its own height (a short card beside a tall one stays short). */\n.hb-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 10px; align-items: start; }\n.hb-column { min-width: 0; display: flex; flex-direction: column; gap: 10px; }\n/* Beside other blocks a table's card fills its column or cell (on its own it hugs its columns); a place around it\n   changes nothing about that. */\n:is(.hb-column, .hb-grid-cell) > .hb-table-card,\n:is(.hb-column, .hb-grid-cell) > .hb-place > .hb-table-card { width: auto; }\n";

// src/blocks/chart/chart.css
var chart_default = "/* Charts are drawn at their real width and fill their place inside a layout block (a column, a cell, a tab). At the\n   top of a reply, placed or not, they stop at 720px; a long line (60+ points) takes the board's full width. */\n.hb-chart { margin: 0; padding: 14px 16px 10px; }\n.hb-blocks > .hb-chart:not(.hb-chart-wide),\n.hb-blocks > .hb-place > .hb-chart:not(.hb-chart-wide) { max-width: 720px; }\n.hb-chart-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.hb-chart-title {\n  display: block;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--hb-muted);\n}\n.hb-chart-figure { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; min-width: 0; }\n.hb-chart-big {\n  font-size: 28px;\n  line-height: 1.15;\n  font-weight: 800;\n  letter-spacing: -0.03em;\n  font-variant-numeric: tabular-nums;\n}\n.hb-chart-at {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  color: var(--hb-muted);\n  font-variant-numeric: tabular-nums;\n}\n.hb-chart-other { margin-left: 8px; }\n.hb-chart-plot { position: relative; margin-top: 8px; }\n.hb-chart-svg { display: block; width: 100%; overflow: visible; touch-action: none; user-select: none; }\n.hb-chart-svg:focus-visible, .hb-pie-svg:focus-visible, .hb-hbar-grid:focus-visible {\n  outline: 2px solid var(--hb-accent);\n  outline-offset: 4px;\n  border-radius: 4px;\n}\n.hb-chart-source { margin-top: 2px; text-align: right; font-size: 11px; color: var(--hb-muted); }\n\n/* Marks and text inside the drawings */\n.hb-chart-axis, .hb-chart-tick { font-size: 11px; fill: var(--hb-muted); font-variant-numeric: tabular-nums; }\n.hb-chart-value { font-size: 11.5px; font-weight: 500; fill: var(--hb-ink-2); font-variant-numeric: tabular-nums; }\n.hb-chart-end { font-size: 11.5px; font-weight: 600; fill: var(--hb-ink); font-variant-numeric: tabular-nums; }\n/* Text drawn over lines (a change line's Start label): a rim of the page's colour behind the letters. */\n.hb-chart-halo { paint-order: stroke; stroke: var(--hb-surface); stroke-width: 3px; stroke-linejoin: round; }\n.hb-chart-rule { stroke: var(--hb-line); }\n.hb-chart-rule-strong { stroke: var(--hb-line-strong); }\n.hb-chart-dot { stroke: var(--hb-surface); stroke-width: 2; }\n/* A spot where several points coincide: a small \xD7n badge beside the dot (the dots never move; a repeated\n   click cycles the spot's points \u2014 Chart.tsx). A rim of the page colour keeps it readable over the dots. */\n.hb-chart-cluster { font-size: 9.5px; font-weight: 700; pointer-events: none; paint-order: stroke;\n  stroke: var(--hb-surface); stroke-width: 3px; stroke-linejoin: round; }\n.hb-chart-svg g, .hb-hbar-bar { transition: opacity 0.15s; }\n.hb-chart-draw { animation: hb-chart-draw 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }\n@keyframes hb-chart-draw { to { stroke-dashoffset: 0; } }\n\n/* The hover card (ChartTip) */\n.hb-tip {\n  position: absolute;\n  top: 0;\n  left: 0;\n  z-index: 5;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 120px;\n  padding: 8px 10px;\n  border: 1px solid var(--hb-line);\n  border-radius: 8px;\n  background: var(--hb-surface);\n  box-shadow: var(--hb-shadow);\n  color: var(--hb-ink);\n  font-size: 12.5px;\n  line-height: 1.35;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n  pointer-events: none;\n  opacity: 0;\n  transition: opacity 120ms ease;\n}\n.hb-tip-on { opacity: 1; }\n.hb-tip-title, .hb-tip-note { font-size: 11.5px; color: var(--hb-muted); }\n.hb-tip-row { display: flex; align-items: center; gap: 8px; }\n.hb-tip-row i { flex: none; width: 8px; height: 8px; border-radius: 2px; }\n.hb-tip-name { flex: 1; color: var(--hb-ink-2); }\n.hb-tip-value { margin-left: 12px; font-weight: 600; }\n\n@media (prefers-reduced-motion: reduce) {\n  .hb-chart-draw { animation: none; stroke-dashoffset: 0; }\n  .hb-tip, .hb-chart-svg g, .hb-hbar-bar, .hb-slice, .hb-pie-legend tr { transition: none; }\n}\n\n.hb-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  margin-top: 6px;\n  font-size: 12px;\n  line-height: 16px;\n  color: var(--hb-muted);\n}\n.hb-legend-item { display: inline-flex; align-items: center; gap: 6px; }\n.hb-legend-dot { flex: none; width: 10px; height: 10px; border-radius: 999px; }\n.hb-legend-value { color: var(--hb-ink-2); font-variant-numeric: tabular-nums; }\n\n/* Pie and donut: the legend sits beside the drawing from 440px wide, below it when narrower. It stops at 420px so\n   amounts stay near their names when the donut fills a wide section. */\n.hb-pie { container-type: inline-size; }\n.hb-pie-body { position: relative; display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }\n@container (min-width: 440px) {\n  .hb-pie-body { flex-direction: row; align-items: center; gap: 20px; }\n  .hb-pie-body .hb-pie-svg { margin: 0; }\n}\n.hb-pie-svg { display: block; flex: none; margin: 0 auto; user-select: none; }\n.hb-pie-total { font-size: 17px; font-weight: 650; fill: var(--hb-ink); font-variant-numeric: tabular-nums; }\n.hb-slice { cursor: pointer; stroke: var(--hb-surface); stroke-width: 2; stroke-linejoin: round; transition: opacity 0.15s; }\n.hb-pie-legend { flex: 1; min-width: 0; max-width: 420px; border-collapse: collapse; font-size: 13px; line-height: 18px; font-variant-numeric: tabular-nums; }\n.hb-pie-legend tr { cursor: pointer; transition: opacity 0.15s; }\n.hb-pie-legend td { padding: 3px 12px 3px 0; vertical-align: top; }\n.hb-pie-legend td:last-child { padding-right: 0; }\n.hb-pie-swatch { width: 10px; }\n.hb-pie-swatch i { display: block; width: 10px; height: 10px; margin-top: 4px; border-radius: 3px; }\n.hb-pie-name { width: 100%; color: var(--hb-ink-2); overflow-wrap: anywhere; }\n.hb-pie-value { text-align: right; font-weight: 600; white-space: nowrap; }\n.hb-pie-share { text-align: right; color: var(--hb-muted); white-space: nowrap; }\n\n/* Horizontal bars: label | bar | value on each row. */\n.hb-hbar-box { position: relative; margin: 10px 0 4px; }\n.hb-hbar-grid {\n  display: grid;\n  grid-template-columns: fit-content(40%) minmax(0, 1fr) max-content;\n  gap: 8px 12px;\n  align-items: center;\n  font-size: 13px;\n}\n.hb-hbar-label { min-width: 64px; line-height: 17px; color: var(--hb-ink-2); }\n.hb-hbar-tracks, .hb-hbar-values { display: flex; flex-direction: column; gap: 4px; }\n.hb-hbar-track { position: relative; height: 14px; }\n.hb-hbar-zero { position: absolute; top: -4px; bottom: -4px; width: 1px; background: var(--hb-line-strong); }\n.hb-hbar-bar { position: absolute; top: 0; bottom: 0; border-radius: 3px; }\n.hb-hbar-value { line-height: 14px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }\n.hb-hbar-many .hb-hbar-track { height: 12px; }\n.hb-hbar-many .hb-hbar-value { font-size: 12px; line-height: 12px; }\n.hb-hbar-up { color: var(--hb-good); }\n.hb-hbar-down { color: var(--hb-warn); }\n\n/* The drill-down detail (ChartDetail.tsx): one datum, focused, over the whole window \u2014 the same scrim, the same\n   z and appear as the photo strip's full-size view and the host's expanded board, and the same close control. It\n   mounts BESIDE the chart figure, never inside the card: a card that transforms or contains its own box \u2014 every\n   entrance animation does, and Chrome measures a fixed descendant then resolving to that box, not the window\n   (probed on Chrome 157; the container-type the pie already carries alone does NOT contain fixed) \u2014 would shrink\n   an inside-mounted overlay to the card. Out of flow, the sibling mount costs the board's widths nothing \u2014\n   Chrome measures exactly that (tests/test_chart_drilldown_overlay.py). */\n.hb-chart-detail {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 32px;\n  background: rgba(0, 0, 0, 0.82);\n  animation: hb-appear 0.18s ease-out;\n}\n/* Gate its own entrance AFTER the rule that declares it, so the cascade actually settles it: with reduced\n   motion the scrim rests at the window's true corner (Chrome measures the -4px the animation starts at). */\n@media (prefers-reduced-motion: reduce) {\n  .hb-chart-detail { animation: none; }\n}\n.hb-chart-detail-card {\n  box-sizing: border-box;\n  width: min(440px, 100%);\n  max-height: 100%;\n  overflow: auto;\n  padding: 20px 22px 18px;\n  border-radius: 16px;\n  background: var(--hb-surface);\n  box-shadow: var(--hb-shadow);\n  color: var(--hb-ink);\n}\n.hb-chart-detail-where { font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--hb-muted); }\n.hb-chart-detail-title { margin-top: 2px; font-size: 24px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; overflow-wrap: anywhere; }\n.hb-detail-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-top: 10px;\n  padding-top: 10px;\n  border-top: 1px solid var(--hb-line);\n  font-size: 14px;\n  font-variant-numeric: tabular-nums;\n}\n.hb-detail-row i { flex: none; width: 10px; height: 10px; border-radius: 3px; }\n.hb-detail-name { flex: 1; min-width: 0; color: var(--hb-ink-2); overflow-wrap: anywhere; }\n.hb-detail-value { font-weight: 700; text-align: right; overflow-wrap: anywhere; }\n.hb-detail-note { margin-top: 10px; font-size: 12.5px; color: var(--hb-muted); }\n.hb-detail-source { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--hb-line); font-size: 11.5px; text-align: right; color: var(--hb-muted); }\n\n\n/* Gauge: one value on a half-circle scale against a target. */\n.hb-gauge { margin: 0; padding: 14px 16px 10px; }\n.hb-gauge-svg { display: block; width: 100%; max-width: 240px; height: auto; }\n.hb-gauge-big { font-size: 20px; font-weight: 700; fill: var(--hb-ink); font-variant-numeric: tabular-nums; }\n.hb-gauge-sub { font-size: 10.5px; fill: var(--hb-muted); }\n.hb-gauge-min, .hb-gauge-max { font-size: 10px; fill: var(--hb-muted); font-variant-numeric: tabular-nums; }\n.hb-gauge-value { transition: stroke-dashoffset 0.6s ease; }\n.hb-gauge-hit { stroke: var(--hb-good); }\n\n/* Bullet: actual vs target strips with qualitative bands. */\n.hb-bullet { margin: 0; padding: 14px 16px 10px; }\n.hb-bullet-rows { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }\n.hb-bullet-row { display: grid; grid-template-columns: minmax(72px, 30%) 1fr auto; align-items: center; gap: 10px; }\n.hb-bullet-label { font-size: 12px; color: var(--hb-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.hb-bullet-track { position: relative; display: block; height: 14px; border-radius: 4px; background: var(--hb-well); overflow: hidden; }\n.hb-bullet-band { position: absolute; top: 0; height: 100%; background: var(--hb-line); }\n.hb-bullet-value { position: absolute; left: 0; top: 4px; height: 6px; border-radius: 3px; background: var(--hb-accent); }\n.hb-bullet-target { position: absolute; top: 0; width: 2px; height: 100%; background: var(--hb-ink); transform: translateX(-1px); }\n.hb-bullet-num { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--hb-ink); white-space: nowrap; }\n.hb-bullet-goal { color: var(--hb-muted); }\n\n@media (prefers-reduced-motion: reduce) { .hb-gauge-value { transition: none; } }\n\n\n/* Funnel: ordered stages, each narrowed, step conversion between rows. */\n.hb-funnel { margin: 0; padding: 14px 16px 10px; }\n.hb-funnel-rows { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }\n.hb-funnel-row { display: grid; grid-template-columns: minmax(72px,26%) 1fr auto; align-items: center; gap: 10px; }\n.hb-funnel-label { font-size: 12px; color: var(--hb-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.hb-funnel-track { display: block; }\n.hb-funnel-bar { display: inline-flex; align-items: center; justify-content: flex-end; min-width: 34px; height: 22px; padding: 0 8px; border-radius: 5px; background: var(--hb-accent-soft); border-left: 3px solid var(--hb-accent); }\n.hb-funnel-value { font-size: 11.5px; font-weight: 600; color: var(--hb-ink); font-variant-numeric: tabular-nums; }\n.hb-funnel-conv { font-size: 11px; color: var(--hb-muted); font-variant-numeric: tabular-nums; min-width: 34px; text-align: right; }\n\n/* Pareto: sorted bars with a cumulative-share line. */\n.hb-pareto { margin: 0; padding: 14px 16px 10px; }\n.hb-pareto-plot { position: relative; height: 160px; margin-top: 10px; }\n.hb-pareto-line { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }\n.hb-pareto-bars { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: space-around; }\n.hb-pareto-bar { position: relative; display: flex; align-items: flex-end; }\n.hb-pareto-bar-fill { display: block; width: 100%; height: 100%; border-radius: 3px 3px 0 0; background: var(--hb-accent-soft); border-top: 2px solid var(--hb-accent); }\n.hb-pareto-axis, .hb-pareto-cum { display: flex; justify-content: space-around; margin-top: 4px; }\n.hb-pareto-label { font-size: 10px; color: var(--hb-muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.hb-pareto-cum-cell { font-size: 10px; color: var(--hb-muted); text-align: center; font-variant-numeric: tabular-nums; }\n\n\n/* Waterfall: a bridge of signed steps. */\n.hb-waterfall { margin: 0; padding: 14px 16px 10px; }\n.hb-waterfall-svg { display: block; width: 100%; height: 150px; }\n.hb-waterfall-axis { display: flex; margin-top: 4px; }\n.hb-waterfall-label { font-size: 10px; color: var(--hb-muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.hb-waterfall-net { margin-top: 4px; font-size: 11.5px; color: var(--hb-muted); text-align: right; }\n\n/* Radar: measures on shared axes. */\n.hb-radar { margin: 0; padding: 14px 16px 10px; }\n.hb-radar-svg { display: block; width: 100%; max-width: 280px; height: auto; margin: 0 auto; }\n.hb-radar-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; justify-content: center; }\n.hb-radar-key { font-size: 11px; color: var(--hb-ink-2); display: inline-flex; align-items: center; gap: 5px; }\n.hb-radar-key i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }\n.hb-radar-axes { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 6px; }\n.hb-radar-axis-label { font-size: 10.5px; color: var(--hb-muted); }\n\n\n/* Control chart (SPC). */\n.hb-control { margin: 0; padding: 14px 16px 10px; }\n.hb-control-svg { display: block; width: 100%; height: 150px; }\n.hb-control-note { margin-top: 4px; font-size: 11px; color: var(--hb-muted); font-variant-numeric: tabular-nums; }\n\n/* Bubble. */\n.hb-bubble { margin: 0; padding: 14px 16px 10px; }\n.hb-bubble-svg { display: block; width: 100%; max-width: 320px; height: auto; margin: 0 auto; }\n.hb-bubble-legend { margin-top: 4px; font-size: 11px; color: var(--hb-muted); text-align: center; }\n\n\n/* Box plot. */\n.hb-box { margin: 0; padding: 14px 16px 10px; }\n.hb-box-svg { display: block; width: 100%; height: 150px; }\n.hb-box-axis { display: flex; margin-top: 4px; }\n.hb-box-label { font-size: 10.5px; color: var(--hb-muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.hb-box-note { margin-top: 4px; font-size: 11px; color: var(--hb-muted); text-align: right; }\n\n/* Treemap. */\n.hb-treemap { margin: 0; padding: 14px 16px 10px; }\n.hb-treemap-field { position: relative; width: 100%; aspect-ratio: 16 / 10; }\n.hb-treemap-cell { position: absolute; overflow: hidden; padding: 4px 5px; border: 1px solid var(--hb-surface); border-radius: 3px; display: flex; flex-direction: column; gap: 1px; color: #fff; }\n.hb-treemap-label { font-size: 10.5px; font-weight: 600; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.35); }\n.hb-treemap-value { font-size: 10px; opacity: 0.9; }\n";

// src/blocks/images/images.css
var images_default = "/* Photos */\n.hb-photos { margin: 0; display: flex; flex-direction: column; gap: 8px; }\n.hb-photo-strip {\n  display: flex;\n  gap: 10px;\n  overflow-x: auto;\n  padding-bottom: 6px;\n  scroll-snap-type: x mandatory;\n  scrollbar-width: thin;\n}\n.hb-photo {\n  flex: 0 0 220px;\n  display: flex;\n  flex-direction: column;\n  justify-content: flex-start;\n  align-items: stretch;\n  height: auto;\n  margin: 0;\n  padding: 0;\n  overflow: hidden;\n  border: 1px solid var(--hb-line);\n  border-radius: 14px;\n  background: var(--hb-card);\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: zoom-in;\n  scroll-snap-align: start;\n}\n.hb-photo img { display: block; width: 100%; height: 150px; object-fit: cover; background: var(--hb-well); }\n.hb-photo-text { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px 10px; }\n.hb-photo-caption {\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  font-size: 13px;\n  line-height: 17px;\n  font-weight: 600;\n}\n.hb-photo-source { font-size: 11.5px; color: var(--hb-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.hb-photo-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483000;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  padding: 32px;\n  background: rgba(0, 0, 0, 0.82);\n  cursor: zoom-out;\n  animation: hb-appear 0.18s ease-out;\n}\n.hb-photo-overlay img { margin: 0; max-width: 100%; max-height: calc(100% - 48px); border-radius: 10px; object-fit: contain; }\n.hb-photo-overlay-text { max-width: 720px; text-align: center; font-size: 14px; color: rgba(255, 255, 255, 0.92); }\n.hb-photo-overlay-text span { color: rgba(255, 255, 255, 0.6); }\n";

// src/blocks/table/table.css
var table_default = `/* Tables */
/* A table keeps its natural width (columns close together); the card hugs it. It scrolls inside the card: sideways
   when wider than the chat, down past 520px with the header kept in view. */
.hb-table-card { width: fit-content; max-width: 100%; padding: 4px 0 0; overflow: hidden; }
.hb-table-caption { padding: 10px 16px 2px; }
.hb-table-scroll { max-height: 520px; overflow: auto; overscroll-behavior: contain; }
.hb-table {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13.5px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}
/* With 3 or more columns, a narrow chat scrolls the table rather than squeezing every column. */
.hb-table-wide { min-width: 420px; }
.hb-table th, .hb-table td {
  height: 36px;
  padding: 8px 12px;
  border: 0;
  border-bottom: 1px solid var(--hb-line);
  background: none;
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}
/* The header stays in view as the rows scroll; it is painted like the card so rows don't show through. */
.hb-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 34px;
  padding: 0;
  border-bottom-color: var(--hb-line-strong);
  background: linear-gradient(var(--hb-card), var(--hb-card)), var(--hb-surface);
}
.hb-table th button {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--hb-muted);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}
.hb-table th.hb-num button { justify-content: flex-end; }
.hb-table .hb-first, .hb-table th.hb-first button { padding-left: 16px; }
.hb-table td:last-child, .hb-table th:last-child button { padding-right: 16px; }
.hb-table tbody tr:last-child td { border-bottom: 0; }
.hb-table td.hb-first { font-weight: 600; }
.hb-table td.hb-num { text-align: right; }
.hb-table td.hb-wrap { min-width: 180px; white-space: normal; }
/* Sorting: a faint \u2195 on the header under the pointer, \u2191 or \u2193 on the sorted one. */
.hb-sort { opacity: 0; font-weight: 400; letter-spacing: 0; transition: opacity 0.12s; }
.hb-table th:hover .hb-sort, .hb-table th button:focus-visible .hb-sort { opacity: 0.6; }
.hb-table th.hb-sorted .hb-sort { opacity: 1; color: var(--hb-ink-2); }
/* The best row: an accent edge on its first cell and a chip; the best column: an accent line under its header. */
.hb-table tr.hb-best td.hb-first { box-shadow: inset 3px 0 0 var(--hb-accent); }
.hb-table th.hb-best-col { box-shadow: inset 0 -2px 0 var(--hb-accent); }
.hb-table .hb-chip { margin-left: 8px; vertical-align: 1px; padding: 0 7px; font-size: 11px; line-height: 16px; letter-spacing: 0; text-transform: none; }
.hb-table th .hb-chip { margin-left: 4px; }
/* Changes: green for a rise, orange for a fall, with a small bar growing from the middle. */
.hb-table td.hb-up { color: var(--hb-good); }
.hb-table td.hb-down { color: var(--hb-warn); }
.hb-mini { display: inline-block; position: relative; width: 56px; height: 8px; margin-right: 8px; vertical-align: 0; }
.hb-mini-zero { position: absolute; top: -3px; bottom: -3px; left: 50%; width: 1px; background: var(--hb-line-strong); }
.hb-mini-bar { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: currentColor; }
.hb-table td.hb-table-empty { color: var(--hb-muted); font-weight: 400; text-align: center; }
/* Interactive tables (interactive: true): a quiet search line above the rows and a tick on each row.
   The tools row is width:0 + min-width:100% on purpose: it fills the card without ever contributing its
   own width to the fit-content hug \u2014 the card keeps hugging the columns, not the controls. */
.hb-table-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 0;
  min-width: 100%;
  box-sizing: border-box;
  padding: 4px 16px 8px;
}
.hb-table-filter {
  flex: 1 1 90px;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--hb-line-strong);
  border-radius: 999px;
  background: var(--hb-surface);
  color: var(--hb-ink);
  font: inherit;
  font-size: 12.5px;
}
.hb-table-filter::placeholder { color: var(--hb-muted); }
.hb-table-filter:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 1px; }
.hb-table-tools .hb-pill { flex: 0 1 auto; min-width: 0; height: 28px; font-size: 12px; }
/* A card that hugs a narrow table gives the pill less room than its words; they wrap inside the pill \u2014
   the button never clips them, and its accessible name and title carry them whole regardless. */
.hb-table-tools .hb-pill-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* Where the last tap went. The tools row is width:0 inside a fit-content card, so these words can never
   widen the table they talk about \u2014 and they WRAP rather than clip: the recovery instructions are the whole
   point of the word, so no card is too narrow to read it. A narrow hug grows the card TALLER, never wider. */
.hb-table-sent { flex: 0 1 auto; min-width: 0; white-space: normal; overflow-wrap: anywhere;
  font-size: 12px; color: var(--hb-muted); }
/* The tick column hugs its checkbox and carries the left indent; the data columns keep their own padding,
   so the whole cost of opting in is exactly the width of this one column \u2014 never anything from the tools. */
.hb-table th.hb-pick, .hb-table td.hb-pick { width: 1%; padding: 0 2px 0 16px; }
.hb-table .hb-pick input[type="checkbox"] { margin: 0; width: 15px; height: 15px; accent-color: var(--hb-accent); }
@media (prefers-reduced-motion: reduce) { .hb-sort { transition: none; } }
.hb-section .hb-table-card { background: none; border: 0; }
`;

// src/blocks/list/list.css
var list_default = "/* List */\n.hb-list { padding: 4px 0; overflow: hidden; }\n.hb-list-heading { padding: 8px 16px 2px; font-size: 13px; font-weight: 700; color: var(--hb-muted); }\n.hb-list-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px;\n  border-top: 1px solid var(--hb-line);\n  color: inherit;\n  text-decoration: none;\n}\n.hb-list > .hb-list-row:first-child, .hb-list-heading + .hb-list-row { border-top: 0; }\n.hb-list-link { cursor: pointer; transition: background 0.15s; }\n.hb-list-link:hover { background: var(--hb-well); }\n.hb-list-rank {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: 28px;\n  height: 28px;\n  border-radius: 999px;\n  background: var(--hb-accent-soft);\n  color: var(--hb-accent-ink);\n  font-size: 13px;\n  font-weight: 700;\n  font-variant-numeric: tabular-nums;\n}\n.hb-list-photo { flex: none; width: 44px; height: 44px; border-radius: 12px; object-fit: cover; background: var(--hb-well); }\n.hb-list-icon {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  border-radius: 12px;\n  background: var(--hb-accent-soft);\n  color: var(--hb-accent-ink);\n}\n.hb-list-initial {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  border-radius: 999px;\n  color: #fff;\n  font-size: 15px;\n  font-weight: 700;\n}\n.hb-list-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }\n.hb-list-title { font-size: 14.5px; line-height: 20px; font-weight: 600; overflow-wrap: anywhere; }\n.hb-list-subtitle {\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  margin-top: 1px;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--hb-muted);\n}\n.hb-list-value { flex: none; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }\n.hb-list-chevron { flex: none; color: var(--hb-muted); }\n.hb-section .hb-list { padding: 0; }\n\n/* List rows that send a message when tapped */\n.hb-list-button {\n  width: 100%;\n  margin: 0;\n  border: 0;\n  border-top: 1px solid var(--hb-line);\n  background: none;\n  font: inherit;\n  text-align: left;\n}\n.hb-list-button:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: -2px; }\n";

// src/blocks/heatmap/heatmap.css
var heatmap_default = "/* Heatmap */\n.hb-heatmap { display: flex; flex-direction: column; gap: 8px; }\n.hb-heat-grid { display: grid; gap: 4px; align-items: center; }\n.hb-heat-col {\n  overflow: hidden;\n  text-align: center;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11px;\n  font-weight: 600;\n  color: var(--hb-muted);\n}\n.hb-heat-row {\n  max-width: 96px;\n  padding-right: 6px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  font-weight: 600;\n}\n.hb-heat-cell {\n  display: grid;\n  place-items: center;\n  min-width: 0;\n  height: 32px;\n  margin: 0;\n  padding: 0 2px;\n  overflow: hidden;\n  border: 0;\n  border-radius: 8px;\n  color: var(--hb-ink);\n  font: inherit;\n  font-size: 11.5px;\n  font-weight: 600;\n  line-height: 1;\n  font-variant-numeric: tabular-nums;\n  cursor: pointer;\n}\n.hb-heat-cell:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 1px; }\n.hb-heat-picked { font-size: 12.5px; color: var(--hb-muted); font-variant-numeric: tabular-nums; }\n.hb-heat-picked b { font-weight: 600; color: var(--hb-ink); }\n";

// src/blocks/flip/flip.css
var flip_default = "/* Flash cards: a grid of cards, each turning over in 3D on a tap to a softly tinted answer. A card grows with its\n   text: both faces sit in one grid cell, so the longer side sets its height, and the cards in a row share the row's. */\n.hb-flip { display: flex; flex-direction: column; gap: 8px; }\n/* At most --hb-flip-cols columns (set from the card count so the last row isn't a lone card), at least 200px each. */\n.hb-flip-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(max(200px, calc((100% - (var(--hb-flip-cols, 4) - 1) * 10px) / var(--hb-flip-cols, 4))), 1fr));\n  gap: 10px;\n}\n.hb-flip-card {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  min-width: 0;\n  margin: 0;\n  padding: 0;\n  border: 0;\n  background: none;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  perspective: 1000px;\n}\n.hb-flip-inner {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  min-height: 150px;\n  transform-style: preserve-3d;\n  transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n/* A photo on any card makes every card at least as tall as a photo card needs, so the rows stay even. */\n.hb-flip-tall .hb-flip-inner { min-height: 220px; }\n.hb-flip-turned { transform: rotateY(180deg); }\n.hb-flip-face {\n  grid-area: 1 / 1;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  overflow: hidden;\n  padding: 12px 14px;\n  border-radius: 12px;\n  border: 1px solid var(--hb-line);\n  backface-visibility: hidden;\n  -webkit-backface-visibility: hidden;\n}\n.hb-flip-front { background: var(--hb-card); }\n.hb-flip-card:hover .hb-flip-front { border-color: var(--hb-line-strong); }\n/* The answer side: a soft wash of the accent over the page colour, text in the normal ink. */\n.hb-flip-back {\n  transform: rotateY(180deg);\n  background: linear-gradient(var(--hb-accent-soft), var(--hb-accent-soft)), var(--hb-surface);\n  border-color: color-mix(in srgb, var(--hb-accent) 30%, transparent);\n}\n.hb-flip-card:focus-visible .hb-flip-face { outline: 2px solid var(--hb-accent); outline-offset: 2px; }\n.hb-flip-label {\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--hb-muted);\n  font-variant-numeric: tabular-nums;\n}\n.hb-flip-back .hb-flip-label { color: var(--hb-accent-ink); }\n.hb-flip-question, .hb-flip-answer { flex: 1; display: flex; align-items: center; min-height: 0; }\n.hb-flip-question { font-size: 14.5px; line-height: 1.35; font-weight: 600; }\n.hb-flip-answer { font-size: 13.5px; line-height: 1.45; }\n.hb-flip-foot { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--hb-muted); }\n.hb-flip-back img { display: block; flex: none; width: calc(100% + 28px); height: 96px; margin: -12px -14px 4px; object-fit: cover; }\n@media (prefers-reduced-motion: reduce) {\n  .hb-flip-inner, .hb-flip-turned { transition: none; transform: none; }\n  .hb-flip-face, .hb-flip-back { transform: none; backface-visibility: visible; -webkit-backface-visibility: visible; transition: opacity 0.2s; }\n  .hb-flip-inner:not(.hb-flip-turned) .hb-flip-back, .hb-flip-turned .hb-flip-front { opacity: 0; }\n}\n";

// src/blocks/flow/flow.css
var flow_default = "/* Flow: boxes joined by arrows, left to right (.hb-flow-right) or top to bottom (.hb-flow-down). A group is a dashed\n   frame with its label (and count) on top; the lit box (from a steps block) gets the accent outline; boxes a walk\n   hasn't reached are dimmed; a box's chips fade in when they change; a tapped box's note opens in a panel under the\n   diagram. */\n.hb-flow { display: flex; flex-direction: column; gap: 10px; }\n.hb-flow-box { position: relative; width: 100%; min-width: 0; }\n.hb-flow-chain { display: flex; margin: 0; padding: 0; list-style: none; }\n.hb-flow-step { display: flex; align-items: center; min-width: 0; }\n.hb-flow-right { flex-direction: row; align-items: stretch; }\n.hb-flow-right .hb-flow-chain { flex-direction: row; }\n.hb-flow-right .hb-flow-step { flex: 1 1 0; align-items: stretch; }\n.hb-flow-right .hb-flow-arrow { align-self: center; }\n.hb-flow-down, .hb-flow-down .hb-flow-chain { flex-direction: column; align-items: stretch; }\n.hb-flow-down .hb-flow-step { flex-direction: column; align-items: stretch; }\n.hb-flow-arrow { display: grid; place-items: center; flex: none; width: 24px; color: var(--hb-muted); }\n.hb-flow-down .hb-flow-arrow { width: auto; height: 22px; }\n.hb-flow-down .hb-flow-arrow svg { transform: rotate(90deg); }\n.hb-flow-node {\n  position: relative;\n  display: flex;\n  flex: 1;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  min-height: 44px;\n  margin: 0;\n  padding: 8px 10px;\n  border: 1px solid var(--hb-line-strong);\n  border-radius: 10px;\n  background: var(--hb-surface);\n  color: inherit;\n  font: inherit;\n  font-size: 13px;\n  line-height: 1.3;\n  font-weight: 600;\n  text-align: left;\n  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;\n}\n.hb-flow-right .hb-flow-node { flex-direction: column; justify-content: center; text-align: center; }\nbutton.hb-flow-node { cursor: pointer; }\nbutton.hb-flow-node:hover { border-color: var(--hb-accent); }\nbutton.hb-flow-node:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }\n.hb-flow-open { background: var(--hb-accent-soft); border-color: color-mix(in srgb, var(--hb-accent) 45%, transparent); }\n.hb-flow-lit { border-color: var(--hb-accent); box-shadow: 0 0 0 2px var(--hb-accent); }\n.hb-flow-icon {\n  display: grid;\n  place-items: center;\n  flex: none;\n  width: 24px;\n  height: 24px;\n  border-radius: 999px;\n  background: var(--hb-accent-soft);\n  color: var(--hb-accent-ink);\n}\n.hb-flow-label { min-width: 0; }\n.hb-flow-more { margin-left: auto; color: var(--hb-muted); font-weight: 400; }\n.hb-flow-right .hb-flow-more { position: absolute; top: 2px; right: 6px; font-size: 12px; }\n.hb-flow-group {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  gap: 6px;\n  min-width: 0;\n  padding: 6px;\n  border: 1px dashed var(--hb-line-strong);\n  border-radius: 12px;\n  background: var(--hb-card);\n}\n.hb-flow-group-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; }\n.hb-flow-down .hb-flow-group-head { justify-content: flex-start; }\n.hb-flow-group-label { font-size: 11.5px; font-weight: 600; color: var(--hb-muted); text-align: center; }\n.hb-flow-down .hb-flow-group-label { text-align: left; }\n.hb-flow-down .hb-flow-node { flex-wrap: wrap; }\n.hb-flow-holds { display: flex; flex-wrap: wrap; gap: 3px; animation: hb-flow-fade 0.2s ease-out; }\n.hb-flow-right .hb-flow-holds { justify-content: center; }\n.hb-flow-down .hb-flow-holds { flex-basis: 100%; }\n@keyframes hb-flow-fade { from { opacity: 0; } }\n.hb-flow-chip {\n  padding: 1px 6px;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  background: var(--hb-well);\n  color: var(--hb-ink-2);\n  font: 11.5px/16px ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-weight: 400;\n  white-space: nowrap;\n}\n.hb-flow-chip-accent { background: var(--hb-accent-soft); color: var(--hb-accent-ink); font-weight: 700; }\n/* A box the pass hasn't reached yet: faint, its chips only outlined. */\n.hb-flow-idle { color: var(--hb-muted); }\n.hb-flow-idle .hb-flow-holds { opacity: 0.6; }\n.hb-flow-idle .hb-flow-chip { border-style: dashed; border-color: var(--hb-line-strong); background: none; color: var(--hb-muted); font-family: inherit; }\n.hb-flow-packet {\n  position: absolute;\n  top: 0;\n  left: 0;\n  z-index: 3;\n  width: 12px;\n  height: 12px;\n  margin: -6px 0 0 -6px;\n  border-radius: 999px;\n  background: var(--hb-accent);\n  box-shadow: 0 0 0 4px var(--hb-accent-soft), 0 0 14px var(--hb-accent);\n  opacity: 0;\n  pointer-events: none;\n}\n.hb-flow-right .hb-flow-group > .hb-flow-chain { flex: 1; }\n.hb-flow-panel {\n  padding: 10px 12px;\n  border-radius: 10px;\n  background: linear-gradient(var(--hb-accent-soft), var(--hb-accent-soft)), var(--hb-surface);\n  border: 1px solid color-mix(in srgb, var(--hb-accent) 30%, transparent);\n}\n.hb-flow-panel-title { font-size: 13px; font-weight: 700; color: var(--hb-accent-ink); }\n.hb-flow-note { margin: 2px 0 0; font-size: 13.5px; line-height: 1.5; }\n@media (prefers-reduced-motion: reduce) {\n  .hb-flow-node { transition: none; }\n  .hb-flow-holds { animation: none; }\n}\n";

// src/blocks/steps/steps.css
var steps_default = `/* Steps: one step at a time; its place top right, the step's title and text, an optional photo, then a row of dots
   and Back / Next. */
.hb-steps { display: flex; flex-direction: column; gap: 10px; }
.hb-steps-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.hb-steps-place {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--hb-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.hb-steps-body { display: flex; flex-direction: column; gap: 4px; min-height: 64px; }
.hb-steps-title { font-size: 15px; line-height: 21px; font-weight: 650; }
.hb-steps-text { margin: 0; font-size: 14px; line-height: 1.5; color: var(--hb-ink-2); }
.hb-steps-photo { display: block; width: 100%; max-height: 220px; margin-top: 6px; border-radius: 10px; object-fit: cover; }
.hb-steps-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.hb-steps-dots { display: flex; flex-wrap: wrap; gap: 2px; }
/* Each dot is a 24px target with a small mark inside. */
.hb-steps-dot {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.hb-steps-dot::after {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--hb-line-strong);
  transition: background 0.15s, width 0.15s;
}
.hb-steps-dot-on::after { width: 18px; background: var(--hb-accent); }
.hb-steps-dot:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: -2px; border-radius: 999px; }
.hb-steps-moves { display: flex; gap: 6px; margin-left: auto; }
@media (prefers-reduced-motion: reduce) {
  .hb-steps-dot::after { transition: none; }
}
`;

// src/blocks/layers/layers.css
var layers_default = `/* Layers: the stack on a canvas beside the slab's note, Back / Next and the slab list (side by side when there is
   room, else the list under the drawing). The note and Back / Next use the steps block's classes. */
.hb-layers { display: flex; flex-direction: column; gap: 10px; container-type: inline-size; }
.hb-layers-body { display: grid; gap: 14px; }
@container (min-width: 640px) { .hb-layers-body { grid-template-columns: minmax(0, 1fr) 230px; align-items: start; } }
.hb-layers-stage { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.hb-layers-canvas {
  display: block;
  width: 100%;
  height: clamp(280px, 52cqi, 440px);
  border: 1px solid var(--hb-line);
  border-radius: 12px;
  background: var(--hb-surface);
  cursor: grab;
  touch-action: pan-y;
}
.hb-layers-canvas:active { cursor: grabbing; }
.hb-layers-canvas:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }
.hb-layers-hint, .hb-layers-caption { margin: 0; font-size: 12px; color: var(--hb-muted); }
.hb-layers-caption { font-size: 12.5px; color: var(--hb-ink-2); }
.hb-layers-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
/* Top slab first, as in the drawing. */
.hb-layers-list { display: flex; flex-direction: column-reverse; gap: 4px; margin: 0; padding: 0; list-style: none; }
.hb-layers-slab {
  width: 100%;
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--hb-line-strong);
  border-radius: 8px;
  background: var(--hb-surface);
  color: var(--hb-ink-2);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.hb-layers-slab[aria-pressed="true"] { border-color: var(--hb-accent); background: var(--hb-accent-soft); color: var(--hb-accent-ink); font-weight: 650; }
.hb-layers-slab:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }
`;

// src/blocks/progress/progress.css
var progress_default = "/* Progress: a track toward a goal, with checkpoints */\n.hb-progress {\n  background: color-mix(in srgb, var(--hb-good) 9%, transparent);\n  border-color: color-mix(in srgb, var(--hb-good) 22%, transparent);\n}\n.hb-progress-head { display: flex; align-items: center; gap: 8px; }\n.hb-progress-head .hb-card-title { min-width: 0; }\n.hb-progress-icon { display: flex; color: var(--hb-good); }\n.hb-progress-amount {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  margin-left: auto;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--hb-ink-2);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.hb-progress-amount svg { color: var(--hb-good); }\n.hb-progress-track {\n  display: block;\n  height: 8px;\n  margin: 16px 0 4px;\n  overflow: hidden;\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--hb-good) 20%, transparent);\n}\n.hb-progress-fill { transform-origin: left; animation: hb-grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1); }\n.hb-progress-fill { display: block; height: 100%; border-radius: 999px; background: var(--hb-good); }\n.hb-progress-nodes { position: relative; height: 24px; margin-top: 16px; }\n.hb-progress-track-steps { position: absolute; top: 8px; margin: 0; }\n.hb-progress-fill-steps { position: absolute; top: 8px; height: 8px; }\n.hb-progress-node {\n  position: absolute;\n  top: 0;\n  display: grid;\n  place-items: center;\n  width: 32px;\n  height: 24px;\n  margin-left: -16px;\n  border: 2px solid color-mix(in srgb, var(--hb-good) 35%, var(--hb-surface));\n  border-radius: 999px;\n  background: var(--hb-surface);\n  color: color-mix(in srgb, var(--hb-good) 75%, var(--hb-surface));\n}\n.hb-progress-node-done { border-color: var(--hb-good); background: var(--hb-good); color: #fff; }\n.hb-progress-labels { display: grid; margin-top: 8px; }\n.hb-progress-labels span {\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  padding: 0 2px;\n  text-align: center;\n  font-size: 11.5px;\n  line-height: 14px;\n  font-weight: 500;\n  color: var(--hb-muted);\n  overflow-wrap: anywhere;\n}\n@media (prefers-reduced-motion: reduce) {\n  .hb-progress-fill { animation: none; }\n}\n";

// src/blocks/streak/streak.css
var streak_default = "/* Streak */\n.hb-streak { padding: 0; overflow: hidden; }\n.hb-streak-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px 12px; }\n.hb-streak-label {\n  font-size: 12px;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--hb-accent-ink);\n}\n.hb-streak-count {\n  font-size: 32px;\n  line-height: 38px;\n  font-weight: 800;\n  letter-spacing: -0.03em;\n  font-variant-numeric: tabular-nums;\n}\n.hb-streak-count span { text-transform: capitalize; }\n.hb-streak-medal {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: 56px;\n  height: 56px;\n  margin-left: auto;\n  border-radius: 999px;\n  color: #fff;\n  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--hb-chart-2) 45%, #fff), var(--hb-chart-2) 55%,\n    color-mix(in srgb, var(--hb-chart-2) 75%, #000));\n  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--hb-chart-2) 70%, transparent);\n}\n.hb-streak-week { display: grid; padding: 12px 8px; border-top: 1px solid var(--hb-line); }\n.hb-streak-day { display: flex; flex-direction: column; align-items: center; gap: 6px; }\n.hb-streak-day-label { font-size: 12.5px; color: var(--hb-muted); }\n.hb-streak-done {\n  display: grid;\n  place-items: center;\n  width: 32px;\n  height: 32px;\n  border-radius: 999px;\n  background: var(--hb-accent-soft);\n  color: var(--hb-accent-ink);\n}\n.hb-streak-date {\n  display: grid;\n  place-items: center;\n  width: 32px;\n  height: 32px;\n  font-size: 16px;\n  color: var(--hb-muted);\n  font-variant-numeric: tabular-nums;\n}\n.hb-streak-dot { width: 4px; height: 4px; border-radius: 999px; }\n.hb-streak-today .hb-streak-day-label, .hb-streak-today .hb-streak-date { font-weight: 700; color: var(--hb-ink); }\n.hb-streak-today .hb-streak-dot { background: var(--hb-ink-2); }\n";

// src/blocks/actions/actions.css
var actions_default = "/* A row of pill buttons (the pills themselves are in styles/shared.css). */\n.hb-actions { display: flex; flex-wrap: wrap; gap: 8px; }\n";

// src/blocks/tiles/tiles.css
var tiles_default = "/* Tiles: cover cards. A card's reason (its subtitle) reads at a glance, never by hovering: the text is in flow, so\n   a card grows to fit a long reason (its height is never fixed by an aspect, which would clip it), rows keep equal\n   heights, and the text keeps strong contrast on every wash with full white, a shadow and a firm scrim under it. */\n.hb-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }\n.hb-tile {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  justify-content: flex-end;\n  min-height: 158px;\n  margin: 0;\n  padding: 12px 12px 12px 14px;\n  overflow: hidden;\n  border: 0;\n  border-radius: 20px;\n  color: #fff;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n.hb-tile:hover { transform: translateY(-1px); }\n.hb-tile:active { transform: scale(0.98); }\n.hb-tile:disabled { cursor: default; transform: none; }\n.hb-tile-static { cursor: default; }\n.hb-tile-static:hover,\n.hb-tile-static:active { transform: none; }\n.hb-tile:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }\n.hb-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }\n.hb-tile-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(12, 8, 24, 0.5) 65%, rgba(12, 8, 24, 0.88) 100%); }\n.hb-tile-icon {\n  position: absolute;\n  top: 12px;\n  left: 12px;\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  border: 1px solid rgba(255, 255, 255, 0.35);\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.22);\n  backdrop-filter: blur(8px);\n}\n/* A card that grows to the very top keeps its title clear of the icon chip (an engine without :has only loses\n   this clearance in the rare tall+icon case, never the text itself). */\n.hb-tile:has(.hb-tile-icon) { padding-top: 52px; }\n.hb-tile-text { position: relative; display: flex; flex-direction: column; gap: 3px; min-width: 0; }\n.hb-tile-title { font-size: 15.5px; line-height: 20px; font-weight: 700; letter-spacing: -0.01em; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3); }\n.hb-tile-subtitle {\n  font-size: 12.5px;\n  line-height: 16px;\n  color: #fff;\n  text-shadow: 0 1px 2px rgba(12, 8, 24, 0.55);\n}\n@media (prefers-reduced-motion: reduce) {\n  .hb-tile { transition: none; }\n}\n";

// src/blocks/checklist/checklist.css
var checklist_default = "/* Checklist */\n.hb-checklist { display: flex; flex-direction: column; }\n.hb-checklist-head { display: flex; align-items: baseline; gap: 8px; }\n.hb-checklist-head .hb-card-title { flex: 1; min-width: 0; }\n.hb-checklist-count {\n  margin-left: auto;\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--hb-muted);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.hb-checklist-count-done { color: var(--hb-good); }\n.hb-checklist-track { display: block; height: 6px; margin: 8px 0 4px; overflow: hidden; border-radius: 999px; background: var(--hb-well); }\n.hb-checklist-fill { display: block; height: 100%; border-radius: 999px; background: var(--hb-good); transition: width 0.3s ease; }\n.hb-checklist-group { padding: 10px 0 2px; font-size: 12px; font-weight: 700; color: var(--hb-muted); }\n.hb-check {\n  display: flex;\n  align-items: flex-start;\n  gap: 12px;\n  width: 100%;\n  margin: 0;\n  padding: 7px 0;\n  border: 0;\n  background: none;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n.hb-check:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; border-radius: 8px; }\n.hb-check-mark {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: 22px;\n  height: 22px;\n  margin-top: 0.5px;\n  border: 2px solid var(--hb-line-strong);\n  border-radius: 999px;\n  color: var(--hb-muted);\n  font-size: 11px;\n  font-weight: 700;\n  font-variant-numeric: tabular-nums;\n  transition: background 0.15s, border-color 0.15s;\n}\n.hb-check-on .hb-check-mark { border-color: var(--hb-good); background: var(--hb-good); color: #fff; }\n.hb-check-text { flex: 1; min-width: 0; font-size: 14.5px; line-height: 21px; transition: color 0.15s; }\n.hb-check-on .hb-check-text { color: var(--hb-muted); text-decoration: line-through; text-decoration-thickness: 1px; }\n@media (prefers-reduced-motion: reduce) {\n  .hb-checklist-fill, .hb-check-mark, .hb-check-text { transition: none; }\n}\n";

// src/blocks/calculator/calculator.css
var calculator_default = "/* Calculator; a form's slider uses the same .hb-calc-head, .hb-calc-label, .hb-calc-value and .hb-range. */\n.hb-calc { display: flex; flex-direction: column; }\n/* At the top of a reply sliders stop at 720px rather than stretching across a wide board, placed or not; in a\n   layout block they fill their place. */\n.hb-blocks > .hb-calc, .hb-blocks > .hb-place > .hb-calc { max-width: 720px; }\n.hb-calc-slider { display: block; padding: 8px 0; }\n.hb-calc-head { display: flex; align-items: baseline; gap: 8px; }\n.hb-calc-label { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; color: var(--hb-ink-2); }\n.hb-calc-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }\n.hb-range { display: block; width: 100%; margin: 8px 0 0; accent-color: var(--hb-accent); cursor: pointer; }\n.hb-calc-ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--hb-muted); font-variant-numeric: tabular-nums; }\n.hb-calc-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px; }\n/* A calculator's live chart sits in the calculator's card, so it drops its own card look. */\n.hb-calc > .hb-chart { margin-top: 10px; padding: 10px 0 0; border: 0; border-top: 1px solid var(--hb-line); border-radius: 0; background: none; }\n.hb-calc-result { min-width: 0; padding: 10px 14px; border-radius: 14px; background: var(--hb-accent-soft); }\n.hb-calc-result-label { font-size: 12px; font-weight: 600; color: var(--hb-accent-ink); }\n.hb-calc-result-value {\n  margin-top: 2px;\n  font-size: 20px;\n  line-height: 1.2;\n  font-weight: 800;\n  letter-spacing: -0.02em;\n  font-variant-numeric: tabular-nums;\n  overflow-wrap: anywhere;\n}\n";

// src/blocks/simulate/simulate.css
var simulate_default = `/* Simulation: a title with the view switch, then Play, the time scrubber and the sliders, then the piles of dots or
   the line chart. The sliders use the calculator's .hb-calc-slider and .hb-range; the legend the chart's. */
.hb-sim { display: flex; flex-direction: column; gap: 12px; container-type: inline-size; }
.hb-blocks > .hb-sim, .hb-blocks > .hb-place > .hb-sim { max-width: 720px; }
.hb-sim-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.hb-sim-switch { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--hb-well); }
.hb-sim-switch button {
  min-height: 30px;
  padding: 5px 12px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--hb-ink-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.hb-sim-switch button[aria-pressed="true"] { background: var(--hb-surface); color: var(--hb-ink); box-shadow: 0 1px 2px var(--hb-line-strong); }
.hb-sim-switch button:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 1px; }
.hb-sim-controls { display: grid; grid-template-columns: 1fr; gap: 0 18px; align-items: center; }
@container (min-width: 560px) { .hb-sim-controls { grid-template-columns: auto 1fr 1fr; } }
.hb-sim-play { justify-self: start; }
.hb-sim-piles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.hb-sim-pile { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.hb-sim-pile-name { font-size: 12.5px; font-weight: 600; color: var(--hb-ink-2); }
.hb-sim-amount { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.hb-sim-canvas { display: block; width: 100%; border-bottom: 1px solid var(--hb-line-strong); }
.hb-sim-chart { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.hb-sim-chart svg { display: block; overflow: visible; }
.hb-sim-chart text { font-size: 11px; fill: var(--hb-muted); font-variant-numeric: tabular-nums; }
.hb-sim-grid { stroke: var(--hb-line); }
.hb-sim-line { fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.hb-sim-point { fill: currentColor; stroke: var(--hb-surface); stroke-width: 2; }
`;

// src/blocks/form/form.css
var form_default = "/* Form: at most 720px wide at the top of a reply (like a calculator), placed or not, filling its place in a\n   layout block. */\n.hb-blocks > .hb-form, .hb-blocks > .hb-place > .hb-form { max-width: 720px; }\n.hb-form-field { display: block; padding: 8px 0; }\n.hb-form fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }\n.hb-form-sent fieldset { opacity: 0.6; }\n.hb-form-label { display: block; margin-bottom: 6px; font-size: 13.5px; font-weight: 600; color: var(--hb-ink-2); }\n.hb-input {\n  display: block;\n  width: 100%;\n  min-width: 0;\n  height: 38px;\n  padding: 0 12px;\n  border: 1px solid var(--hb-line-strong);\n  border-radius: 12px;\n  background: var(--hb-surface);\n  color: var(--hb-ink);\n  font: inherit;\n  font-size: 14px;\n  color-scheme: light dark;\n}\ntextarea.hb-input { height: auto; padding: 8px 12px; line-height: 20px; resize: vertical; }\n.hb-input:focus { outline: 2px solid var(--hb-accent); outline-offset: -1px; }\n.hb-input::placeholder { color: var(--hb-muted); }\n.hb-options { display: flex; flex-wrap: wrap; gap: 8px; }\n.hb-option {\n  min-height: 34px;\n  max-width: 100%;\n  margin: 0;\n  padding: 6px 14px;\n  border: 1px solid var(--hb-line-strong);\n  border-radius: 999px;\n  background: none;\n  color: var(--hb-ink);\n  font: inherit;\n  font-size: 13.5px;\n  line-height: 18px;\n  text-align: left;\n  cursor: pointer;\n  transition: background 0.15s, border-color 0.15s;\n}\n.hb-option:hover { background: var(--hb-well); }\n.hb-option-on, .hb-option-on:hover { border-color: var(--hb-accent); background: var(--hb-accent-soft); color: var(--hb-accent-ink); font-weight: 600; }\n.hb-option:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }\n.hb-option:disabled { cursor: default; }\n.hb-form-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 8px; }\n.hb-form-done { flex: 1; font-size: 12.5px; font-weight: 600; color: var(--hb-good); }\n/* Form extras: group headings, option notes, a select's note and a slider's end words */\n.hb-form-group { padding: 12px 0 0; font-size: 12px; font-weight: 700; color: var(--hb-muted); }\n.hb-option-note { display: block; font-size: 11.5px; line-height: 15px; font-weight: 400; color: var(--hb-muted); }\n.hb-option-on .hb-option-note { color: var(--hb-accent-ink); }\n.hb-form-note { display: block; margin-top: 4px; font-size: 12px; line-height: 16px; color: var(--hb-muted); }\n.hb-form-ends { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; font-size: 11px; color: var(--hb-muted); }\n@media (prefers-reduced-motion: reduce) {\n  .hb-option { transition: none; }\n}\n";

// src/styles/index.ts
var STYLE_PARTS = [
  tokens_default,
  shared_default,
  blockTag_default,
  atoms_default,
  source_default,
  callout_default,
  kpis_default,
  cards_default,
  tasks_default,
  result_default,
  suggestions_default,
  timeline_default,
  layout_default,
  chart_default,
  images_default,
  table_default,
  list_default,
  heatmap_default,
  flip_default,
  flow_default,
  steps_default,
  layers_default,
  progress_default,
  streak_default,
  actions_default,
  tiles_default,
  checklist_default,
  calculator_default,
  simulate_default,
  form_default
];
var styles_default = STYLE_PARTS.join("\n");

// src/plugin.tsx
import { jsx as jsx60 } from "react/jsx-runtime";
var ID4 = "hermes-genui";
var STYLE_ID = "hermes-genui-css";
function injectStyles() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = styles_default;
}
var plugin_default = {
  id: ID4,
  name: "Hermes GenUI",
  register(ctx) {
    injectStyles();
    const load = (blockId) => ctx.rest(`/blocks/${blockId}`);
    const rest = (path, init) => ctx.rest(path, init);
    const send = (text, opts) => composerActions(host?.composer).send(text, opts);
    const fill = (text) => composerActions(host?.composer).fill(text);
    ctx.register({
      id: "hermes-genui-tag",
      area: TRANSCRIPT_DIRECTIVE_AREA,
      data: {
        name: "blocks",
        render: ({ attrs, sessionId, streaming }) => /* @__PURE__ */ jsx60(BlockActions.Provider, { value: { send, fill, rest, blockId: attrs?.id, sessionScope: sessionId }, children: /* @__PURE__ */ jsx60(BlockTag, { id: attrs?.id, streaming: Boolean(streaming), load }) })
      }
    });
    ctx.register({
      id: "hermes-genui-shelf",
      area: CHAT_EMPTY_AREA,
      data: {
        render: () => /* @__PURE__ */ jsx60(BlockActions.Provider, { value: { send, fill, rest }, children: /* @__PURE__ */ jsx60(LibraryEntry, {}) })
      }
    });
  }
};
export {
  plugin_default as default
};
