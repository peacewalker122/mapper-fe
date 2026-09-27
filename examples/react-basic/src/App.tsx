import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  suggestLocalMappings,
  validateMappings
} from "@mapper-fe/core";
import type {
  MappingSpec,
  MappingSuggestion,
  MappingTargetField
} from "@mapper-fe/core";
import { MappingEditor, ReactFlowAdapter } from "@mapper-fe/react";

type SourceRow = Record<string, string>;

interface ParsedCsv {
  columns: string[];
  rows: SourceRow[];
}

const DEMO_SCHEMA_ID = 1;
const SAMPLE_COLUMNS = ["PhoneNumber", "State", "Joined-At", "Plan", "MarketingOptIn"];
const SAMPLE_ROWS: SourceRow[] = [
  {
    PhoneNumber: "+1 (415) 555-0188",
    State: "active",
    "Joined-At": "2024-05-21",
    Plan: "growth",
    MarketingOptIn: "true"
  },
  {
    PhoneNumber: "+44 20 7946 0958",
    State: "trial",
    "Joined-At": "2024-06-03",
    Plan: "starter",
    MarketingOptIn: "false"
  },
  {
    PhoneNumber: "+61 2 9374 4000",
    State: "paused",
    "Joined-At": "2024-07-14",
    Plan: "growth",
    MarketingOptIn: "yes"
  }
];
const TARGET_FIELDS: MappingTargetField[] = [
  { id: 101, name: "subscriber.msisdn", required: true },
  { id: 102, name: "status", required: true },
  { id: 103, name: "joined_at", required: true },
  { id: 104, name: "plan", required: false },
  { id: 105, name: "marketing_opt_in", required: false }
];

function emptyMapping(fileID: string): MappingSpec {
  return {
    file_id: fileID,
    schema_id: DEMO_SCHEMA_ID,
    sheet: 0,
    mappings: []
  };
}

function suggestionKey(suggestion: MappingSuggestion): string {
  return `${suggestion.source}:${suggestion.target}`;
}

const GRAPH_WIDTH = 600;
const GRAPH_SOURCE_WIDTH = 240;
const GRAPH_HEADER_HEIGHT = 40;
const GRAPH_NODE_HEIGHT = 56;

