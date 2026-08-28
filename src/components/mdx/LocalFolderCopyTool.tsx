import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type FC,
  type ReactNode,
  type MouseEvent as RMouseEvent,
  type ChangeEvent,
  type KeyboardEvent as RKeyboardEvent,
} from "react";
import "@/styles/local-folder-copy-tool.css";

/**
 * showDirectoryPicker 不在 lib.dom 里。原本放在 src/types/file-system-access.d.ts，
 * 但那个档案没被纳入型别程式（astro check 与 oxlint 都看不到），呼叫处只能靠
 * as unknown as 硬转。宣告在用它的档案里，型别就确实生效。
 */
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}


const h = React.createElement;
function cx(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}

/* ═══════════ TYPES ═══════════ */

// kind 与 handle 绑成判别式联集：检查过 kind 之后 handle 自动窄化，
// 不必再写 `node.handle as FileSystemFileHandle` 这类不安全断言。
interface FileNodeBase {
  name: string;
  path: string;
  loaded: boolean;
  ignored: boolean;
  children?: FileNode[];
}

interface FileNodeFile extends FileNodeBase {
  kind: "file";
  handle: FileSystemFileHandle;
}

interface FileNodeDirectory extends FileNodeBase {
  kind: "directory";
  handle: FileSystemDirectoryHandle;
}

type FileNode = FileNodeFile | FileNodeDirectory;

interface ParsedRule {
  type: "exact" | "regex";
  src: string;
  val?: string;
  re?: RegExp;
}

interface ToastItem {
  id: number;
  msg: string;
  type: "info" | "success" | "error" | "warn";
  visible: boolean;
}

type SearchHit =
  | { name: string; path: string; kind: "file"; handle: FileSystemFileHandle }
  | { name: string; path: string; kind: "directory"; handle: FileSystemDirectoryHandle };

interface SelectionState {
  checked: boolean;
  indeterminate: boolean;
}

interface ReadResult {
  ok: boolean;
  text?: string;
  reason?: string;
}

interface ScanGeneration {
  cancelled: boolean;
}

/* ═══════════ CONFIG ═══════════ */

const CFG = {
  storageKey: "lfct_ignore_rules",
  maxFileSize: 700 * 1024,
  maxOutput: 5_000_000,
  sniffBytes: 16 * 1024,
  suspiciousRatio: 0.01,
  utf16Threshold: 0.3,
  utf16OppositeMax: 0.05,
} as const;

const DEFAULT_IGNORES: string[] = [
  "node_modules", ".git", ".next", "dist", "build", "coverage",
  ".vscode", ".idea", ".npm-cache", ".turbo", ".vercel", ".cache", "out",
  ".ds_store", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
  "/\\.lock$/", "/\\.lockb$/",
];

const BIN_SIGS: number[][] = [
  [0x89,0x50,0x4e,0x47],[0xff,0xd8,0xff],[0x47,0x49,0x46,0x38],
  [0x25,0x50,0x44,0x46,0x2d],[0x50,0x4b,0x03,0x04],[0x50,0x4b,0x05,0x06],
  [0x50,0x4b,0x07,0x08],[0x1f,0x8b],[0x7f,0x45,0x4c,0x46],
  [0xca,0xfe,0xba,0xbe],[0x00,0x61,0x73,0x6d],[0x53,0x51,0x4c,0x69,0x74,0x65],
];

/* ═══════════ IGNORE RULES ═══════════ */

function parseRules(rules: string[]): ParsedRule[] {
  return rules
    .map((r) => (r ?? "").trim())
    .filter(Boolean)
    .map((rule): ParsedRule => {
      const m = rule.match(/^\/(.+)\/([a-z]*)$/);
      if (m) {
        try { return { type: "regex", src: rule, re: new RegExp(m[1], m[2]) }; }
        catch { /* fallthrough */ }
      }
      return { type: "exact", src: rule, val: rule.toLowerCase() };
    });
}

function nameMatches(name: string, parsed: ParsedRule[]): boolean {
  const ln = name.toLowerCase();
  for (const r of parsed) {
    if (r.type === "exact" && r.val === ln) return true;
    if (r.type === "regex" && r.re) { r.re.lastIndex = 0; if (r.re.test(name)) return true; }
  }
  return false;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function loadRules(): string[] | null {
  try {
    const raw = localStorage.getItem(CFG.storageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStringArray(parsed)) return parsed;
    }
  } catch { /* noop */ }
  return null;
}

function saveRules(rules: string[]): string[] {
  const clean: string[] = [];
  for (const r of rules) {
    const s = (r ?? "").trim();
    if (s && !clean.some((x) => x.toLowerCase() === s.toLowerCase())) clean.push(s);
  }
  localStorage.setItem(CFG.storageKey, JSON.stringify(clean));
  return clean;
}

