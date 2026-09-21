import { describe, expect, it } from "vitest";

import { SuggestionErrorCode, createMapperClient } from "./index";
import type { MapperFetch, SourceAnalysis } from "./index";

const analysis: SourceAnalysis = {
  file: { id: "file-1", name: "contacts.csv", size: 12 },
  sheets: [{ name: "Sheet1", columns: ["name"], rows: 1 }]
};

describe("@mapper-fe/client", () => {
  it("uses JSON protocol for schema, analyze by id, and import", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: MapperFetch = async (input, init) => {
      requests.push({ url: String(input), init });
      const path = new URL(String(input)).pathname;
      const body = path === "/schemas/7"
        ? { id: 7, name: "contact", fields: [] }
        : path === "/files/analyze"
          ? analysis
          : { processed: 1, succeeded: 1, failed: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const client = createMapperClient("https://mapper.test/api/", fetcher);

    await client.getSchema(7);
    await client.analyzeFileId("file-1");
    await client.import({
      file_id: "file-1",
      schema_id: 7,
      sheet: 0,
      mappings: [{ source: 0, target: 42 }]
    });

    expect(requests.map(({ url }) => url)).toEqual([
      "https://mapper.test/api/schemas/7",
      "https://mapper.test/api/files/analyze",
      "https://mapper.test/api/imports/sync"
    ]);
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({ file_id: "file-1" });
    expect(JSON.parse(String(requests[2].init?.body))).toEqual({
      file_id: "file-1",
      schema_id: 7,
      sheet: 0,
      mappings: [{ source: 0, target: 42 }]
    });
  });

  it("posts suggestion inputs and returns reviewed mappings", async () => {
    let request: RequestInit | undefined;
    const fetcher: MapperFetch = async (input, init) => {
      expect(String(input)).toBe("https://mapper.test/mappings/suggest");
      request = init;
      return new Response(JSON.stringify({
        suggestions: [{ source: 0, target: 42, confidence: 0.91, reason: "name match" }],
        model: "fuzzy"
      }), { status: 200 });
    };
    const client = createMapperClient("https://mapper.test", fetcher);

    await expect(client.suggest(
      7,
      ["full name", "email"],
      [{ number: 1, values: { "full name": "Ada" } }],
      { min_confidence: 0.8, limit: 2 }
    )).resolves.toEqual({
      suggestions: [{ source: 0, target: 42, confidence: 0.91, reason: "name match" }],
      model: "fuzzy"
    });

    expect(request?.method).toBe("POST");
    expect((request?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(request?.body))).toEqual({
      schema_id: 7,
      columns: ["full name", "email"],
      samples: [{ number: 1, values: { "full name": "Ada" } }],
      options: { min_confidence: 0.8, limit: 2 }
    });
  });

  it("keeps typed suggester errors actionable", async () => {
    const fetcher: MapperFetch = async () =>
      new Response(JSON.stringify({
        error: { code: SuggestionErrorCode.SuggesterUnavailable, message: "try later" }
      }), { status: 503 });
    const client = createMapperClient("https://mapper.test", fetcher);

    await expect(client.suggest(7, ["email"])).rejects.toMatchObject({
      name: "MapperError",
      code: SuggestionErrorCode.SuggesterUnavailable,
      status: 503,
      message: "try later"
    });
  });

  it("sends uploaded files as multipart without overriding boundary", async () => {
    let request: RequestInit | undefined;
    const fetcher: MapperFetch = async (_input, init) => {
      request = init;
      return new Response(JSON.stringify(analysis), { status: 200 });
    };
    const client = createMapperClient({ baseUrl: "https://mapper.test", fetch: fetcher });

    await client.analyzeFile(new Blob(["name\nAda\n"], { type: "text/csv" }), "contacts.csv");

    expect(request?.method).toBe("POST");
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.headers as Record<string, string>).Accept).toBe("application/json");
    expect((request?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("decodes backend error envelopes", async () => {
    const fetcher: MapperFetch = async () =>
      new Response(JSON.stringify({ error: { code: "schema_not_found", message: "missing" } }), {
        status: 404
      });
    const client = createMapperClient("https://mapper.test", fetcher);

    await expect(client.getSchema(99)).rejects.toMatchObject({
      name: "MapperError",
      code: "schema_not_found",
      status: 404,
      message: "missing"
    });
  });
});