function MappingGraph({
  mapping,
  sourceColumns
}: {
  mapping: MappingSpec;
  sourceColumns: readonly string[];
}) {
  const graph = ReactFlowAdapter(mapping, sourceColumns, TARGET_FIELDS);
  const nodesByID = new Map(graph.nodes.map((node) => [node.id, node]));
  const connectedNodes = new Set(graph.edges.flatMap(({ source, target }) => [source, target]));
  const lastNodeY = graph.nodes.reduce((max, node) => Math.max(max, node.position.y), 0);
  const height = GRAPH_HEADER_HEIGHT + lastNodeY + GRAPH_NODE_HEIGHT + 16;
  const description = graph.edges.length === 0
    ? "No accepted mappings yet."
    : `Accepted mappings: ${graph.edges.map(({ source, target }) =>
      `${nodesByID.get(source)?.data.label ?? source} to ${nodesByID.get(target)?.data.label ?? target}`
    ).join("; ")}.`;

  return (
    <>
      <div
        className="mapping-graph"
        role="img"
        aria-label={`Mapping graph. ${description}`}
        style={{ height }}
      >
        <span className="mapping-graph__column-label">Source columns</span>
        <span className="mapping-graph__column-label mapping-graph__column-label--target">Target fields</span>
        <svg
          className="mapping-graph__wires"
          viewBox={`0 0 ${GRAPH_WIDTH} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker id="mapping-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const source = nodesByID.get(edge.source);
            const target = nodesByID.get(edge.target);
            if (!source || !target) return null;
            const fromX = source.position.x + GRAPH_SOURCE_WIDTH;
            const toX = target.position.x;
            const fromY = GRAPH_HEADER_HEIGHT + source.position.y + GRAPH_NODE_HEIGHT / 2;
            const toY = GRAPH_HEADER_HEIGHT + target.position.y + GRAPH_NODE_HEIGHT / 2;
            const bend = (toX - fromX) / 2;
            return (
              <path
                key={edge.id}
                className="mapping-graph__edge"
                d={`M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`}
                markerEnd="url(#mapping-graph-arrow)"
              />
            );
          })}
        </svg>
        {graph.nodes.map((node) => (
          <div
            className={`mapping-graph__node mapping-graph__node--${node.type}${connectedNodes.has(node.id) ? " is-connected" : ""}`}
            key={node.id}
            style={{
              left: `${(node.position.x / GRAPH_WIDTH) * 100}%`,
              top: GRAPH_HEADER_HEIGHT + node.position.y
            }}
            title={node.data.label}
          >
            <span className="mapping-graph__node-label">{node.data.label}</span>
            <small>
              {node.type === "source"
                ? `Column ${node.data.index + 1}`
                : node.data.required ? "Required" : "Optional"}
            </small>
          </div>
        ))}
      </div>
      <p className="mapping-graph__caption">
        {graph.edges.length === 0
          ? "No accepted mappings yet. Choose a source or accept a suggestion to add an edge."
          : "Edges show accepted mappings only."}
      </p>
    </>
  );
}

export function parseCsv(input: string): ParsedCsv {
  const rawRows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  const finishRow = () => {
    row.push(value);
    rawRows.push(row);
    row = [];
    value = "";
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "\"") {
      if (quoted && input[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      finishRow();
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (value.length > 0 || row.length > 0) finishRow();

  const header = rawRows[0]?.map((column) => column.trim()) ?? [];
  if (header[0]?.startsWith("\uFEFF")) header[0] = header[0].slice(1);
  if (header.length === 0 || header.some((column) => column.length === 0)) {
    throw new Error("CSV needs a non-empty header row.");
  }
  const normalizedHeaders = header.map((column) => column.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("CSV headers must be unique.");
  }

  const rows = rawRows.slice(1)
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => Object.fromEntries(
      header.map((column, index) => [column, (cells[index] ?? "").trim()])
    ) as SourceRow);
  return { columns: header, rows };
}

export function App() {
  const [sourceColumns, setSourceColumns] = useState(SAMPLE_COLUMNS);
  const [sourceRows, setSourceRows] = useState(() => SAMPLE_ROWS.map((row) => ({ ...row })));
  const [sourceName, setSourceName] = useState("sample-subscribers.csv");
  const [mapping, setMapping] = useState(() => emptyMapping("local-preview"));
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const [readingUpload, setReadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [validationRequested, setValidationRequested] = useState(false);

  const suggestions = useMemo(
    () => suggestLocalMappings(sourceColumns, TARGET_FIELDS).filter((suggestion) =>
      !mapping.mappings.some((item) => item.target === suggestion.target) &&
      !dismissedSuggestions.has(suggestionKey(suggestion))
    ),
    [sourceColumns, mapping.mappings, dismissedSuggestions]
  );
  const validation = validationRequested
    ? validateMappings(mapping, sourceColumns, TARGET_FIELDS)
    : undefined;

  function updateMapping(next: MappingSpec) {
    setMapping(next);
    setValidationRequested(false);
  }

  function resetSample() {
    setSourceColumns(SAMPLE_COLUMNS);
    setSourceRows(SAMPLE_ROWS.map((row) => ({ ...row })));
    setSourceName("sample-subscribers.csv");
    setMapping(emptyMapping("local-preview"));
    setDismissedSuggestions(new Set());
    setUploadError(undefined);
    setValidationRequested(false);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setReadingUpload(true);
    setUploadError(undefined);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.rows.length === 0) throw new Error("CSV needs at least one data row.");
      setSourceColumns(parsed.columns);
      setSourceRows(parsed.rows);
      setSourceName(file.name);
      setMapping(emptyMapping("local-preview"));
      setDismissedSuggestions(new Set());
      setValidationRequested(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not read CSV.");
    } finally {
      setReadingUpload(false);
    }
  }

  function dismissSuggestion(suggestion: MappingSuggestion) {
    setDismissedSuggestions((current) => new Set(current).add(suggestionKey(suggestion)));
  }

  return (
    <main className="demo-shell">
      <header className="demo-intro">
        <div className="demo-topline">
          <p className="demo-kicker">Mapper frontend SDK</p>
          <span className="demo-local-badge">Local demo – no backend</span>
        </div>
        <h1>Map CSV columns to a schema.</h1>
        <p className="demo-lede">
          Review SDK suggestions, accept matches yourself, and inspect the resulting <code>MappingSpec</code>.
          This page does not send files or mappings to a server.
        </p>
      </header>

      <section className="panel source-panel" aria-labelledby="source-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Source file</p>
            <h2 id="source-title">Sample subscriber rows</h2>
          </div>
          <span className="panel-count">{sourceRows.length} rows</span>
        </div>
        <div className="source-toolbar">
          <label className="button button--primary file-control">
            <span>{readingUpload ? "Reading CSV…" : "Choose CSV"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose a CSV file"
              onChange={handleFileChange}
              disabled={readingUpload}
            />
          </label>
          <button type="button" className="button button--quiet" onClick={resetSample}>
            Restore sample
          </button>
          <span className="source-file">{sourceName}</span>
        </div>
        {uploadError ? <p className="inline-error" role="alert">{uploadError}</p> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                {sourceColumns.map((column, index) => <th scope="col" key={`${column}-${index}`}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((row, rowIndex) => (
                <tr key={`${sourceName}-${rowIndex}`}>
                  <th scope="row">{rowIndex + 1}</th>
                  {sourceColumns.map((column, index) => (
                    <td key={`${column}-${index}`}>{row[column] || "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mapping-panel" aria-labelledby="mapping-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Mapping</p>
            <h2 id="mapping-title">Review source-to-target matches</h2>
            <p>Suggestions stay separate from the mapping until you accept them.</p>
          </div>
          <span className="panel-count">{mapping.mappings.length} mapped</span>
        </div>
        <MappingGraph mapping={mapping} sourceColumns={sourceColumns} />

        <MappingEditor
          className="demo-sdk-editor"
          sourceColumns={sourceColumns}
          targetFields={TARGET_FIELDS}
          value={mapping}
          onChange={updateMapping}
          suggestions={suggestions}
          onSuggestionDismiss={dismissSuggestion}
          validation={validation}
        />
        <div className="mapping-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => setValidationRequested(true)}
          >
            Validate mapping
          </button>
          <span>{mapping.mappings.length} of {TARGET_FIELDS.length} fields mapped</span>
        </div>
        {validation?.valid ? (
          <p className="inline-success" role="status">Mapping passes SDK validation. No import was sent.</p>
        ) : null}
      </section>

      <section className="panel contract-panel" aria-labelledby="contract-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Request preview</p>
            <h2 id="contract-title">MappingSpec</h2>
            <p><code>file_id</code> is a local placeholder in this demo.</p>
          </div>
        </div>
        <pre className="mapping-json"><code>{JSON.stringify(mapping, null, 2)}</code></pre>
      </section>
    </main>
  );
}
