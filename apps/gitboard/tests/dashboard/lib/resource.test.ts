/** @vitest-environment happy-dom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDashboardResourceDelta, invalidateDashboardResource, useDashboardResource } from "../../../src/dashboard/lib/resource.ts";

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const makePayload = (value: string) => ({ value });

describe("useDashboardResource", () => {
  it("keeps last successful data after fetch error", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makePayload("alpha"))
      .mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useDashboardResource({
      key: "resource-last-success",
      cacheTtlMs: 10_000,
      fetcher: async (_key, _options) => fetcher(),
    }));

    await waitFor(() => expect(result.current.data).toEqual(makePayload("alpha")));
    await act(async () => { await result.current.refresh({ force: true, refresh: true }); });
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.data).toEqual(makePayload("alpha"));
  });

  it("coalesces repeated invalidations into one refetch", async () => {
    const fetcher = vi.fn().mockResolvedValue(makePayload("alpha"));
    renderHook(() => useDashboardResource({
      key: "resource-invalidate",
      cacheTtlMs: 10_000,
      fetcher: async () => fetcher(),
    }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    invalidateDashboardResource("resource-invalidate");
    invalidateDashboardResource("resource-invalidate");

    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("refreshes on focus and visibility change", async () => {
    const fetcher = vi.fn().mockResolvedValue(makePayload("alpha"));
    renderHook(() => useDashboardResource({
      key: "resource-focus",
      cacheTtlMs: 10_000,
      fetcher: async () => fetcher(),
    }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("supports forced refresh", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(makePayload("alpha"))
      .mockResolvedValueOnce(makePayload("beta"));

    const { result } = renderHook(() => useDashboardResource({
      key: "resource-force",
      cacheTtlMs: 10_000,
      fetcher: async () => fetcher(),
    }));

    await waitFor(() => expect(result.current.data).toEqual(makePayload("alpha")));
    await act(async () => { await result.current.refresh({ force: true, refresh: true }); });
    await waitFor(() => expect(result.current.data).toEqual(makePayload("beta")));
  });

  it("polls while visible", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(makePayload("alpha"));
    renderHook(() => useDashboardResource({
      key: "resource-poll",
      cacheTtlMs: 10_000,
      pollMs: 100,
      fetcher: async () => fetcher(),
    }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("applies ws delta without refetch", async () => {
    const fetcher = vi.fn().mockResolvedValue(makePayload("alpha"));
    renderHook(() => useDashboardResource({
      key: "resource-delta",
      cacheTtlMs: 10_000,
      fetcher: async () => fetcher(),
    }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const updated = applyDashboardResourceDelta<{ value: string }>("resource-delta", (current) => ({ ...current, value: "beta" }));
    expect(updated).toEqual(makePayload("beta"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries once for stale empty data", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ value: "" })
      .mockResolvedValueOnce({ value: "filled" });

    renderHook(() => useDashboardResource({
      key: "resource-stale",
      cacheTtlMs: 10_000,
      staleEmptyRetryMs: 100,
      isEmpty: (data) => data.value === "",
      fetcher: async () => fetcher(),
    }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
