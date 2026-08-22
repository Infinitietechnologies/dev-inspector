import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLocation } from "../src/fiber";

afterEach(() => vi.unstubAllGlobals());

describe("SSR stack-frame resolution", () => {
  it("marks React Server Component frames as server App Router frames", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          status: "fulfilled",
          value: {
            originalStackFrame: {
              file: "app/page.tsx",
              line1: 19,
              column1: 7,
              ignored: false,
            },
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveLocation([
        {
          methodName: "Page",
          file: "about://React/Server/.next/server/app/page.js?1",
          line1: 50,
          column1: 10,
        },
      ])
    ).resolves.toMatchObject({ file: "app/page.tsx", line1: 19 });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      isServer: true,
      isEdgeServer: false,
      isAppDirectory: true,
    });
  });
});
