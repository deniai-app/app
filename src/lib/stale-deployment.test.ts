import { describe, expect, it } from "vitest";
import { isStaleDeploymentError } from "./stale-deployment";

describe("isStaleDeploymentError", () => {
  it("matches Turbopack missing module factory errors", () => {
    const error = new Error(
      "Module 897145 was instantiated because it was required from module 893963, but the module factory is not available.",
    );
    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("matches chunk load errors", () => {
    const error = new Error("Loading chunk 123 failed.");
    error.name = "ChunkLoadError";
    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("ignores unrelated errors and non-errors", () => {
    expect(isStaleDeploymentError(new TypeError("Cannot read properties of undefined"))).toBe(
      false,
    );
    expect(isStaleDeploymentError("module factory is not available")).toBe(false);
  });
});
