import Editor, { type OnMount } from "@monaco-editor/react";
import { qMonarchSyntax, qMonarchTheme } from "@qpad/language";
import type { editor, languages } from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";
import { parityRows, paritySummary } from "./parity-data";
import type { SerializedError, WorkerRequest, WorkerResponse } from "./protocol";

type RunStatus = "idle" | "running" | "ready" | "error";
type Route = { page: "pad" } | { page: "ops"; op?: string } | { page: "parity" };
type BuiltinKind = "monad" | "diad";

type OperatorInfo = {
  name: string;
  slug: string;
  kind: BuiltinKind;
  family: string;
  summary: string;
  example: string;
  notes: string[];
};

const starter = `a:til 5
/ use Ctrl+Enter or the Run button
sum a
`;

const quickExamples = [
  "1+2",
  "til 10",
  "avg 1 2 3",
  "distinct 2 3 7 3 5 3",
  ".Q.n",
  ".z.K"
];

const quickCheckGroups = [
  {
    title: "Atoms and lists",
    items: [
      { label: "Distinct", program: "distinct 2 3 7 3 5 3" },
      { label: "Unique", program: "1 2 1 3 2 4" },
      { label: "Sums", program: "sums 3 1 4 1 5" },
      { label: "Prev", program: "prev 10 20 30 40" },
      { label: "Rotate", program: "2 rotate 10 20 30 40 50" },
      { label: "Cut", program: "2 cut til 10" }
    ]
  },
  {
    title: "Dictionaries and keyed tables",
    items: [
      { label: "Dict lookup", program: "(`a`b`c!10 20 30)`b" },
      { label: "Membership", program: "`b in `a`b`c" },
      { label: "Keyed row", program: "([k:`a`b] v:10 20)[`a]" },
      { label: "Table keys", program: "key ([k:`a`b] v:10 20)" },
      { label: "Flip dict", program: "flip `x`y!(til 4;10 20 30 40)" },
      { label: "Xcol rename", program: "`left`right xcol ([]x:til 3;y:10 20 30)" }
    ]
  },
  {
    title: "Tables and qsql",
    items: [
      { label: "Plain table", program: "([] x: til 5; y: 10 20 30 40 50)" },
      {
        label: "Select where",
        program: "select from ([] x: til 6; y: 10 20 30 40 50 60) where x>2"
      },
      {
        label: "Exec column",
        program: "exec y from ([] x: til 4; y: 10 20 30 40)"
      },
      {
        label: "Update column",
        program: "update z:x+y from ([] x: 1 2 3; y: 10 20 30)"
      },
      {
        label: "Delete column",
        program: "delete y from ([] x: til 3; y: 10 20 30; z: 100 200 300)"
      },
      {
        label: "Unnamed cols",
        program: "([] 1 2 3; 10 20 30; 100 200 300)"
      }
    ]
  },
  {
    title: "Apply and adverbs",
    items: [
      { label: "Apply operator", program: "|[2;til 5]" },
      { label: "Each", program: "string each (1 20 300)" },
      { label: "Projection", program: "(+[2]) 40" },
      { label: "Sublist", program: "sublist[1 3;10 20 30 40 50]" },
      { label: "Take shape", program: "2 3#til 6" },
      { label: "Map at", program: "@[|:;\"zero\"]" }
    ]
  },
  {
    title: "Dot namespaces",
    items: [
      { label: ".Q.n", program: ".Q.n" },
      { label: ".Q.id", program: ".Q.id each `$(\"ab\";\"a/b\";\"two words\")" },
      { label: ".Q.s", program: ".Q.s ([h:1 2 3] m:4 5 6)" },
      { label: ".Q.btoa", program: ".Q.btoa \"hello\"" },
      { label: ".z.K", program: ".z.K" },
      { label: ".z.T", program: ".z.T" }
    ]
  }
] as const;

