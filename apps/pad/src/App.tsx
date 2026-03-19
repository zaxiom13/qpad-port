import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { qMonarchSyntax, qMonarchTheme } from "@qpad/language";
import type { editor, languages } from "monaco-editor";
import type { SerializedError, WorkerRequest, WorkerResponse } from "./protocol";
import { parityRows, paritySummary } from "./parity-data";

type RunStatus = "idle" | "running" | "ready" | "error";

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

export default function App() {
  const [worker] = useState(
    () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module"
      })
  );
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const requestId = useRef(1);
  const [source, setSource] = useState(starter);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [version, setVersion] = useState("booting");
  const [output, setOutput] = useState("Ready to evaluate.");
  const [canonical, setCanonical] = useState<string>("");
  const [lastError, setLastError] = useState<SerializedError | null>(null);
  const [history, setHistory] = useState<string[]>([]);

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

  const namespaceHint = [
    { label: ".Q.n", value: "0123456789" },
    { label: ".Q.A", value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
    { label: ".z.K", value: "current date marker" },
    { label: ".z.T", value: "current time marker" }
  ];

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

  return (
    <div className="shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />
      <main className="layout">
        <section className="hero panel">
          <div className="eyebrow-row">
            <span className={`status status-${status}`}>{status}</span>
            <span className="chip">{version}</span>
            <span className="chip">browser-native</span>
          </div>
          <h1>qpad</h1>
          <p className="lede">
            A browser-first q scratchpad with a dedicated worker, Monaco editor, and a
            warm ember-and-ink visual language.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={evaluateSelection}>
              Run expression
            </button>
            <button className="ghost" onClick={() => void reset()}>
              Reset session
            </button>
          </div>
          <div className="namespace-grid">
            {namespaceHint.map((item) => (
              <article key={item.label} className="namespace-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="snippet-cloud">
            {quickExamples.map((snippet) => (
              <button
                key={snippet}
                className="snippet"
                onClick={() => loadSnippet(snippet)}
              >
                {snippet}
              </button>
            ))}
          </div>
          <div className="sanity-board">
            {quickCheckGroups.map((group) => (
              <section key={group.title} className="sanity-group">
                <div className="sanity-group-header">
                  <span className="panel-kicker">Quick checks</span>
                  <h2>{group.title}</h2>
                </div>
                <div className="sanity-grid">
                  {group.items.map((item) => (
                    <article key={`${group.title}-${item.label}`} className="sanity-card">
                      <div className="sanity-copy">
                        <strong>{item.label}</strong>
                        <code>{item.program}</code>
                      </div>
                      <div className="sanity-actions">
                        <button
                          className="subtle sanity-action"
                          onClick={() => loadSnippet(item.program)}
                        >
                          Load
                        </button>
                        <button
                          className="primary sanity-action"
                          onClick={() => runSnippet(item.program)}
                        >
                          Run
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="editor panel">
          <header className="panel-header">
            <div>
              <span className="panel-kicker">Pad</span>
              <h2>Expression bench</h2>
            </div>
            <div className="panel-actions">
              <button className="subtle" onClick={evaluateSelection}>
                Evaluate
              </button>
              <button
                className="subtle"
                onClick={() => {
                  evaluateSelection();
                }}
              >
                Evaluate selection
              </button>
            </div>
          </header>
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
          <footer className="editor-footer">
            <span>Ctrl/Cmd+Enter to run</span>
            <span>{history.length} recent runs</span>
          </footer>
        </section>

        <section className="output-stack">
          <article className="panel output-card">
            <header className="panel-header compact">
              <div>
                <span className="panel-kicker">Result</span>
                <h2>Rendered output</h2>
              </div>
            </header>
            <pre className="output">{output}</pre>
          </article>

          <article className="panel output-card">
            <header className="panel-header compact">
              <div>
                <span className="panel-kicker">Canonical</span>
                <h2>Diff payload</h2>
              </div>
            </header>
            <pre className="output canonical">{canonical || "[]"}</pre>
          </article>

          <article className="panel output-card history-card">
            <header className="panel-header compact">
              <div>
                <span className="panel-kicker">History</span>
                <h2>Recent evaluations</h2>
              </div>
            </header>
            <div className="history-list">
              {history.length === 0 ? (
                <p className="empty">Run something and it will stay here.</p>
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

          {lastError ? (
            <article className="panel output-card error-card">
              <header className="panel-header compact">
                <div>
                  <span className="panel-kicker">Error</span>
                  <h2>{lastError.name}</h2>
                </div>
              </header>
              <pre className="output error">{lastError.message}</pre>
            </article>
          ) : null}
        </section>

        <section className="panel reference-strip">
          <div className="reference-copy">
            <div>
              <span className="panel-kicker">Parity Board</span>
              <h2>Official q vs ours vs TimeStored jq</h2>
            </div>
            <p className="reference-note">
              This is the honest snapshot for the browser-native engine: official q is the
              target, `jq` is the JVM guide rail, and our parity badges show how close the
              in-browser runtime is today.
            </p>
          </div>
          <div className="reference-pills">
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
        </section>
      </main>
    </div>
  );
}