/* ═══════════ TEXT DETECTION ═══════════ */

function sigStartsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.length <= bytes.length && sig.every((v, i) => bytes[i] === v);
}
function isBinarySig(bytes: Uint8Array): boolean {
  return BIN_SIGS.some((s) => sigStartsWith(bytes, s));
}
function detectBom(b: Uint8Array): string | null {
  if (sigStartsWith(b, [0xef, 0xbb, 0xbf])) return "utf-8";
  if (sigStartsWith(b, [0xff, 0xfe])) return "utf-16le";
  if (sigStartsWith(b, [0xfe, 0xff])) return "utf-16be";
  return null;
}
function detectUtf16(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;
  let ev = 0, od = 0, pairs = 0;
  for (let i = 0; i < bytes.length - 1; i += 2) {
    if (bytes[i] === 0) ev++;
    if (bytes[i + 1] === 0) od++;
    pairs++;
  }
  if (!pairs) return null;
  if (od / pairs > CFG.utf16Threshold && ev / pairs < CFG.utf16OppositeMax) return "utf-16le";
  if (ev / pairs > CFG.utf16Threshold && od / pairs < CFG.utf16OppositeMax) return "utf-16be";
  return null;
}
function looksLikeText(text: string): boolean {
  if (!text) return true;
  let sus = 0, tot = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    tot++;
    const ok = c === 9 || c === 10 || c === 12 || c === 13 || c === 27;
    if (c === 0xfffd || ((c >= 0 && c <= 31 && !ok) || (c >= 127 && c <= 159))) sus++;
  }
  return tot === 0 || sus / tot <= CFG.suspiciousRatio;
}
function canDecode(bytes: Uint8Array, enc: string): boolean {
  try { return looksLikeText(new TextDecoder(enc, { fatal: true }).decode(bytes)); }
  catch { return false; }
}
function detectEncoding(bytes: Uint8Array): string | null {
  if (!bytes.length) return "utf-8";
  if (isBinarySig(bytes)) return null;
  const bom = detectBom(bytes); if (bom && canDecode(bytes, bom)) return bom;
  const u16 = detectUtf16(bytes); if (u16 && canDecode(bytes, u16)) return u16;
  if (bytes.includes(0)) return null;
  if (canDecode(bytes, "utf-8")) return "utf-8";
  return null;
}
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

async function readFileText(handle: FileSystemFileHandle): Promise<ReadResult> {
  let file: File;
  try { file = await handle.getFile(); } catch { return { ok: false, reason: "無法讀取" }; }
  if (file.size > CFG.maxFileSize) return { ok: false, reason: `超過 ${fmtBytes(CFG.maxFileSize)}` };
  let buf: ArrayBuffer;
  try { buf = await file.arrayBuffer(); } catch { return { ok: false, reason: "讀取失敗" }; }
  const bytes = new Uint8Array(buf);
  const sample = bytes.subarray(0, Math.min(bytes.length, CFG.sniffBytes));
  const enc = detectEncoding(sample);
  if (!enc) return { ok: false, reason: "非文字檔" };
  let text: string;
  try { text = new TextDecoder(enc, { fatal: true }).decode(bytes); }
  catch { return { ok: false, reason: "解碼失敗" }; }
  if (!looksLikeText(text)) return { ok: false, reason: "疑似二進位" };
  return { ok: true, text };
}

/* ═══════════ PATH UTILS ═══════════ */

const isDescOf = (p: string, a: string): boolean => p === a || p.startsWith(a + "/");
const hasAncIn = (p: string, s: Set<string>): boolean => { for (const x of s) if (isDescOf(p, x)) return true; return false; };
const hasDescIn = (p: string, s: Set<string>): boolean => { for (const x of s) if (x !== p && x.startsWith(p + "/")) return true; return false; };

function cloneSet(s: Set<string>): Set<string> { return new Set(s); }
function setAdd(s: Set<string>, v: string): Set<string> { const n = cloneSet(s); n.add(v); return n; }
function setDel(s: Set<string>, v: string): Set<string> { const n = cloneSet(s); n.delete(v); return n; }
function setRmDesc(s: Set<string>, p: string): Set<string> {
  const n = cloneSet(s); for (const x of cloneSet(n)) if (isDescOf(x, p)) n.delete(x); return n;
}
function setRmAnc(s: Set<string>, p: string): Set<string> {
  const n = cloneSet(s); for (const x of cloneSet(n)) if (x !== p && p.startsWith(x + "/")) n.delete(x); return n;
}

