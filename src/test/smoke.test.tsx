import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

// Proves the whole unit-test path is wired: JSX compiles, jsdom renders,
// Testing Library queries, jest-dom matchers, and user events all work.
describe("test environment", () => {
  it("renders a component and handles a click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start workout</Button>);

    const button = screen.getByRole("button", { name: "Start workout" });
    expect(button).toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
