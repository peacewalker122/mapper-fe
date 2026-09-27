import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App, parseCsv } from "./App";

describe("CSV preview parser", () => {
  it("parses quoted cells containing commas", () => {
    expect(parseCsv("PhoneNumber,State\n\"+1, 415\",active\n")).toEqual({
      columns: ["PhoneNumber", "State"],
      rows: [{ PhoneNumber: "+1, 415", State: "active" }]
    });
  });

  it("rejects duplicate normalized headers", () => {
    expect(() => parseCsv("Phone Number,Phone-Number\nfirst,second"))
      .toThrow("CSV headers must be unique.");
  });
});

describe("SDK example", () => {
  it("renders the package editor without applying suggestions", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain('aria-label="Mapping editor"');
    expect(markup).toContain('data-suggestion-action="accept"');
    expect(markup).toContain("&quot;mappings&quot;: []");
  });
});