/* ═══════════ DEEP SEARCH ═══════════ */

async function* deepScan(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  isIgnored: (n: string) => boolean,
  gen: ScanGeneration,
): AsyncGenerator<SearchHit> {
  try {
    for await (const entry of dirHandle.entries()) {
      const [name, handle] = entry;
      if (gen.cancelled) return;
      if (isIgnored(name)) continue;
      const path = basePath ? `${basePath}/${name}` : name;
      yield handle.kind === "directory"
        ? { name, path, kind: "directory" as const, handle }
        : { name, path, kind: "file" as const, handle };
      if (handle.kind === "directory") {
        yield* deepScan(handle, path, isIgnored, gen);
      }
    }
  } catch { /* permission error */ }
}

/* ═══════════ FILE COUNT ═══════════ */

async function countFilesInDir(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  isIgnored: (n: string) => boolean,
  signal: AbortSignal,
): Promise<number> {
  let count = 0;
  try {
    for await (const entry of dirHandle.entries()) {
      const [name, handle] = entry;
      if (signal.aborted) return count;
      if (isIgnored(name)) continue;
      if (handle.kind === "file") count++;
      else count += await countFilesInDir(handle, basePath + "/" + name, isIgnored, signal);
    }
  } catch { /* noop */ }
  return count;
}

/* ═══════════ DIRECTORY READING ═══════════ */

async function readDir(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  isIgnored: (n: string) => boolean,
): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  for await (const entry of dirHandle.entries()) {
    const [name, handle] = entry;
    const path = basePath ? `${basePath}/${name}` : name;
    const base = { name, path, loaded: false, ignored: isIgnored(name) };
    nodes.push(
      handle.kind === "directory"
        ? { ...base, kind: "directory" as const, handle, children: [] }
        : { ...base, kind: "file" as const, handle },
    );
  }
  return nodes.toSorted((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/* ═══════════ SVG ICONS ═══════════ */

const svgBase = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IconChevron: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase },
    h("polyline", { points: "9 18 15 12 9 6" }));

const IconFolder: FC = () =>
  h("svg", { className: "lf-icon lf-icon-folder", viewBox: "0 0 24 24", ...svgBase },
    h("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }));

const IconFile: FC = () =>
  h("svg", { className: "lf-icon", viewBox: "0 0 24 24", ...svgBase },
    h("path", { d: "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" }),
    h("polyline", { points: "13 2 13 9 20 9" }));

const IconExclude: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase },
    h("circle", { cx: 12, cy: 12, r: 10 }),
    h("line", { x1: 4.93, y1: 4.93, x2: 19.07, y2: 19.07 }));

const IconX: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase, style: { width: 14, height: 14 } },
    h("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
    h("line", { x1: 6, y1: 6, x2: 18, y2: 18 }));

const IconCheck: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase, strokeWidth: 2.5 },
    h("polyline", { points: "20 6 9 17 4 12" }));

const IconSearch: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase },
    h("circle", { cx: 11, cy: 11, r: 8 }),
    h("line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }));

const IconSettings: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase },
    h("circle", { cx: 12, cy: 12, r: 3 }),
    h("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }));

const IconCopy: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase },
    h("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
    h("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }));

const IconFolderPlus: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase, strokeWidth: 1.8 },
    h("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }),
    h("line", { x1: 12, y1: 11, x2: 12, y2: 17 }),
    h("line", { x1: 9, y1: 14, x2: 15, y2: 14 }));

const IconChevronDown: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase },
    h("polyline", { points: "6 9 12 15 18 9" }));

const IconInfo: FC = () =>
  h("svg", { viewBox: "0 0 24 24", ...svgBase, width: 17, height: 17 },
    h("circle", { cx: 12, cy: 12, r: 10 }),
    h("line", { x1: 12, y1: 8, x2: 12, y2: 12 }),
    h("line", { x1: 12, y1: 16, x2: 12.01, y2: 16 }));

/* ═══════════ CHECKBOX ═══════════ */

interface CheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
}

const Checkbox: FC<CheckboxProps> = ({ checked, indeterminate, disabled, onChange }) =>
  h("button", {
    type: "button",
    className: cx("lf-cb", checked && "lf-cb--on", indeterminate && "lf-cb--ind", disabled && "lf-cb--dis"),
    disabled,
    onClick: (e: RMouseEvent) => { e.stopPropagation(); if (!disabled) onChange(); },
  },
    checked ? h(IconCheck) : null,
    indeterminate ? h("span", { className: "lf-cb-dash" }) : null,
  );

/* ═══════════ TOASTS ═══════════ */

let toastSeq = 0;

