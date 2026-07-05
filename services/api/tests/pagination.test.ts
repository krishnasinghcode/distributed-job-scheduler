import { describe, it, expect } from "vitest";
import { parsePagination, buildPaginatedResult } from "@scheduler/shared";

describe("pagination", () => {
  it("defaults to page 1, pageSize 20", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("clamps pageSize to 100 max", () => {
    expect(parsePagination({ pageSize: "500" })).toEqual({ page: 1, pageSize: 100 });
  });

  it("rejects negative/zero page numbers by clamping to 1", () => {
    expect(parsePagination({ page: "-5" })).toEqual({ page: 1, pageSize: 20 });
  });

  it("computes totalPages correctly", () => {
    const result = buildPaginatedResult([1, 2, 3], 45, { page: 2, pageSize: 20 });
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(2);
  });
});
