import Editor, { type OnMount } from "@monaco-editor/react";
import { qMonarchSyntax, qMonarchTheme } from "@qpad/language";
import type { editor, languages } from "monaco-editor";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  namespaceHint,
  operatorCatalog,
  quickCheckGroups,
  quickExamples,
  slugifyOperator,
  starter,
  type OperatorInfo,
  unslugifyOperator
} from "./operator-catalog";
import { parityRows, paritySummary } from "./parity-data";
import type { SerializedError, WorkerRequest } from "./protocol";
import {
  DEFAULT_PREVIEW_TEXT,
  createPadWorker,
  postWorkerRequest,
  previewTextFromResponse
} from "./worker-client";

type RunStatus = "idle" | "running" | "ready" | "error";
type Route = { page: "pad" } | { page: "ops"; op?: string } | { page: "parity" };

const telemetry = [
  { value: `${paritySummary.browserSafeFixtures}`, label: "browser-safe fixtures" },
  { value: `${paritySummary.referenceFixtures}`, label: "official q references" },
  { value: `${paritySummary.upstreamFixtures}`, label: "jq comparisons" }
];

const HISTORY_LIMIT = 10;
const DEFAULT_OUTPUT = "Ready to evaluate.";
const SESSION_RESET_OUTPUT = "Session reset.";
const WORKER_CRASH_OUTPUT =
  "Worker crashed before responding. Check the expression or reload the page.";
const DEFAULT_VERSION = "booting";
const STATUS_LABELS: Record<RunStatus, string> = {
  idle: "standby",
  running: "evaluating",
  ready: "ready",
  error: "error"
};

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
  return STATUS_LABELS[status];
}

export default function App() {
  const [worker] = useState(createPadWorker);
  const [previewWorker] = useState(createPadWorker);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const requestId = useRef(1);
  const previewRequestId = useRef(1);
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [source, setSource] = useState(starter);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [output, setOutput] = useState(DEFAULT_OUTPUT);
  const [canonical, setCanonical] = useState("");
  const [lastError, setLastError] = useState<SerializedError | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [operatorQuery, setOperatorQuery] = useState("");
  const [selectedOperatorName, setSelectedOperatorName] = useState("til");
  const [previewReady, setPreviewReady] = useState(false);
  const [examplePreviews, setExamplePreviews] = useState<Record<string, string>>({});

  const post = (type: WorkerRequest["type"], payload: Record<string, unknown> = {}) =>
    postWorkerRequest(worker, requestId, type, payload);

  const postPreview = (type: WorkerRequest["type"], payload: Record<string, unknown> = {}) =>
    postWorkerRequest(previewWorker, previewRequestId, type, payload);

  const run = async (program = source) => {
    setStatus("running");
    setLastError(null);
    const response = await post("evaluate", { source: program });
    if (response.type === "result") {
      setStatus("ready");
      setOutput(response.text);
      setCanonical(JSON.stringify(response.canonical, null, 2));
      setHistory((items) => [program, ...items].slice(0, HISTORY_LIMIT));
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
      setOutput(SESSION_RESET_OUTPUT);
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
      setOutput(WORKER_CRASH_OUTPUT);
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
    let active = true;

    postPreview("ping").then((response) => {
      if (!active) {
        return;
      }
      if (response.type === "ready") {
        setPreviewReady(true);
      }
    });

    return () => {
      active = false;
      previewWorker.terminate();
    };
  }, [previewWorker]);

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

  useEffect(() => {
    if (!previewReady) {
      return;
    }

    const programs = [
      ...new Set([
        ...operatorCatalog.map((operator) => operator.example),
        ...quickCheckGroups.flatMap((group) => group.items.map((item) => item.program))
      ])
    ];

    let cancelled = false;

    const prerun = async () => {
      for (const program of programs) {
        if (cancelled || examplePreviews[program]) {
          continue;
        }
        await postPreview("reset");
        const response = await postPreview("evaluate", { source: program });
        if (cancelled) {
          return;
        }
        setExamplePreviews((current) => {
          if (current[program]) {
            return current;
          }
          return {
            ...current,
            [program]: previewTextFromResponse(response)
          };
        });
      }
    };

    void prerun();

    return () => {
      cancelled = true;
    };
  }, [previewReady, examplePreviews]);

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

  const previewFor = (program: string) => examplePreviews[program] ?? DEFAULT_PREVIEW_TEXT;

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
      <div className="operator-preview">
        <span className="section-label">preview</span>
        <pre className="result-block preview-block">{previewFor(operator.example)}</pre>
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
                          <small>{previewFor(operator.example)}</small>
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
                          <small>{previewFor(operator.example)}</small>
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
                            <pre className="quickcheck-preview">{previewFor(item.program)}</pre>
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