function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((msg: string, type: ToastItem["type"] = "info") => {
    const id = ++toastSeq;
    setToasts((p) => [...p, { id, msg, type, visible: false }]);
    setTimeout(() => setToasts((p) => p.map((t) => (t.id === id ? { ...t, visible: true } : t))), 30);
    const dur = Math.min(9000, Math.max(4000, 2500 + msg.length * 35));
    setTimeout(() => {
      setToasts((p) => p.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 400);
    }, dur);
  }, []);
  return { toasts, show };
}

const ToastContainer: FC<{ toasts: ToastItem[] }> = ({ toasts }) =>
  h("div", { className: "lf-toasts" },
    toasts.map((t) =>
      h("div", {
        key: t.id,
        className: cx("lf-toast", `lf-toast--${t.type}`, t.visible && "lf-toast--show"),
      },
        t.type === "success" ? h(IconCheck) : h(IconInfo),
        h("span", null, t.msg),
      ),
    ),
  );

/* ═══════════ SEARCH RESULT ITEM ═══════════ */

interface SRItemProps {
  item: SearchHit;
  checked: boolean;
  onToggle: (item: SearchHit) => void;
}

const SearchResultItem: FC<SRItemProps> = ({ item, checked, onToggle }) => {
  const isDir = item.kind === "directory";
  return h("div", {
    className: cx("lf-sr-item", checked && "lf-sr-item--sel"),
    onClick: () => onToggle(item),
  },
    h(Checkbox, { checked, indeterminate: false, onChange: () => onToggle(item) }),
    isDir ? h(IconFolder) : h(IconFile),
    h("div", { className: "lf-sr-info" },
      h("span", { className: cx("lf-name", isDir && "lf-name--dir") }, item.name),
      h("span", { className: "lf-sr-path" }, item.path),
    ),
  );
};

/* ═══════════ SETTINGS PANEL ═══════════ */

interface SettingsProps {
  rules: string[];
  toast: (msg: string, type: ToastItem["type"]) => void;
  onSave: (rules: string[]) => void;
  onClose: () => void;
}

const SettingsPanel: FC<SettingsProps> = ({ rules, toast, onSave, onClose }) => {
  const [editing, setEditing] = useState<string[]>([...rules]);
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (editing.some((x) => x.toLowerCase() === v.toLowerCase())) { toast(`「${v}」已在清單中`, "error"); return; }
    setEditing([v, ...editing]);
    setInput("");
  };

  const remove = (i: number) => setEditing(editing.filter((_, idx) => idx !== i));

  return h("div", { className: "lf-settings" },
    h("p", { className: "lf-settings-hint" },
      "支援資料夾 / 檔案名稱，或正規表達式如 ", h("code", null, "/\\.log$/i")),
    h("div", { className: "lf-settings-add" },
      h("input", {
        className: "lf-settings-input", value: input, placeholder: "輸入規則…",
        onChange: (e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
        onKeyDown: (e: RKeyboardEvent) => { if (e.key === "Enter") add(); },
      }),
      h("button", { className: "lf-btn-sm", onClick: add }, "新增"),
    ),
    h("div", { className: "lf-settings-list" },
      editing.length === 0
        ? h("div", { className: "lf-settings-empty" }, "目前無略過項目")
        : editing.map((r, i) =>
            h("div", { key: `${r}-${i}`, className: "lf-settings-item" },
              h("span", null, r),
              h("button", { className: "lf-del-btn", onClick: () => remove(i) }, h(IconX)),
            ),
          ),
    ),
    h("div", { className: "lf-settings-foot" },
      h("button", { className: "lf-link", onClick: () => setEditing([...DEFAULT_IGNORES]) }, "還原預設"),
      h("button", { className: "lf-btn-accent", onClick: () => { onSave(editing); onClose(); } }, "儲存並重載"),
    ),
  );
};

function updateNodeInTree(
  nodes: FileNode[],
  path: string,
  updater: (n: FileNode) => FileNode,
): FileNode[] {
  return nodes.map((n) => {
    if (n.path === path) return updater(n);
    if (n.children && path.startsWith(n.path + "/"))
      return { ...n, children: updateNodeInTree(n.children, path, updater) };
    return n;
  });
}

function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const f = findNode(n.children, path);
      if (f) return f;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */

