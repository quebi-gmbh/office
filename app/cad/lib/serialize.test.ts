import { describe, expect, test } from "bun:test";
import { decodeShare, docFromJson, docToJson, encodeShare, readShareFromHash } from "./serialize";
import { createBox, newDoc } from "./factory";
import type { CadDoc } from "./types";

function sampleDoc(): CadDoc {
  const d = newDoc("Widget");
  d.features.push(createBox());
  return d;
}

describe("json roundtrip", () => {
  test("docToJson / docFromJson preserves the document", () => {
    const doc = sampleDoc();
    const back = docFromJson(docToJson(doc));
    expect(back).not.toBeNull();
    expect(back!.name).toBe("Widget");
    expect(back!.features).toHaveLength(1);
    expect(back!.features[0].type).toBe("box");
  });

  test("docFromJson rejects garbage", () => {
    expect(docFromJson("not json")).toBeNull();
    expect(docFromJson("{}")).toBeNull();
  });
});

describe("share-by-URL", () => {
  test("encode/decode roundtrip", () => {
    const doc = sampleDoc();
    const payload = encodeShare(doc);
    expect(payload).not.toContain("+");
    expect(payload).not.toContain("/");
    const back = decodeShare(payload);
    expect(back!.name).toBe("Widget");
  });

  test("readShareFromHash extracts the doc", () => {
    const doc = sampleDoc();
    const hash = `#doc=${encodeShare(doc)}`;
    expect(readShareFromHash(hash)!.name).toBe("Widget");
    expect(readShareFromHash("#other=1")).toBeNull();
  });
});
