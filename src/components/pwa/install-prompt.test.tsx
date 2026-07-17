import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import { InstallPrompt } from "./install-prompt";

const DISMISSED_KEY = "workount:install-dismissed";

function renderPrompt() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InstallPrompt />
    </NextIntlClientProvider>,
  );
}

function setUserAgent(userAgent: string) {
  vi.stubGlobal("navigator", {
    ...navigator,
    userAgent,
    standalone: false,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The pure decision table (which platform shows what, when) is covered by
// install-prompt.test.ts. This file covers the wiring: the actual
// beforeinstallprompt event, and that a dismissal is remembered.
describe("InstallPrompt", () => {
  it("renders nothing until a beforeinstallprompt event has fired (non-iOS)", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/120");
    renderPrompt();

    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });

  it("shows an Install button once beforeinstallprompt fires, and calls prompt() on click", async () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/120");
    renderPrompt();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", {
      cancelable: true,
    }) as Event & { prompt: () => Promise<void> };
    event.prompt = prompt;
    window.dispatchEvent(event);

    const installButton = await screen.findByText("Install");
    await userEvent.click(installButton);

    expect(prompt).toHaveBeenCalledOnce();
    // Installing counts as "handled" — the banner never shows again.
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("shows iOS instructions without waiting for beforeinstallprompt, and dismiss persists", async () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    renderPrompt();

    expect(
      await screen.findByText(/Add to Home Screen/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Dismiss"));

    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("stays dismissed across a remount", () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    renderPrompt();

    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
  });
});
