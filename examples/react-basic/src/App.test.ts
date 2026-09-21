import { describe, expect, it } from "vitest";

import {
  SAMPLE_TARGET_FIELDS,
  connectMapping,
  mapRows,
  parseCsv
} from "./App";

describe("mapping canvas helpers", () => {
  it("replaces target connection while preserving other links", () => {
    const mappings = connectMapping(
      [{ source: 0, target: "subscriber.msisdn" }, { source: 2, target: "joined_at" }],
      1,
      "subscriber.msisdn"
    );

    expect(mappings).toEqual([
      { source: 1, target: "subscriber.msisdn" },
      { source: 2, target: "joined_at" }
    ]);
  });

  it("coerces mapped source values into target field types", () => {
    const rows = mapRows(
      [{ PhoneNumber: "+1 415 555 0188", Joined: "2024-05-21", OptIn: "yes" }],
      ["PhoneNumber", "Joined", "OptIn"],
      SAMPLE_TARGET_FIELDS,
      [
        { source: 0, target: "subscriber.msisdn" },
        { source: 1, target: "joined_at" },
        { source: 2, target: "marketing_opt_in" }
      ]
    );

    expect(rows[0]).toMatchObject({
      "subscriber.msisdn": "+1 415 555 0188",
      joined_at: "2024-05-21T00:00:00.000Z",
      marketing_opt_in: true,
      status: null
    });
  });

  it("parses quoted CSV cells for local file overrides", () => {
    expect(parseCsv("PhoneNumber,State\n\"+1, 415\",active\n")).toEqual({
      columns: ["PhoneNumber", "State"],
      rows: [{ PhoneNumber: "+1, 415", State: "active" }]
    });
  });
});
