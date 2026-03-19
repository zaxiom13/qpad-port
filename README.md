# qpad-port

Browser-first TypeScript q engine workbench with:

- a pure engine package that can run in Node or the browser
- a React pad app that talks to the engine through a worker boundary
- a real-`q` differential harness for fixture generation and parity checks
- imported Monaco language tooling based on Scott Logic's `kdb-boothroyd`

## Workspace

- `packages/q-core`: runtime values, type tags, sentinels, canonicalization
- `packages/q-engine`: tokenizer, parser, session model, evaluator, formatting
- `packages/q-language`: Monaco q syntax and theme definitions
- `packages/q-oracle`: scripts and tests that talk to real `q`
- `apps/pad`: browser-only React pad UI

## Notes

- Browser-hostile features such as disk, IPC, and sockets are intentionally out of scope for the engine host.
- The engine ships `.Q` and `.z` namespaces in a browser-safe shape and uses a pluggable host adapter for time, env, and console configuration.
- The differential harness is designed to grow beyond the current implementation surface, so unsupported cases are visible instead of silently disappearing.

