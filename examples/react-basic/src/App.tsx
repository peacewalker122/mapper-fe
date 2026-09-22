import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";

export type TargetType = "string" | "datetime" | "boolean";
export type SourceRow = Record<string, string>;
export type Mapping = { source: number; target: string };
export type TypedCell = string | number | boolean | null;
export type TypedRow = Record<string, TypedCell>;

export interface TargetField {
  id: string;
  name: string;
  type: TargetType;
  required: boolean;
}

export interface ParsedCsv {
  columns: string[];
  rows: SourceRow[];
}

export const SAMPLE_COLUMNS = [
  "PhoneNumber",
  "State",
  "Joined-At",
  "Plan",
  "MarketingOptIn"
] as const;

export const SAMPLE_ROWS: SourceRow[] = [
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

export const SAMPLE_TARGET_FIELDS: TargetField[] = [
  { id: "subscriber.msisdn", name: "subscriber.msisdn", type: "string", required: true },
  { id: "status", name: "status", type: "string", required: true },
  { id: "joined_at", name: "joined_at", type: "datetime", required: true },
  { id: "plan", name: "plan", type: "string", required: false },
  { id: "marketing_opt_in", name: "marketing_opt_in", type: "boolean", required: false }
];

export const SAMPLE_MAPPINGS: Mapping[] = SAMPLE_TARGET_FIELDS.map((field, source) => ({
  source,
  target: field.id
}));

const TARGET_ALIASES: Record<string, string[]> = {
  "subscriber.msisdn": ["phone", "mobile", "msisdn"],
  status: ["state", "status"],
  joined_at: ["joined", "signup", "created"],
  plan: ["plan", "tier"],
  marketing_opt_in: ["marketing", "optin", "consent"]
};

interface Point {
  x: number;
  y: number;
}

interface DragState {
  sourceIndex: number;
  pointer: Point;
}

interface SimulationResult {
  processed: number;
  succeeded: number;
  failed: number;
}

const INITIAL_CANVAS_SIZE = { width: 1, height: 1 };

export function connectMapping(
  mappings: readonly Mapping[],
  source: number,
  target: string
): Mapping[] {
  return [...mappings.filter((mapping) => mapping.target !== target), { source, target }]
    .sort((left, right) => left.source - right.source || left.target.localeCompare(right.target));
}

export function disconnectMapping(
  mappings: readonly Mapping[],
  target: string
): Mapping[] {
  return mappings.filter((mapping) => mapping.target !== target);
}

export function suggestMappings(
  columns: readonly string[],
  targetFields: readonly TargetField[] = SAMPLE_TARGET_FIELDS
): Mapping[] {
  return targetFields.flatMap((field) => {
    const aliases = TARGET_ALIASES[field.id] ?? [normalizeName(field.name)];
    const source = columns.findIndex((column) => {
      const normalized = normalizeName(column);
      return aliases.some((alias) => normalized.includes(alias));
    });
    return source === -1 ? [] : [{ source, target: field.id }];
  });
}

export function mapRows(
  rows: readonly SourceRow[],
  columns: readonly string[],
  targetFields: readonly TargetField[],
  mappings: readonly Mapping[]
): TypedRow[] {
  return rows.map((row) => Object.fromEntries(targetFields.map((field) => {
    const mapping = mappings.find((item) => item.target === field.id);
    const rawValue = mapping === undefined ? undefined : row[columns[mapping.source]];
    return [field.id, coerceValue(rawValue, field.type)];
  })) as TypedRow);
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
  const normalizedHeaders = header.map(normalizeName);
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

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function coerceValue(value: string | undefined, type: TargetType): TypedCell {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (type === "boolean") {
    if (/^(true|yes|1)$/i.test(trimmed)) return true;
    if (/^(false|no|0)$/i.test(trimmed)) return false;
    return trimmed;
  }
  if (type === "datetime") {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
  }
  return trimmed;
}


function curvePath(from: Point, to: Point): string {
  const bend = Math.max(48, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}

export function App() {
  const [sourceColumns, setSourceColumns] = useState<string[]>(() => [...SAMPLE_COLUMNS]);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>(() => (
    SAMPLE_ROWS.map((row) => ({ ...row }))
  ));
  const [sourceName, setSourceName] = useState("sample-subscribers.csv");
  const [mappings, setMappings] = useState<Mapping[]>(() => [...SAMPLE_MAPPINGS]);
  const [uploadError, setUploadError] = useState<string>();
  const [readingUpload, setReadingUpload] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult>();
  const [dragging, setDragging] = useState<DragState>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [nodePoints, setNodePoints] = useState<Record<string, Point>>({});
  const [canvasSize, setCanvasSize] = useState(INITIAL_CANVAS_SIZE);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});

  const typedRows = mapRows(sourceRows, sourceColumns, SAMPLE_TARGET_FIELDS, mappings);
  const mappedTargetIds = new Set(mappings.map((mapping) => mapping.target));
  const mappedSourceIndexes = new Set(mappings.map((mapping) => mapping.source));
  const requiredTargets = SAMPLE_TARGET_FIELDS.filter((field) => field.required);
  const readyToSimulate = sourceRows.length > 0 &&
    requiredTargets.every((field) => mappedTargetIds.has(field.id));
  const mappedCount = SAMPLE_TARGET_FIELDS.filter((field) => mappedTargetIds.has(field.id)).length;

  function registerNode(id: string) {
    return (node: HTMLElement | null) => {
      nodeRefs.current[id] = node;
    };
  }

  function measureNodes() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const points = Object.fromEntries(Object.entries(nodeRefs.current).flatMap(([id, node]) => {
      if (!node) return [];
      const rect = node.getBoundingClientRect();
      const isSource = id.startsWith("source-");
      return [[id, {
        x: (isSource ? rect.right : rect.left) - canvasRect.left,
        y: rect.top - canvasRect.top + rect.height / 2
      }]];
    })) as Record<string, Point>;
    setNodePoints(points);
    setCanvasSize({ width: Math.max(canvas.clientWidth, 1), height: Math.max(canvas.clientHeight, 1) });
  }

  useLayoutEffect(() => {
    measureNodes();
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(measureNodes);
    if (observer && canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener("resize", measureNodes);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureNodes);
    };
  }, [sourceColumns]);

  function canvasPoint(clientX: number, clientY: number): Point {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  }

  function targetAt(clientX: number, clientY: number): string | undefined {
    const element = document.elementFromPoint(clientX, clientY);
    const targetNode = element?.closest("[data-target-node]") as HTMLElement | null;
    return targetNode?.dataset.targetNode;
  }

  useEffect(() => {
    if (!dragging) return;
    const sourceIndex = dragging.sourceIndex;
    const handleMove = (event: PointerEvent) => {
      setDragging((current) => current
        ? { ...current, pointer: canvasPoint(event.clientX, event.clientY) }
        : current);
      setDropTarget(targetAt(event.clientX, event.clientY));
    };
    const handleUp = (event: PointerEvent) => {
      const target = targetAt(event.clientX, event.clientY);
      if (target) {
        setMappings((current) => connectMapping(current, sourceIndex, target));
        setSimulation(undefined);
      }
      setDragging(undefined);
      setDropTarget(undefined);
    };
    const handleCancel = () => {
      setDragging(undefined);
      setDropTarget(undefined);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [dragging?.sourceIndex]);

  function startConnection(sourceIndex: number, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging({
      sourceIndex,
      pointer: canvasPoint(event.clientX, event.clientY)
    });
    setDropTarget(undefined);
  }

  function clearMapping(target: string) {
    setMappings((current) => disconnectMapping(current, target));
    setSimulation(undefined);
  }

  function changeMapping(target: string, rawSource: string) {
    setMappings((current) => rawSource === ""
      ? disconnectMapping(current, target)
      : connectMapping(current, Number(rawSource), target));
    setSimulation(undefined);
  }

  function handleSourceReset() {
    setSourceColumns([...SAMPLE_COLUMNS]);
    setSourceRows(SAMPLE_ROWS.map((row) => ({ ...row })));
    setSourceName("sample-subscribers.csv");
    setMappings([...SAMPLE_MAPPINGS]);
    setUploadError(undefined);
    setSimulation(undefined);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setReadingUpload(true);
    setUploadError(undefined);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.rows.length === 0) throw new Error("CSV needs at least one data row.");
      setSourceColumns(parsed.columns);
      setSourceRows(parsed.rows);
      setSourceName(file.name);
      setMappings(suggestMappings(parsed.columns));
      setSimulation(undefined);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not read CSV.");
    } finally {
      setReadingUpload(false);
    }
  }

  function simulateImport() {
    if (!readyToSimulate) return;
    const failed = typedRows.filter((row) => requiredTargets.some((field) => row[field.id] === null)).length;
    setSimulation({
      processed: typedRows.length,
      succeeded: typedRows.length - failed,
      failed
    });
  }

  const connectedEdges = mappings.flatMap((mapping) => {
    const from = nodePoints[`source-${mapping.source}`];
    const to = nodePoints[`target-${mapping.target}`];
    return from && to ? [{ mapping, path: curvePath(from, to) }] : [];
  });
  const previewPath = dragging
    ? nodePoints[`source-${dragging.sourceIndex}`] &&
      curvePath(nodePoints[`source-${dragging.sourceIndex}`], dragging.pointer)
    : undefined;

  return (
    <div className="demo-shell">
      <header className="demo-intro">
        <div className="demo-topline">
          <p className="demo-kicker">Mapper Frontend SDK</p>
          <span className="demo-local-badge"><span aria-hidden="true">●</span> Local demo · no backend</span>
        </div>
        <h1>Map messy subscriber data into a stable schema.</h1>
        <p className="demo-lede">
          Sample rows are ready. Connect source columns to target fields, then simulate the typed import.
        </p>
      </header>

      <ol className="flow-steps" aria-label="Mapping flow">
        <li className="flow-step flow-step--active">
          <span className="flow-step__number">01</span>
          <span><strong>Source data</strong><small>Sample loaded</small></span>
        </li>
        <li className="flow-step flow-step--active">
          <span className="flow-step__number">02</span>
          <span><strong>Connect fields</strong><small>{mappedCount} of {SAMPLE_TARGET_FIELDS.length} mapped</small></span>
        </li>
        <li className="flow-step">
          <span className="flow-step__number">03</span>
          <span><strong>Import / Simulate</strong><small>Preview typed rows</small></span>
        </li>
      </ol>

      <section className="panel source-panel" aria-labelledby="source-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">01 · Source</p>
            <h2 id="source-title">Sample subscriber rows</h2>
            <p>Messy headers stay visible so mapping decisions are clear.</p>
          </div>
          <span className="panel-count">{sourceRows.length} rows</span>
        </div>
        <div className="source-toolbar">
          <label className="file-action">
            <span>{readingUpload ? "Reading CSV…" : "Replace with CSV"}</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={readingUpload} />
          </label>
          <button type="button" className="button button--quiet" onClick={handleSourceReset}>
            Use sample again
          </button>
          <span className="source-file"><span aria-hidden="true">▣</span> {sourceName}</span>
        </div>
        {uploadError ? <p className="inline-error" role="alert">{uploadError}</p> : null}
        <div className="table-scroll">
          <table className="data-table source-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                {sourceColumns.map((column) => <th scope="col" key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((row, rowIndex) => (
                <tr key={`${sourceName}-${rowIndex}`}>
                  <th scope="row">{String(rowIndex + 1).padStart(2, "0")}</th>
                  {sourceColumns.map((column) => <td key={column}>{row[column] || "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel canvas-panel" aria-labelledby="canvas-title">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">02 · Connect</p>
            <h2 id="canvas-title">Build mapping</h2>
            <p id="mapping-help">
              <span className="mapping-help__desktop">Drag from any source node on left to target field on right.</span>
              <span className="mapping-help__mobile">Choose a source column for each target field.</span>
            </p>
          </div>
          <div className="canvas-actions">
            <span className="connection-count">{mappedCount} connected</span>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setMappings([]);
                setSimulation(undefined);
              }}
              disabled={mappings.length === 0}
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="mapping-canvas__mobile" aria-label="Mobile mapping controls">
          <p className="mapping-canvas__mobile-intro">Choose source column for each target field.</p>
          <div className="mapping-canvas__mobile-list">
            {SAMPLE_TARGET_FIELDS.map((field) => {
              const mapping = mappings.find((item) => item.target === field.id);
              return (
                <label className="mapping-canvas__mobile-row" key={field.id}>
                  <span className="mapping-canvas__mobile-target">
                    <strong>{field.name}</strong>
                    <small>{field.type}{field.required ? " · required" : " · optional"}</small>
                  </span>
                  <select
                    aria-label={`Source for ${field.name}`}
                    value={mapping ? String(mapping.source) : ""}
                    onChange={(event) => changeMapping(field.id, event.currentTarget.value)}
                  >
                    <option value="">Unmapped</option>
                    {sourceColumns.map((column, index) => (
                      <option value={index} key={`${column}-${index}`}>{column}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>

        <div
          className="mapping-canvas__viewport"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="mapping-canvas__body" ref={canvasRef}>
            <svg
              className="mapping-canvas__wires"
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="mapping-flow-gradient" x1="0" x2="1">
                  <stop offset="0" stopColor="#73a7ff" />
                  <stop offset="1" stopColor="#57e3c2" />
                </linearGradient>
              </defs>
              {connectedEdges.map(({ mapping, path }) => (
                <g key={`${mapping.source}-${mapping.target}`}>
                  <path d={path} className="mapping-edge__base" />
                  <path d={path} className="mapping-edge__flow" />
                </g>
              ))}
              {previewPath ? <path d={previewPath} className="mapping-edge__preview" /> : null}
            </svg>

            <div className="mapping-canvas__column mapping-canvas__column--source">
              <div className="mapping-column-heading">
                <span className="mapping-column-heading__eyebrow">INPUT</span>
                <strong>Source columns</strong>
                <small>Drag from here</small>
              </div>
              {sourceColumns.map((column, index) => {
                const connectedTarget = mappings.find((mapping) => mapping.source === index)?.target;
                const targetName = SAMPLE_TARGET_FIELDS.find((field) => field.id === connectedTarget)?.name;
                return (
                  <button
                    type="button"
                    className={`mapping-node mapping-node--source${mappedSourceIndexes.has(index) ? " is-connected" : ""}`}
                    key={`${column}-${index}`}
                    ref={registerNode(`source-${index}`)}
                    onPointerDown={(event) => startConnection(index, event)}
                    aria-describedby="mapping-help"
                    aria-label={`Drag ${column} to a target field`}
                  >
                    <span className="mapping-node__copy">
                      <span className="mapping-node__label">{column}</span>
                      <small>{targetName ? `→ ${targetName}` : `source_${index + 1}`}</small>
                    </span>
                    <span className="mapping-node__port mapping-node__port--out" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <div className="mapping-canvas__center" aria-hidden="true">
              <span className="mapping-canvas__center-line" />
              <span className="mapping-canvas__center-label">{dragging ? "Release to connect" : "data flow"}</span>
            </div>

            <div className="mapping-canvas__column mapping-canvas__column--target">
              <div className="mapping-column-heading">
                <span className="mapping-column-heading__eyebrow">OUTPUT</span>
                <strong>Subscriber schema</strong>
                <small>Drop on a field</small>
              </div>
              {SAMPLE_TARGET_FIELDS.map((field) => {
                const mapping = mappings.find((item) => item.target === field.id);
                return (
                  <div
                    className={`mapping-node mapping-node--target${mapping ? " is-connected" : ""}${dropTarget === field.id ? " is-drop-target" : ""}`}
                    key={field.id}
                    ref={registerNode(`target-${field.id}`)}
                    data-target-node={field.id}
                  >
                    <div
                      className="mapping-node__target-body"
                      role="button"
                      tabIndex={0}
                      aria-pressed={Boolean(mapping)}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && mapping) {
                          event.preventDefault();
                          clearMapping(field.id);
                        }
                      }}
                    >
                      <span className="mapping-node__port mapping-node__port--in" aria-hidden="true" />
                      <span className="mapping-node__copy">
                        <span className="mapping-node__label">{field.name}</span>
                        <small>{field.type}{field.required ? " · required" : " · optional"}</small>
                      </span>
                    </div>
                    {mapping ? (
                      <button
                        type="button"
                        className="mapping-node__clear"
                        aria-label={`Clear mapping for ${field.name}`}
                        onClick={() => clearMapping(field.id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="canvas-status" role="status" aria-live="polite">
          {dragging
            ? `Dragging ${sourceColumns[dragging.sourceIndex] ?? "source column"} — release over target field.`
            : (
              <>
                <span className="canvas-status__desktop">Connected pairs glow. Animated dashes show source-to-target flow.</span>
                <span className="canvas-status__mobile">Choose source columns above to update mapping.</span>
              </>
            )}
        </p>
      </section>

      <section className="panel simulation-panel" aria-labelledby="simulation-title">
        <div className="simulation-heading">
          <div className="simulation-heading__title">
            <span className="step-badge">03</span>
            <div>
              <p className="section-kicker">Import / Simulate</p>
              <h2 id="simulation-title">See typed rows before sending them anywhere.</h2>
            </div>
          </div>
          <button
            type="button"
            className="button button--primary"
            onClick={simulateImport}
            disabled={!readyToSimulate}
          >
            {simulation ? "Run simulation again" : `Simulate import · ${sourceRows.length} rows`}
          </button>
        </div>
        <div className="simulation-meta">
          <span className="local-note"><span aria-hidden="true">↯</span> Local mock · no request is sent</span>
          <span>{mappedCount}/{SAMPLE_TARGET_FIELDS.length} fields connected</span>
        </div>
        {!readyToSimulate ? (
          <p className="simulation-warning" role="alert">
            Connect required fields to enable simulation: {requiredTargets
              .filter((field) => !mappedTargetIds.has(field.id))
              .map((field) => field.name)
              .join(", ")}.
          </p>
        ) : null}
        {simulation ? (
          <div className="simulation-result" role="status">
            <strong>Local import complete</strong>
            <span>{simulation.succeeded} succeeded · {simulation.failed} failed · {simulation.processed} processed</span>
          </div>
        ) : null}
        <div className="preview-heading">
          <div>
            <h3>Typed rows preview</h3>
            <p>Values are coerced using target field types.</p>
          </div>
          <span className="preview-badge">OUTPUT</span>
        </div>
        <div className="table-scroll">
          <table className="data-table typed-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                {SAMPLE_TARGET_FIELDS.map((field) => (
                  <th scope="col" key={field.id}>{field.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {typedRows.map((row, rowIndex) => (
                <tr key={`typed-${rowIndex}`}>
                  <th scope="row">{String(rowIndex + 1).padStart(2, "0")}</th>
                  {SAMPLE_TARGET_FIELDS.map((field) => (
                    <td key={field.id}>
                      <span className={row[field.id] === null ? "typed-cell typed-cell--empty" : "typed-cell"}>
                        {row[field.id] === null ? "—" : String(row[field.id])}
                      </span>
                      <small>{field.type}</small>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