const namespaceHint = [
  { label: ".Q.n", value: "0123456789", note: "digit tape" },
  { label: ".Q.A", value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", note: "alphabet rail" },
  { label: ".z.K", value: "current date marker", note: "session clock" },
  { label: ".z.T", value: "current time marker", note: "time pulse" }
];

const telemetry = [
  { value: `${paritySummary.browserSafeFixtures}`, label: "browser-safe fixtures" },
  { value: `${paritySummary.referenceFixtures}`, label: "official q references" },
  { value: `${paritySummary.upstreamFixtures}`, label: "jq comparisons" }
];

const builtinCatalogSource = {
  monads: [
    "abs",
    "all",
    "any",
    "avgs",
    "til",
    "ceiling",
    "cols",
    "count",
    "desc",
    "differ",
    "exp",
    "fills",
    "first",
    "last",
    "log",
    "min",
    "mins",
    "max",
    "maxs",
    "med",
    "asc",
    "iasc",
    "idesc",
    "asin",
    "atan",
    "sum",
    "avg",
    "acos",
    "sin",
    "cos",
    "tan",
    "floor",
    "null",
    "reciprocal",
    "reverse",
    "signum",
    "sqrt",
    "neg",
    "not",
    "enlist",
    "distinct",
    "attr",
    "flip",
    "group",
    "key",
    "keys",
    "lower",
    "ltrim",
    "next",
    "upper",
    "cut",
    "prd",
    "prds",
    "prev",
    "raze",
    "ratios",
    "rtrim",
    "var",
    "svar",
    "dev",
    "sdev",
    "deltas",
    "trim",
    "sums",
    "string",
    "type",
    "where",
    "value",
    "show",
    "system"
  ],
  diads: [
    "+",
    "-",
    "*",
    "%",
    "=",
    "<",
    ">",
    "<=",
    ">=",
    ",",
    "!",
    "#",
    "_",
    "~",
    "div",
    "mavg",
    "mcount",
    "mdev",
    "msum",
    "mod",
    "^",
    "?",
    "$",
    "@",
    "and",
    "in",
    "like",
    "|",
    "&",
    "cross",
    "or",
    "over",
    "prior",
    "scan",
    "ss",
    "sv",
    "vs",
    "within",
    "except",
    "inter",
    "union",
    "xbar",
    "xexp",
    "xlog",
    "cut",
    "xcol",
    "rotate",
    "sublist"
  ]
} as const;

const operatorOverrides: Record<
  string,
  Partial<Pick<OperatorInfo, "family" | "summary" | "example" | "notes">>
> = {
  abs: {
    family: "numeric",
    summary: "Absolute value for atoms and numeric vectors.",
    example: "abs -3 2 -9"
  },
  til: {
    family: "list building",
    summary: "Generate a zero-based range from a count.",
    example: "til 8"
  },
  count: {
    family: "inspection",
    summary: "Count items, rows, or characters depending on the input.",
    example: "count `a`b`c"
  },
  sum: {
    family: "aggregation",
    summary: "Reduce a numeric list by addition.",
    example: "sum 3 1 4 1 5"
  },
  avg: {
    family: "aggregation",
    summary: "Compute the arithmetic mean of a numeric list.",
    example: "avg 10 20 30"
  },
  distinct: {
    family: "set logic",
    summary: "Keep the first appearance of each unique item.",
    example: "distinct 2 3 7 3 5 3"
  },
  flip: {
    family: "tables and dictionaries",
    summary: "Transpose nested data and dictionaries into tables.",
    example: "flip `x`y!(til 4;10 20 30 40)"
  },
  group: {
    family: "tables and dictionaries",
    summary: "Bucket positions by equal values.",
    example: "group `a`b`a`c`b"
  },
  key: {
    family: "tables and dictionaries",
    summary: "Extract keys from dictionaries, keyed tables, and namespaces.",
    example: "key `a`b!10 20"
  },
  string: {
    family: "text",
    summary: "Render values as q strings or lists of characters.",
    example: "string `qpad"
  },
  where: {
    family: "selection",
    summary: "Return positions selected by a boolean vector.",
    example: "where 1 0 1 1b"
  },
  value: {
    family: "inspection",
    summary: "Return the raw value unchanged.",
    example: "value 1 2 3"
  },
  prev: {
    family: "windowing",
    summary: "Shift a list right and fill the first slot with null.",
    example: "prev 10 20 30 40"
  },
  sums: {
    family: "windowing",
    summary: "Running cumulative sum.",
    example: "sums 3 1 4 1 5"
  },
  rotate: {
    family: "list transforms",
    summary: "Rotate a sequence by a count on the left.",
    example: "2 rotate 10 20 30 40 50"
  },
  cut: {
    family: "list transforms",
    summary: "Split a list or string into slices.",
    example: "2 cut til 10"
  },
  sublist: {
    family: "list transforms",
    summary: "Extract a span from a list by start and length.",
    example: "sublist[1 3;10 20 30 40 50]"
  },
  in: {
    family: "set logic",
    summary: "Membership test over lists and symbol vectors.",
    example: "`b in `a`b`c"
  },
  over: {
    family: "adverbs",
    summary: "Fold a function across a list.",
    example: "+/ 1 2 3 4"
  },
  scan: {
    family: "adverbs",
    summary: "Running fold that returns every intermediate result.",
    example: "+\\ 1 2 3 4"
  },
  "@": {
    family: "apply",
    summary: "Apply a value, function, or handler with explicit arguments.",
    example: "@[|:;\"zero\"]"
  },
  "?": {
    family: "lookup and search",
    summary: "Search, sample, or perform default-mapping style lookup depending on the left value.",
    example: "10?`v1`v2`v3",
    notes: [
      "List-left returns positions.",
      "Number-left samples from the right argument.",
      "Default-mapping forms are also supported."
    ]
  },
  "!": {
    family: "tables and dictionaries",
    summary: "Build dictionaries and keyed structures from keys and values.",
    example: "`a`b!10 20"
  },
  "#": {
    family: "reshape",
    summary: "Take, reshape, or count depending on placement.",
    example: "2 3#til 6"
  },
  ",": {
    family: "list transforms",
    summary: "Join, append, or enlist depending on rank.",
    example: "1 2,3 4"
  },
  "+": {
    family: "numeric",
    summary: "Addition and a base for derived adverbs like over and scan.",
    example: "10 + 32"
  },
  "-": {
    family: "numeric",
    summary: "Subtraction and unary negation.",
    example: "10 - 3"
  },
  "*": {
    family: "numeric",
    summary: "Multiplication across atoms and vectors.",
    example: "6 * 7"
  },
  "%": {
    family: "numeric",
    summary: "Division across atoms and vectors.",
    example: "22 % 7"
  }
};

const slugifyOperator = (name: string) =>
  encodeURIComponent(name)
    .replace(/%/g, "")
    .toLowerCase();

const unslugifyOperator = (slug?: string) =>
  slug ? decodeURIComponent(slug.replace(/%(?![0-9A-Fa-f]{2})/g, "%25")) : undefined;

const detectFamily = (name: string, kind: BuiltinKind) => {
  if (operatorOverrides[name]?.family) {
    return operatorOverrides[name].family!;
  }
  if (/^[+\-*%=<>?,!#@_^~|&$]+$/.test(name)) {
    return "glyph operators";
  }
  if (["over", "scan", "prior"].includes(name)) {
    return "adverbs";
  }
  if (["key", "keys", "group", "flip", "xcol"].includes(name)) {
    return "tables and dictionaries";
  }
  if (["sum", "avg", "min", "max", "count", "prd", "med", "dev", "var"].includes(name)) {
    return "aggregation";
  }
  if (["string", "lower", "upper", "trim", "ltrim", "rtrim", "like", "ss", "sv", "vs"].includes(name)) {
    return "text";
  }
  if (["til", "rotate", "cut", "sublist", "raze", "distinct", "enlist", "reverse"].includes(name)) {
    return "list transforms";
  }
  return kind === "monad" ? "monads" : "diads";
};

const defaultExample = (name: string, kind: BuiltinKind) => {
  if (operatorOverrides[name]?.example) {
    return operatorOverrides[name].example!;
  }
  if (kind === "monad") {
    return `${name} 1 2 3`;
  }
  return /^[A-Za-z.]+$/.test(name) ? `2 ${name} 1 2 3 4` : `1 ${name} 2`;
};

const defaultSummary = (name: string, kind: BuiltinKind) => {
  if (operatorOverrides[name]?.summary) {
    return operatorOverrides[name].summary!;
  }
  return kind === "monad"
    ? `${name} is a unary builtin in the current qpad engine.`
    : `${name} is a binary builtin in the current qpad engine.`;
};

const operatorCatalog: OperatorInfo[] = (() => {
  const builtins = builtinCatalogSource;
  const seen = new Set<string>();
  const values: OperatorInfo[] = [];

  ([
    ...builtins.monads.map((name: string) => ({ name, kind: "monad" as const })),
    ...builtins.diads.map((name: string) => ({ name, kind: "diad" as const }))
  ]).forEach(({ name, kind }) => {
    if (seen.has(`${kind}:${name}`)) {
      return;
    }
    seen.add(`${kind}:${name}`);
    values.push({
      name,
      slug: slugifyOperator(name),
      kind,
      family: detectFamily(name, kind),
      summary: defaultSummary(name, kind),
      example: defaultExample(name, kind),
      notes:
        operatorOverrides[name]?.notes ??
        [
          kind === "monad" ? "Takes one argument." : "Takes two arguments.",
          "Load the example into the pad to inspect the current browser implementation."
        ]
    });
  });

  return values.sort((left, right) => left.name.localeCompare(right.name));
})();

const parseRoute = (): Route => {
  const hash = window.location.hash.replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "ops") {
    return { page: "ops", op: unslugifyOperator(parts[1]) };
  }
  if (parts[0] === "parity") {
    return { page: "parity" };
  }
  return { page: "pad" };
};

const routeToHash = (route: Route) => {
  if (route.page === "ops") {
    return route.op ? `#/ops/${slugifyOperator(route.op)}` : "#/ops";
  }
  if (route.page === "parity") {
    return "#/parity";
  }
  return "#/pad";
};

function formatStatus(status: RunStatus) {
  if (status === "idle") {
    return "standby";
  }
  if (status === "running") {
    return "evaluating";
  }
  return status;
}

export default function App() {
  const [worker] = useState(
    () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module"
      })
  );
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const requestId = useRef(1);
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [source, setSource] = useState(starter);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [version, setVersion] = useState("booting");
  const [output, setOutput] = useState("Ready to evaluate.");
  const [canonical, setCanonical] = useState("");
  const [lastError, setLastError] = useState<SerializedError | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [operatorQuery, setOperatorQuery] = useState("");
  const [selectedOperatorName, setSelectedOperatorName] = useState("til");

  const post = (type: WorkerRequest["type"], payload: Record<string, unknown> = {}) =>
    new Promise<WorkerResponse>((resolve) => {
      const id = requestId.current++;
      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) {
          return;
        }
        worker.removeEventListener("message", handler);
        resolve(event.data);
      };

      worker.addEventListener("message", handler);
      worker.postMessage({ id, type, ...payload } as WorkerRequest);
    });

  const run = async (program = source) => {
    setStatus("running");
    setLastError(null);
    const response = await post("evaluate", { source: program });
    if (response.type === "result") {
      setStatus("ready");
      setOutput(response.text);
      setCanonical(JSON.stringify(response.canonical, null, 2));
      setHistory((items) => [program, ...items].slice(0, 10));
      return;
    }

    if (response.type === "error") {
      setStatus("error");
      setLastError(response.error);
      setOutput(response.error.message);
    }
  };

  const reset = async () => {
    setStatus("running");
    setLastError(null);
    const response = await post("reset");
    if (response.type === "ready") {
      setStatus("ready");
      setOutput("Session reset.");
      setCanonical("");
    }
  };

  useEffect(() => {
    let active = true;
    const handleWorkerCrash = (event: ErrorEvent | MessageEvent<unknown>) => {
      if (!active) {
        return;
      }
      setStatus("error");
      setOutput("Worker crashed before responding. Check the expression or reload the page.");
      if ("message" in event) {
        setLastError({
          name: "WorkerError",
          message: event.message || "Unknown worker failure"
        });
      }
    };

    worker.addEventListener("error", handleWorkerCrash);
    worker.addEventListener("messageerror", handleWorkerCrash);

    post("ping").then((response) => {
      if (!active) {
        return;
      }
      if (response.type === "ready") {
        setStatus("ready");
        setVersion(response.version);
      }
    });

    return () => {
      active = false;
      worker.removeEventListener("error", handleWorkerCrash);
      worker.removeEventListener("messageerror", handleWorkerCrash);
      worker.terminate();
    };
  }, [worker]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) {
      window.location.hash = routeToHash({ page: "pad" });
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (route.page === "ops" && route.op) {
      setSelectedOperatorName(route.op);
    }
  }, [route]);

  const beforeMount = (monaco: any) => {
    if (
      !monaco.languages
        .getLanguages()
        .some(({ id }: { id: string }) => id === "qpad-q")
    ) {
      monaco.languages.register({ id: "qpad-q" });
      monaco.languages.setMonarchTokensProvider(
        "qpad-q",
        qMonarchSyntax as unknown as languages.IMonarchLanguage
      );
      monaco.editor.defineTheme("qpad-ember", qMonarchTheme);
    }
  };

  const onMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monaco.editor.setTheme("qpad-ember");
    editorInstance.addAction({
      id: "run-q-expression",
      label: "Run q expression",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        void run(editorInstance.getValue());
      }
    });
  };

  const evaluateSelection = () => {
    const editorInstance = editorRef.current;
    const selection = editorInstance?.getSelection();
    const selectedText =
      selection && !selection.isEmpty()
        ? editorInstance?.getModel()?.getValueInRange(selection)
        : "";
    void run(selectedText && selectedText.trim().length > 0 ? selectedText : source);
  };

  const loadSnippet = (program: string) => {
    setSource(`${program}\n`);
    editorRef.current?.focus();
  };

  const runSnippet = (program: string) => {
    setSource(`${program}\n`);
    void run(program);
    editorRef.current?.focus();
  };

  const navigate = (next: Route) => {
    window.location.hash = routeToHash(next);
    setRoute(next);
  };

  const filteredOperators = useMemo(() => {
    const needle = operatorQuery.trim().toLowerCase();
    if (!needle) {
      return operatorCatalog;
    }
    return operatorCatalog.filter((operator) =>
      [operator.name, operator.family, operator.summary].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [operatorQuery]);

  const selectedOperator =
    operatorCatalog.find((operator) => operator.name === selectedOperatorName) ??
    filteredOperators[0] ??
    operatorCatalog[0]!;

  const groupedOperators = useMemo(() => {
    const groups = new Map<string, OperatorInfo[]>();
    filteredOperators.forEach((operator) => {
      const bucket = groups.get(operator.family) ?? [];
      bucket.push(operator);
      groups.set(operator.family, bucket);
    });
    return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [filteredOperators]);

  const setFocusedOperator = (name: string) => {
    setSelectedOperatorName(name);
  };

  const openOperatorPage = (name: string) => {
    setSelectedOperatorName(name);
    navigate({ page: "ops", op: name });
  };

  const operatorDetail = (operator: OperatorInfo) => (
    <article className="panel-card operator-detail-panel">
      <div className="operator-detail-top">
        <div>
          <span className="section-label">operator page</span>
          <h2>{operator.name}</h2>
        </div>
        <span className="operator-kind">{operator.kind}</span>
      </div>
      <p className="operator-summary">{operator.summary}</p>
      <div className="operator-meta-grid">
        <div className="operator-meta-card">
          <span>family</span>
          <strong>{operator.family}</strong>
        </div>
        <div className="operator-meta-card">
          <span>arity</span>
          <strong>{operator.kind === "monad" ? "1 arg" : "2 args"}</strong>
        </div>
      </div>
      <div className="operator-example">
        <span className="section-label">example</span>
        <code>{operator.example}</code>
      </div>
      <div className="operator-actions">
        <button className="action-primary small" onClick={() => runSnippet(operator.example)}>
          Run example
        </button>
        <button className="action-secondary small" onClick={() => loadSnippet(operator.example)}>
          Load into pad
        </button>
      </div>
      <div className="operator-notes">
        {operator.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
      <div className="namespace-row">
        {namespaceHint.map((item) => (
          <button key={item.label} className="namespace-card" onClick={() => runSnippet(item.label)}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>
    </article>
  );

  return (
    <div className="app-shell">
      <div className="app-noise" />
      <div className="app-orbit orbit-a" />
      <div className="app-orbit orbit-b" />
      <main className="app-frame">
        <header className="panel-card app-topbar">
          <div className="brand-block">
            <span className="brand-mark">qpad</span>
            <p>
              Pad-first q workbench, with a visible operator browser and dedicated pages for each
              builtin.
            </p>
          </div>
          <nav className="route-nav">
            <button
              className={route.page === "pad" ? "route-link route-link-active" : "route-link"}
              onClick={() => navigate({ page: "pad" })}
            >
              Pad
            </button>
            <button
              className={route.page === "ops" ? "route-link route-link-active" : "route-link"}
              onClick={() => navigate({ page: "ops", op: selectedOperator.name })}
            >
              Operators
            </button>
            <button
              className={route.page === "parity" ? "route-link route-link-active" : "route-link"}
              onClick={() => navigate({ page: "parity" })}
            >
              Parity
            </button>
          </nav>
          <div className="status-cluster">
            <span className={`meta-badge status-${status}`}>{formatStatus(status)}</span>
            <span className="version-tag">{version}</span>
          </div>
        </header>

        {route.page === "pad" ? (
          <>
            <section className="pad-grid">
              <section className="panel-card editor-panel">
                <header className="panel-heading">
                  <div>
                    <span className="section-label">pad</span>
                    <h2>Expression studio</h2>
                  </div>
                  <div className="heading-actions">
                    <button className="action-primary" onClick={evaluateSelection}>
                      Run selection
                    </button>
                    <button className="action-secondary" onClick={() => void run(source)}>
                      Run buffer
                    </button>
                    <button className="action-secondary" onClick={() => void reset()}>
                      Reset
                    </button>
                  </div>
                </header>

                <div className="utility-strip">
                  <div className="signal-pills">
                    {quickExamples.map((snippet) => (
                      <button
                        key={snippet}
                        className="snippet-pill"
                        onClick={() => loadSnippet(snippet)}
                      >
                        {snippet}
                      </button>
                    ))}
                  </div>
                  <div className="telemetry-grid">
                    {telemetry.map((item) => (
                      <article key={item.label} className="telemetry-card">
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="editor-toolbar">
                  <span>Ctrl/Cmd+Enter runs the current selection or the full buffer.</span>
                  <span>{history.length} recent evaluations</span>
                </div>

                <div className="editor-frame">
                  <Editor
                    height="100%"
                    language="qpad-q"
                    theme="qpad-ember"
                    value={source}
                    beforeMount={beforeMount}
                    onMount={onMount}
                    onChange={(value) => setSource(value ?? "")}
                    options={{
                      minimap: { enabled: false },
                      fontLigatures: true,
                      tabSize: 2,
                      wordWrap: "on",
                      smoothScrolling: true,
                      scrollBeyondLastLine: false,
                      padding: { top: 18, bottom: 18 },
                      automaticLayout: true,
                      fontSize: 15,
                      lineHeight: 24,
                      fontFamily:
                        '"IBM Plex Mono", "SFMono-Regular", "Cascadia Code", "Fira Code", monospace'
                    }}
                  />
                </div>
              </section>

              <aside className="side-stack">
                <article className="panel-card result-panel">
                  <header className="panel-heading compact">
                    <div>
                      <span className="section-label">result</span>
                      <h2>Rendered output</h2>
                    </div>
                    <span className="section-note">
                      {lastError ? lastError.name : formatStatus(status)}
                    </span>
                  </header>
                  <pre className="result-block">{output}</pre>
                </article>

                <article className="panel-card result-panel">
                  <header className="panel-heading compact">
                    <div>
                      <span className="section-label">canonical</span>
                      <h2>Diff payload</h2>
                    </div>
                  </header>
                  <pre className="result-block canonical-block">{canonical || "[]"}</pre>
                </article>

                {lastError ? (
                  <article className="panel-card result-panel error-panel">
                    <header className="panel-heading compact">
                      <div>
                        <span className="section-label">error</span>
                        <h2>{lastError.name}</h2>
                      </div>
                    </header>
                    <pre className="result-block error-block">{lastError.message}</pre>
                  </article>
                ) : null}

                {operatorDetail(selectedOperator)}

                <article className="panel-card history-panel">
                  <header className="panel-heading compact">
                    <div>
                      <span className="section-label">history</span>
                      <h2>Recent evaluations</h2>
                    </div>
                  </header>
                  <div className="history-list">
                    {history.length === 0 ? (
                      <p className="empty-state">Run something and it will stay here.</p>
                    ) : (
                      history.map((item, index) => (
                        <button
                          key={`${index}-${item.slice(0, 20)}`}
                          className="history-item"
                          onClick={() => setSource(item)}
                        >
                          <span className="history-index">{String(index + 1).padStart(2, "0")}</span>
                          <span className="history-source">{item}</span>
                        </button>
                      ))
                    )}
                  </div>
                </article>
              </aside>
            </section>

            <section className="panel-card browser-panel">
              <div className="browser-head">
                <div>
                  <span className="section-label">operator browser</span>
                  <h2>All current ops stay visible from the pad</h2>
                </div>
                <div className="browser-actions">
                  <input
                    className="operator-search"
                    placeholder="Search operators, families, summaries"
                    value={operatorQuery}
                    onChange={(event) => setOperatorQuery(event.target.value)}
                  />
                  <button
                    className="action-secondary small"
                    onClick={() => navigate({ page: "ops", op: selectedOperator.name })}
                  >
                    Open operator pages
                  </button>
                </div>
              </div>

              <div className="browser-groups">
                {groupedOperators.map(([family, operators]) => (
                  <section key={family} className="operator-group">
                    <header className="operator-group-head">
                      <span className="section-label">{family}</span>
                      <strong>{operators.length}</strong>
                    </header>
                    <div className="operator-chip-grid">
                      {operators.map((operator) => (
                        <button
                          key={`${operator.kind}-${operator.name}`}
                          className={
                            operator.name === selectedOperator.name
                              ? "operator-chip operator-chip-active"
                              : "operator-chip"
                          }
                          onClick={() => setFocusedOperator(operator.name)}
                          onDoubleClick={() => openOperatorPage(operator.name)}
                        >
                          <span>{operator.name}</span>
                          <small>{operator.kind}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {route.page === "ops" ? (
          <section className="ops-page-grid">
            <aside className="panel-card ops-browser-panel">
              <div className="browser-head browser-head-tight">
                <div>
                  <span className="section-label">operators</span>
                  <h2>Selectable builtin index</h2>
                </div>
                <input
                  className="operator-search"
                  placeholder="Search the operator catalog"
                  value={operatorQuery}
                  onChange={(event) => setOperatorQuery(event.target.value)}
                />
              </div>
              <div className="ops-list">
                {groupedOperators.map(([family, operators]) => (
                  <section key={family} className="operator-group">
                    <header className="operator-group-head">
                      <span className="section-label">{family}</span>
                      <strong>{operators.length}</strong>
                    </header>
                    <div className="ops-list-stack">
                      {operators.map((operator) => (
                        <button
                          key={`${operator.kind}-${operator.name}`}
                          className={
                            operator.name === selectedOperator.name
                              ? "ops-row ops-row-active"
                              : "ops-row"
                          }
                          onClick={() => openOperatorPage(operator.name)}
                        >
                          <span>{operator.name}</span>
                          <small>{operator.kind}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </aside>

            {operatorDetail(selectedOperator)}
          </section>
        ) : null}

        {route.page === "parity" ? (
          <section className="docs-page-grid">
            <div className="reference-header">
              <div>
                <span className="section-label">parity board</span>
                <h2>Official q, browser qpad, and TimeStored jq on one sheet</h2>
              </div>
              <p>
                The reference surface stays separate from the pad now, so the editor gets the
                first screen and this page can stay focused on compatibility and test coverage.
              </p>
            </div>

            <div className="reference-layout">
              <div className="quickcheck-grid">
                {quickCheckGroups.map((group) => (
                  <article key={group.title} className="panel-card quickcheck-panel">
                    <div className="quickcheck-header">
                      <span className="section-label">quick checks</span>
                      <h3>{group.title}</h3>
                    </div>
                    <div className="quickcheck-list">
                      {group.items.map((item) => (
                        <div key={`${group.title}-${item.label}`} className="quickcheck-item">
                          <div className="quickcheck-copy">
                            <strong>{item.label}</strong>
                            <code>{item.program}</code>
                          </div>
                          <div className="quickcheck-actions">
                            <button
                              className="action-secondary small"
                              onClick={() => {
                                loadSnippet(item.program);
                                navigate({ page: "pad" });
                              }}
                            >
                              Load in pad
                            </button>
                            <button
                              className="action-primary small"
                              onClick={() => {
                                runSnippet(item.program);
                                navigate({ page: "pad" });
                              }}
                            >
                              Run in pad
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="panel-card parity-panel">
                <div className="parity-strip">
                  <span>{paritySummary.referenceFixtures} official snippets</span>
                  <span>{paritySummary.upstreamFixtures} jq fixtures</span>
                  <span>{paritySummary.browserSafeFixtures} browser-safe cases</span>
                  <span>.Q and .z tracked</span>
                </div>
                <div className="parity-table-wrap">
                  <table className="parity-table">
                    <thead>
                      <tr>
                        <th>Surface</th>
                        <th>Category</th>
                        <th>Official q</th>
                        <th>Ours</th>
                        <th>jq</th>
                        <th>Parity vs q</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parityRows.map((row) => (
                        <tr key={`${row.category}-${row.surface}`}>
                          <td className="surface-cell">{row.surface}</td>
                          <td>{row.category}</td>
                          <td>
                            <span className={`level level-${row.officialQ.level}`}>
                              {row.officialQ.label}
                            </span>
                          </td>
                          <td>
                            <span className={`level level-${row.ours.level}`}>{row.ours.label}</span>
                          </td>
                          <td>
                            <span className={`level level-${row.jq.level}`}>{row.jq.label}</span>
                          </td>
                          <td>
                            <span className={`level level-${row.parity.level}`}>
                              {row.parity.label}
                            </span>
                          </td>
                          <td className="note-cell">{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
