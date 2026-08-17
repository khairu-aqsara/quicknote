import { describe, expect, it } from "vitest";
import { isAbsolutePath, resolveImageSrc } from "./images";

/** Stands in for the WebView's file-to-URL step. */
const convert = (path: string) => `asset://${path}`;

describe("isAbsolutePath", () => {
  it("accepts a POSIX path", () => {
    expect(isAbsolutePath("/photos/a.png")).toBe(true);
  });

  // Windows writes three forms, and only one of them starts with a slash.
  it("accepts every Windows form", () => {
    expect(isAbsolutePath("C:/photos/a.png")).toBe(true);
    expect(isAbsolutePath("C:\\photos\\a.png")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share\\a.png")).toBe(true);
  });

  it("rejects a relative path", () => {
    expect(isAbsolutePath("photos/a.png")).toBe(false);
    expect(isAbsolutePath("./a.png")).toBe(false);
  });
});

describe("resolveImageSrc", () => {
  it("joins a relative reference onto the note directory", () => {
    expect(resolveImageSrc("a.png", "/notes", convert)).toBe(
      "asset:///notes/a.png",
    );
  });

  it("leaves an absolute reference where it is", () => {
    expect(resolveImageSrc("/photos/a.png", "/notes", convert)).toBe(
      "asset:///photos/a.png",
    );
  });

  // PRD Section 25 — QuickNote makes no network request.
  it("refuses a remote address", () => {
    expect(
      resolveImageSrc("https://example.com/a.png", "/notes", convert),
    ).toBe(null);
    expect(resolveImageSrc("ws://example.com/a.png", "/notes", convert)).toBe(
      null,
    );
  });

  it("passes a data URI straight through", () => {
    const uri = "data:image/png;base64,AAAA";
    expect(resolveImageSrc(uri, "/notes", convert)).toBe(uri);
  });

  /// A backend with no file protocol still renders `data:`, and nothing else.
  it("resolves nothing local without a converter", () => {
    expect(resolveImageSrc("a.png", "/notes", null)).toBe(null);
    expect(resolveImageSrc("data:image/png;base64,AA", "/notes", null)).toBe(
      "data:image/png;base64,AA",
    );
  });

  it("reports null when the converter throws", () => {
    const broken = () => {
      throw new Error("no scope for that directory");
    };
    expect(resolveImageSrc("a.png", "/notes", broken)).toBe(null);
  });
});
