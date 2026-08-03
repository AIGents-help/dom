import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Smartlead client — missing credentials", () => {
  const originalKey = process.env.SMARTLEAD_API_KEY;

  beforeEach(() => {
    delete process.env.SMARTLEAD_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SMARTLEAD_API_KEY;
    else process.env.SMARTLEAD_API_KEY = originalKey;
  });

  it("listCampaigns throws SmartleadNotConfiguredError when SMARTLEAD_API_KEY is unset", async () => {
    // Re-import fresh so the module doesn't cache an api key read earlier.
    const { listCampaigns, SmartleadNotConfiguredError } = await import("./smartlead");
    await expect(listCampaigns()).rejects.toBeInstanceOf(SmartleadNotConfiguredError);
  });

  it("addLeadsToCampaign throws the same error, never making a network call", async () => {
    const { addLeadsToCampaign, SmartleadNotConfiguredError } = await import("./smartlead");
    await expect(addLeadsToCampaign(1, [{ email: "a@b.com" }])).rejects.toBeInstanceOf(SmartleadNotConfiguredError);
  });
});
