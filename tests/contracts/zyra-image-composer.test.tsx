import { describe, expect, test } from "bun:test";
import {
  handleZyraImagePasteEvent,
  selectZyraImageFiles,
  zyraImageFilesFromClipboard,
} from "@/lib/zyra/images";

describe("Zyra image composer contract", () => {
  test("keeps text composition independent from bounded image selection", () => {
    const first = new File([new Uint8Array([1])], "diagram.png", { type: "image/png", lastModified: 5 });
    const result = selectZyraImageFiles([], [first]);
    expect(result.accepted[0]?.name).toBe("diagram.png");
    expect(result.accepted[0]?.status).toBe("uploading");
  });

  test("accepts pasted image clipboard items and ignores pasted text", () => {
    const image = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const files = zyraImageFilesFromClipboard([
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => image },
    ]);
    expect(files).toEqual([image]);
  });

  test("does not duplicate a pasted file when clipboard items and FileList represent the same paste with different metadata", () => {
    const image = new File(["one"], "image.png", { type: "image/png", lastModified: 5 });
    const fileListCopy = new File(["one"], "screenshot.png", { type: "image/png", lastModified: 6 });
    expect(zyraImageFilesFromClipboard([
      { kind: "file", type: "image/png", getAsFile: () => image },
    ], [fileListCopy])).toEqual([image]);
  });

  test("falls back to FileList when clipboard items yield no files and keeps multiple distinct pasted items", () => {
    const first = new File(["one"], "first.png", { type: "image/png", lastModified: 5 });
    const duplicateFirst = new File(["one"], "first.png", { type: "image/png", lastModified: 7 });
    const second = new File(["two"], "second.png", { type: "image/png", lastModified: 6 });
    const note = new File(["hello"], "notes.txt", { type: "text/plain", lastModified: 8 });

    expect(zyraImageFilesFromClipboard([
      { kind: "file", type: "image/png", getAsFile: () => first },
      { kind: "file", type: "image/png", getAsFile: () => duplicateFirst },
      { kind: "file", type: "text/plain", getAsFile: () => note },
      { kind: "file", type: "image/png", getAsFile: () => second },
    ])).toEqual([first, second]);

    expect(zyraImageFilesFromClipboard([
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => null },
    ], [first, second])).toEqual([first, second]);
  });

  test("normalizes generic octet-stream, image/jpg aliases, and empty clipboard filenames", () => {
    const octetPng = new File(["png"], "diagram.png", { type: "application/octet-stream", lastModified: 10 });
    const jpgAlias = new File(["jpg"], "photo.jpg", { type: "image/jpg", lastModified: 11 });
    const unnamed = new File(["anon"], "   ", { type: "image/png", lastModified: 12 });
    const itemTypedOctet = new File(["oct"], "clip.png", { type: "application/octet-stream", lastModified: 13 });

    const extracted = zyraImageFilesFromClipboard([
      { kind: "file", type: "application/octet-stream", getAsFile: () => octetPng },
      { kind: "file", type: "image/jpg", getAsFile: () => jpgAlias },
      { kind: "file", type: "image/png", getAsFile: () => unnamed },
      { kind: "file", type: "image/png", getAsFile: () => itemTypedOctet },
    ]);

    expect(extracted.map((file) => [file.name, file.type])).toEqual([
      ["diagram.png", "image/png"],
      ["photo.jpg", "image/jpeg"],
      ["gambar.png", "image/png"],
      ["clip.png", "image/png"],
    ]);

    const selected = selectZyraImageFiles([], extracted);
    expect(selected.rejected).toEqual([]);
    expect(selected.accepted.map((item) => [item.name, item.mimeType])).toEqual([
      ["diagram.png", "image/png"],
      ["photo.jpg", "image/jpeg"],
      ["gambar.png", "image/png"],
      ["clip.png", "image/png"],
    ]);
  });

  test("handles capture and bubble paste events once for images and leaves non-image pastes unprevented", () => {
    const pasted = new File(["img"], "pasted.png", { type: "image/png", lastModified: 20 });
    const siblingFileList = new File(["img"], "image.png", { type: "image/png", lastModified: 21 });
    let prevented = 0;
    let stopped = 0;
    const received: File[][] = [];
    const event = {
      defaultPrevented: false,
      clipboardData: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => pasted }],
        files: [siblingFileList],
      },
      preventDefault() {
        prevented += 1;
        this.defaultPrevented = true;
      },
      stopPropagation() {
        stopped += 1;
      },
    };

    expect(handleZyraImagePasteEvent(event, { onFiles: (files) => received.push(files) })).toBe(true);
    expect(handleZyraImagePasteEvent(event, { onFiles: (files) => received.push(files) })).toBe(false);
    expect(prevented).toBe(1);
    expect(stopped).toBe(1);
    expect(received).toEqual([[pasted]]);

    let textPrevented = 0;
    const textEvent = {
      defaultPrevented: false,
      clipboardData: {
        items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
        files: [],
      },
      preventDefault() {
        textPrevented += 1;
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    };
    expect(handleZyraImagePasteEvent(textEvent, { onFiles: (files) => received.push(files) })).toBe(false);
    expect(textPrevented).toBe(0);
    expect(received).toEqual([[pasted]]);

    expect(handleZyraImagePasteEvent({
      defaultPrevented: false,
      clipboardData: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => pasted }],
        files: [],
      },
      preventDefault() {
        textPrevented += 1;
      },
      stopPropagation() {},
    }, { disabled: true, onFiles: (files) => received.push(files) })).toBe(false);
    expect(textPrevented).toBe(0);
  });

  test("successive selections reject a duplicate and retain distinct files within the limit", () => {
    const image = new File(["one"], "clipboard.png", { type: "image/png", lastModified: 5 });
    const other = new File(["two"], "other.png", { type: "image/png", lastModified: 6 });
    const first = selectZyraImageFiles([], [image]);
    const second = selectZyraImageFiles(first.accepted, [image, other]);
    expect(second.rejected).toEqual(["DUPLICATE_IMAGE"]);
    expect(second.accepted.map((item) => item.file)).toEqual([image, other]);
  });
});
