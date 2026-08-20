import { describe, expect, it } from "vitest";
import { instagramAttachmentType, readAttachment } from "./attachment.ts";

/*
  The database enforces the type/path pair with a CHECK, but this reader also
  runs against rows written before that constraint existed and against joined
  selects that may omit the columns entirely. Every way an attachment can be
  half-present has to resolve to "no attachment" rather than to a send that
  fails at Telegram.
*/
describe("readAttachment", () => {
  const full = {
    attachment_type: "photo",
    attachment_path: "user-1/abc-guide.png",
    attachment_name: "guide.png",
  };

  it("reads a complete attachment", () => {
    expect(readAttachment(full)).toEqual({
      type: "photo",
      path: "user-1/abc-guide.png",
      name: "guide.png",
    });
  });

  it("treats 'none' as nothing attached", () => {
    expect(readAttachment({ ...full, attachment_type: "none" })).toBeNull();
  });

  it("treats a missing path as nothing attached", () => {
    expect(readAttachment({ ...full, attachment_path: "" })).toBeNull();
    expect(readAttachment({ ...full, attachment_path: "   " })).toBeNull();
  });

  it("rejects a type no sender knows how to send", () => {
    expect(readAttachment({ ...full, attachment_type: "sticker" })).toBeNull();
  });

  it("survives a row that never selected the columns", () => {
    expect(readAttachment({})).toBeNull();
    expect(readAttachment(null)).toBeNull();
    expect(readAttachment(undefined)).toBeNull();
  });

  it("defaults the name, which is cosmetic", () => {
    expect(readAttachment({ ...full, attachment_name: "" })?.name).toBe("");
  });
});

describe("instagramAttachmentType", () => {
  it("maps Telegram's words to Meta's", () => {
    expect(instagramAttachmentType("photo")).toBe("image");
    expect(instagramAttachmentType("video")).toBe("video");
    // Instagram has no document type; a PDF goes as a generic file.
    expect(instagramAttachmentType("document")).toBe("file");
  });
});