const LocalFolderCopyTool: FC = () => {
  const [rules, setRules] = useState<string[]>(() => (typeof window !== "undefined" ? (loadRules() ?? [...DEFAULT_IGNORES]) : [...DEFAULT_IGNORES]));
  const parsed = useMemo(() => parseRules(rules), [rules]);
  const isIgnored = useCallback((name: string) => nameMatches(name, parsed), [parsed]);

  const [tree, setTree] = useState<FileNode[]>([]);
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const [selFiles, setSelFiles] = useState<Set<string>>(new Set());
  const [selFolders, setSelFolders] = useState<Set<string>>(new Set());
  const [exclPaths, setExclPaths] = useState<Set<string>>(new Set());

  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchGen = useRef<ScanGeneration>({ cancelled: false });
  const rootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const [fileCount, setFileCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const countAbort = useRef<AbortController | null>(null);

  const [isCopying, setIsCopying] = useState(false);

  const [showSettings, setShowSettings] = useState(false);

  const { toasts, show: toast } = useToasts();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const getSelState = useCallback((node: FileNode): SelectionState => {
    if (!node || node.ignored) return { checked: false, indeterminate: false };
    const p = node.path;
    if (hasAncIn(p, exclPaths)) return { checked: false, indeterminate: false };
    if (node.kind !== "directory") {
      return { checked: selFiles.has(p) || hasAncIn(p, selFolders), indeterminate: false };
    }
    const byFolder = hasAncIn(p, selFolders);
    if (byFolder) {
      return hasDescIn(p, exclPaths)
        ? { checked: false, indeterminate: true }
        : { checked: true, indeterminate: false };
    }
    if (node.loaded && node.children && node.children.length > 0) {
      const sc = node.children.filter((c) => !c.ignored);
      if (sc.length > 0) {
        const cs = sc.map(getSelState);
        if (cs.every((s) => s.checked && !s.indeterminate)) return { checked: true, indeterminate: false };
        if (cs.some((s) => s.checked || s.indeterminate)) return { checked: false, indeterminate: true };
      }
    }
    if (hasDescIn(p, selFiles) || hasDescIn(p, selFolders)) return { checked: false, indeterminate: true };
    return { checked: false, indeterminate: false };
  }, [selFiles, selFolders, exclPaths]);

  const toggleSelect = useCallback((node: FileNode) => {
    if (!node || node.ignored) return;
    const p = node.path;
    const st = getSelState(node);
    if (st.indeterminate || !st.checked) {
      let nExcl = setRmAnc(setRmDesc(exclPaths, p), p);
      if (node.kind === "directory") {
        let nF = setAdd(selFolders, p);
        const nFi = setRmDesc(selFiles, p);
        for (const f of cloneSet(nF)) if (f !== p && f.startsWith(p + "/")) nF.delete(f);
        setSelFolders(nF); setSelFiles(nFi);
      } else { setSelFiles(setAdd(selFiles, p)); }
      setExclPaths(nExcl);
    } else {
      const byAnc = hasAncIn(p, selFolders);
      if (byAnc) {
        if (selFolders.has(p)) {
          setSelFolders(setDel(selFolders, p)); setSelFiles(setRmDesc(selFiles, p)); setExclPaths(setRmDesc(exclPaths, p));
        } else {
          setSelFiles(setRmDesc(selFiles, p)); setSelFolders(setRmDesc(selFolders, p));
          setExclPaths(setAdd(setRmDesc(exclPaths, p), p));
        }
      } else if (node.kind === "directory") {
        setSelFolders(setRmDesc(setDel(selFolders, p), p)); setSelFiles(setRmDesc(selFiles, p)); setExclPaths(setRmDesc(exclPaths, p));
      } else {
        setSelFiles(setDel(selFiles, p)); setExclPaths(setRmDesc(exclPaths, p));
      }
    }
  }, [selFiles, selFolders, exclPaths, getSelState]);

  const isItemSelected = useCallback((item: SearchHit): boolean => {
    if (hasAncIn(item.path, exclPaths)) return false;
    if (item.kind === "file") return selFiles.has(item.path) || hasAncIn(item.path, selFolders);
    return selFolders.has(item.path) || hasAncIn(item.path, selFolders);
  }, [selFiles, selFolders, exclPaths]);

  const toggleSearchItem = useCallback((item: SearchHit) => {
    const checked = isItemSelected(item);
    if (!checked) {
      let nExcl = setRmAnc(setRmDesc(exclPaths, item.path), item.path);
      if (item.kind === "directory") setSelFolders(setAdd(selFolders, item.path));
      else setSelFiles(setAdd(selFiles, item.path));
      setExclPaths(nExcl);
    } else {
      if (hasAncIn(item.path, selFolders) && !selFolders.has(item.path)) {
        setExclPaths(setAdd(setRmDesc(exclPaths, item.path), item.path));
      } else {
        if (item.kind === "directory") setSelFolders(setDel(selFolders, item.path));
        else setSelFiles(setDel(selFiles, item.path));
      }
    }
  }, [selFiles, selFolders, exclPaths, isItemSelected]);

  const toggleExpand = useCallback(async (node: FileNode) => {
    if (node.ignored) return;
    const p = node.path;
    if (expandedSet.has(p)) {
      setExpandedSet((prev) => { const n = new Set(prev); n.delete(p); return n; });
      return;
    }
    setExpandedSet((prev) => new Set(prev).add(p));
    if (!node.loaded) {
      try {
        if (node.kind !== "directory") return;
        const children = await readDir(node.handle, node.path, isIgnored);
        setTree((prev) => updateNodeInTree(prev, p, (n) => ({ ...n, loaded: true, children })));
      } catch { toast(`讀取 ${node.name} 失敗`, "error"); }
    }
  }, [expandedSet, isIgnored, toast]);

  const pickDirectory = async () => {
    if (typeof window.showDirectoryPicker !== "function") { toast("請使用 Chrome 或 Edge 瀏覽器", "error"); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      rootHandleRef.current = handle;
      const rootPath = handle.name || "root";
      const children = await readDir(handle, rootPath, isIgnored);
      setTree([{ name: rootPath, path: rootPath, kind: "directory", handle, loaded: true, ignored: false, children }]);
      setExpandedSet(new Set([rootPath]));
      setSelFiles(new Set()); setSelFolders(new Set()); setExclPaths(new Set());
      setSearchQ(""); setDebouncedQ(""); setSearchResults([]);
      setLoaded(true); setFileCount(null);
      toast("資料夾讀取成功", "success");
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast("讀取失敗", "error");
    }
  };

  useEffect(() => {
    if (!debouncedQ || !rootHandleRef.current || !loaded) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }
    searchGen.current.cancelled = true;
    const gen: ScanGeneration = { cancelled: false };
    searchGen.current = gen;
    setIsSearching(true);
    const q = debouncedQ.toLowerCase();
    const results: SearchHit[] = [];
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      const rh = rootHandleRef.current!;
      for await (const item of deepScan(rh, rh.name || "root", isIgnored, gen)) {
        if (gen.cancelled) return;
        if (item.name.toLowerCase().includes(q)) {
          results.push(item);
          if (!batchTimer) {
            batchTimer = setTimeout(() => { if (!gen.cancelled) setSearchResults([...results]); batchTimer = null; }, 150);
          }
        }
      }
      if (!gen.cancelled) { setSearchResults([...results]); setIsSearching(false); }
    })();
    return () => {
      gen.cancelled = true;
    };
  }, [debouncedQ, loaded, isIgnored]);

  useEffect(() => {
    if (countAbort.current) countAbort.current.abort();
    const totalDirect = selFiles.size;
    const folderPaths = [...selFolders];
    if (folderPaths.length === 0) {
      setFileCount(totalDirect);
      setIsCounting(false);
      return undefined;
    }
    const ac = new AbortController();
    countAbort.current = ac;
    setIsCounting(true);
    void (async () => {
      let total = totalDirect;
      for (const fp of folderPaths) {
        if (ac.signal.aborted) return;
        const node = findNode(tree, fp);
        if (!node || node.kind !== "directory") continue;
        total += await countFilesInDir(node.handle, node.path, isIgnored, ac.signal);
      }
      if (!ac.signal.aborted) { setFileCount(total); setIsCounting(false); }
    })();
    return () => ac.abort();
  }, [selFiles, selFolders, tree, isIgnored]);

  const excludeName = useCallback((name: string) => {
    const updated = saveRules([name, ...rules]);
    setRules(updated);
    const newParsed = parseRules(updated);
    setTree((prev) => {
      function mark(nodes: FileNode[]): FileNode[] {
        return nodes.map((n) => {
          const nowIgnored = n.ignored || nameMatches(n.name, newParsed);
          if (nowIgnored && !n.ignored) {
            setSelFiles((p) => setDel(p, n.path));
            setSelFolders((p) => setDel(p, n.path));
          }
          return { ...n, ignored: nowIgnored, children: n.children ? mark(n.children) : undefined };
        });
      }
      return mark(prev);
    });
    toast(`已將「${name}」加入略過清單`, "success");
  }, [rules, toast]);

  const clearAll = () => { setSelFiles(new Set()); setSelFolders(new Set()); setExclPaths(new Set()); };

  const onSaveSettings = useCallback((newRules: string[]) => {
    const saved = saveRules(newRules);
    setRules(saved);
    setTree([]); setExpandedSet(new Set()); setSelFiles(new Set()); setSelFolders(new Set()); setExclPaths(new Set());
    setLoaded(false); setSearchQ(""); setDebouncedQ(""); rootHandleRef.current = null;
    toast("設定已儲存，請重新選擇資料夾", "success");
  }, [toast]);

  const handleCopy = async () => {
    if (selFiles.size + selFolders.size === 0) return;
    setIsCopying(true);
    try {
      const chunks: string[] = [];
      const seen = new Set<string>();
      const skippedPreview: { path: string; reason: string }[] = [];
      let copied = 0, skipped = 0, totalChars = 0, limitHit = false;
      const recordSkip = (path: string, reason: string) => { skipped++; if (skippedPreview.length < 5) skippedPreview.push({ path, reason }); };
      const append = (text: string, path: string): boolean => {
        if (limitHit) return false;
        const out = `----- BEGIN FILE: ${path} -----\n\n${text}\n\n----- END FILE: ${path} -----`;
        if (totalChars + out.length > CFG.maxOutput) { chunks.push("\n----- OUTPUT TRUNCATED -----"); limitHit = true; return false; }
        chunks.push(out); totalChars += out.length; copied++; return true;
      };
      async function processFile(handle: FileSystemFileHandle, path: string) {
        if (seen.has(path) || limitHit) return;
        if (hasAncIn(path, exclPaths)) return;
        seen.add(path);
        const r = await readFileText(handle);
        if (r.ok && r.text) { if (!append(r.text, path)) recordSkip(path, "超過上限"); }
        else recordSkip(path, r.reason ?? "未知");
      }
      async function* walkDir(dirH: FileSystemDirectoryHandle, base: string): AsyncGenerator<{ handle: FileSystemFileHandle; path: string }> {
        for await (const entry of dirH.entries()) {
          const [name, handle] = entry;
          if (isIgnored(name)) continue;
          const path = base + "/" + name;
          if (hasAncIn(path, exclPaths)) continue;
          if (handle.kind === "file") yield { handle: handle, path };
          else yield* walkDir(handle, path);
        }
      }
      for (const fp of selFiles) {
        if (limitHit) break;
        if (hasAncIn(fp, selFolders) && !hasAncIn(fp, exclPaths)) continue;
        const node = findNode(tree, fp);
        if (node?.kind === "file") await processFile(node.handle, fp);
      }
      for (const fp of selFolders) {
        if (limitHit) break;
        let covered = false;
        for (const f2 of selFolders) { if (f2 !== fp && fp.startsWith(f2 + "/")) { covered = true; break; } }
        if (covered && !hasAncIn(fp, exclPaths)) continue;
        const node = findNode(tree, fp);
        if (!node || node.kind !== "directory") continue;
        for await (const { handle, path } of walkDir(node.handle, node.path)) {
          if (limitHit) break;
          await processFile(handle, path);
        }
      }
      const output = chunks.join("\n\n");
      if (!output.trim()) { toast(skipped > 0 ? `無可複製內容，已略過 ${skipped} 個檔案` : "無可複製的文字檔", "error"); return; }
      await navigator.clipboard.writeText(output);
      toast(`成功複製 ${copied} 個檔案（${output.length.toLocaleString()} 字元${limitHit ? "，已截斷" : ""}）`, "success");
      if (skipped > 0) { toast(`已略過 ${skipped} 個：${skippedPreview.map((s) => `${s.path}(${s.reason})`).join("、")}`, "warn"); }
    } catch { toast("複製失敗，請確認剪貼簿權限", "error"); }
    finally { setIsCopying(false); }
  };

  const totalSelected = selFiles.size + selFolders.size;
  const isSearchMode = searchQ.length > 0;
  const countText = (() => {
    if (totalSelected === 0) return "尚未勾選";
    if (isCounting) return "計算中…";
    if (fileCount !== null && selFolders.size > 0) return `約 ${fileCount.toLocaleString()} 個檔案`;
    return `${totalSelected} 個檔案`;
  })();

  const renderNodes = (nodes: FileNode[]): ReactNode[] =>
    nodes.map((node) => {
      const st = getSelState(node);
      const exp = expandedSet.has(node.path);
      const isDir = node.kind === "directory";
      return h("div", { key: node.path, className: "lf-node" },
        h("div", {
          className: cx("lf-row", st.checked && "lf-row--sel", st.indeterminate && "lf-row--part", node.ignored && "lf-row--ign"),
          onClick: () => { if (!node.ignored) toggleSelect(node); },
        },
          isDir && !node.ignored
            ? h("button", { className: cx("lf-exp", exp && "lf-exp--open"), onClick: (e: RMouseEvent) => { e.stopPropagation(); void toggleExpand(node); } }, h(IconChevron))
            : h("span", { className: "lf-exp-spacer" }),
          h(Checkbox, { checked: st.checked, indeterminate: st.indeterminate, disabled: node.ignored, onChange: () => toggleSelect(node) }),
          isDir ? h(IconFolder) : h(IconFile),
          h("span", { className: cx("lf-name", isDir && "lf-name--dir") }, node.name),
          node.ignored ? h("span", { className: "lf-badge" }, "已略過") : null,
          !node.ignored ? h("div", { className: "lf-row-acts" },
            h("button", { className: "lf-excl-btn", title: "加入略過清單", onClick: (e: RMouseEvent) => { e.stopPropagation(); excludeName(node.name); } }, h(IconExclude))) : null,
        ),
        isDir && !node.ignored && exp
          ? h("div", { className: "lf-children" },
              node.children && node.children.length > 0
                ? renderNodes(node.children)
                : h("div", { className: "lf-empty-dir" }, node.loaded ? "空資料夾" : "載入中…"))
          : null,
      );
    });

  return h("div", { id: "lfct-root" },
    h("div", { className: "lf-shell" },
      h("div", { className: "lf-card" },
        h("div", { className: "lf-side" },
          h("div", { className: "lf-side-body" },
            h("div", { className: "lf-brand" },
              h("div", { className: "lf-brand-icon" }, h(IconFolderPlus)),
              h("div", null, h("h1", { className: "lf-title" }, "Folder Copy"), h("p", { className: "lf-desc" }, "選擇資料夾，勾選檔案，一鍵複製")),
            ),
            h("button", { className: cx("lf-pick", loaded && "lf-pick--loaded"), onClick: pickDirectory },
              h("div", { className: "lf-pick-inner" }, h(IconFolderPlus), h("span", null, loaded ? "重新選擇" : "選擇資料夾")),
              !loaded ? h("span", { className: "lf-pick-hint" }, "點擊開始") : null),
            loaded ? h("div", { className: "lf-search-wrap" },
              h(IconSearch),
              h("input", { className: "lf-search", type: "text", placeholder: "搜尋所有檔案…", value: searchQ, onChange: (e: ChangeEvent<HTMLInputElement>) => setSearchQ(e.target.value) }),
              isSearching ? h("span", { className: "lf-search-spin" }, "⟳") : null) : null,
            h("div", { className: "lf-divider" }),
            h("button", { className: cx("lf-acc-trigger", showSettings && "lf-acc-trigger--open"), onClick: () => setShowSettings(!showSettings) },
              h("span", { className: "lf-acc-left" }, h(IconSettings), " 略過清單"), h(IconChevronDown)),
            showSettings ? h(SettingsPanel, { rules, toast, onSave: onSaveSettings, onClose: () => setShowSettings(false) }) : null,
          ),
          loaded ? h("div", { className: "lf-side-foot" },
            h("div", { className: "lf-foot-meta" },
              h("span", { className: "lf-count" }, countText),
              h("button", { className: "lf-link", disabled: totalSelected === 0 || isCopying, onClick: clearAll }, "清除")),
            h("button", { className: "lf-copy-btn", disabled: totalSelected === 0 || isCopying, onClick: handleCopy },
              isCopying ? h("span", null, "⏳ 複製中…") : [h(IconCopy, { key: "ic" }), h("span", { key: "tx" }, "複製勾選內容")])) : null,
        ),
        h("div", { className: "lf-main" },
          !loaded ? h("div", { className: "lf-empty" },
            h("div", { className: "lf-empty-gfx" }, h("div", { className: "lf-pulse lf-pulse--lg" }), h("div", { className: "lf-pulse lf-pulse--sm" }), h(IconFolderPlus)),
            h("h3", null, "選擇你的專案資料夾"), h("p", null, "點擊左側「選擇資料夾」開始")) : null,
          loaded && !isSearchMode ? h("div", { className: "lf-tree-wrap" }, h("div", { className: "lf-tree" }, renderNodes(tree))) : null,
          loaded && isSearchMode ? h("div", { className: "lf-sr-wrap" },
            h("div", { className: "lf-sr-header" },
              h("span", { className: "lf-sr-status" }, isSearching ? "搜尋中…" : `找到 ${searchResults.length} 個結果`)),
            h("div", { className: "lf-sr-list" },
              searchResults.length === 0 && !isSearching ? h("div", { className: "lf-sr-none" }, "沒有符合的結果") : null,
              searchResults.map((item) => h(SearchResultItem, { key: item.path, item, checked: isItemSelected(item), onToggle: toggleSearchItem })))) : null,
        ),
      ),
      h(ToastContainer, { toasts }),
    ),
  );
};

export default LocalFolderCopyTool;
