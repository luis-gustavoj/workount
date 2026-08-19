import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import { TabBar } from "./tab-bar";

const mockPathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

function renderBar(pathname: string) {
  mockPathname.mockReturnValue(pathname);
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TabBar />
    </NextIntlClientProvider>,
  );
}

describe("TabBar", () => {
  it("renders the four destinations as links", () => {
    renderBar("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav).getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(["/", "/programs", "/history", "/settings"]);
  });

  it("marks the current section with aria-current", () => {
    renderBar("/programs");
    expect(screen.getByRole("link", { name: /programs/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /home/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  // Deep inside the workout builder you are still "in Programs" — losing the
  // highlight three levels down is how a tab bar stops telling you where you
  // are.
  it("keeps the section marked on a nested route", () => {
    renderBar("/programs/abc/workouts/def");
    expect(screen.getByRole("link", { name: /programs/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  // The player owns the bottom of the screen, and a stray tap here would walk
  // out of an in-progress session.
  it("renders nothing in the session player", () => {
    renderBar("/session");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders nothing on the public routes", () => {
    renderBar("/sign-in");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
