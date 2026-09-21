import { describe, expect, it } from "vitest";

import { MappingEditor, ReactFlowAdapter } from "./index";
import type { Suggestion } from "@mapper-fe/client";
import type { MappingSpec } from "@mapper-fe/core";
const spec = {
  file_id: "file-1",
  schema_id: 7,
  sheet: 0,
  mappings: [{ source: 1, target: 101 }]
};


type ElementLike = {
  type: unknown;
  props: Record<string, unknown>;
};

function collectElements(value: unknown): ElementLike[] {
  if (Array.isArray(value)) return value.flatMap(collectElements);
  if (!value || typeof value !== "object" || !("type" in value) || !("props" in value)) {
    return [];
  }
  const element = value as ElementLike;
  return [element, ...collectElements(element.props.children)];
}

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "props" in value) {
    return textContent((value as ElementLike).props.children);
  }
  return "";
}
describe("ReactFlowAdapter", () => {
  it("derives UI keys from indexes without exposing stable field IDs", () => {
    const graph = ReactFlowAdapter(
      spec,
      ["name", "email"],
      [
        { id: 101, name: "full_name", required: true },
        { id: 202, name: "address", required: false }
      ]
    );

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "source-0",
      "source-1",
      "target-0",
      "target-1"
    ]);
    expect(graph.edges).toEqual([
      {
        id: "mapping-1-0-0",
        source: "source-1",
        target: "target-0",
        data: { source_index: 1, target_index: 0 }
      }
    ]);
    expect(JSON.stringify(graph)).not.toContain("101");
    expect(JSON.stringify(graph)).not.toContain("202");
  });
});

describe("MappingEditor suggestion review", () => {
  it("shows confidence and applies or dismisses only after explicit clicks", () => {
    const value: MappingSpec = {
      file_id: "file-1",
      schema_id: 7,
      sheet: 0,
      mappings: []
    };
    const suggestion: Suggestion = {
      source: 0,
      target: 202,
      confidence: 0.84,
      reason: "same name"
    };
    const changes: MappingSpec[] = [];
    const accepted: Suggestion[] = [];
    const dismissed: Suggestion[] = [];
    const tree = MappingEditor({
      sourceColumns: ["address"],
      targetFields: [{ id: 202, name: "address", required: false }],
      value,
      suggestions: [suggestion],
      onChange: (next) => changes.push(next),
      onSuggestionAccept: (item) => accepted.push(item),
      onSuggestionDismiss: (item) => dismissed.push(item)
    });
    const elements = collectElements(tree);
    const button = (action: string) => elements.find((element) =>
      element.type === "button" && element.props["data-suggestion-action"] === action
    );

    expect(textContent(tree)).toContain("84% confidence");
    expect(changes).toEqual([]);

    const accept = button("accept");
    const dismiss = button("dismiss");
    expect(accept).toBeDefined();
    expect(dismiss).toBeDefined();
    (accept?.props.onClick as () => void)();
    (dismiss?.props.onClick as () => void)();

    expect(changes).toEqual([{ ...value, mappings: [{ source: 0, target: 202 }] }]);
    expect(accepted).toEqual([suggestion]);
    expect(dismissed).toEqual([suggestion]);
    expect(value.mappings).toEqual([]);
  });
});
