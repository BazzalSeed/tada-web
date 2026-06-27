import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Todo, TodoLabel } from "@/lib/contracts";
import { TadaProvider } from "@/app/lib/store";
import { AppShellContainer } from "../AppShellContainer";

const todo: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

function mk(id: string, title: string, labelIds: string[]): Todo {
  return { ...todo, id, title, labelIds };
}

const labels: TodoLabel[] = [
  { id: "l-work", name: "work", colorHex: "#c8632e" },
  { id: "l-home", name: "home", colorHex: "#5d574d" },
];

function renderApp() {
  return render(
    <TadaProvider preload={{ todos: [todo] }}>
      <AppShellContainer />
    </TadaProvider>,
  );
}

function renderFiltered() {
  return render(
    <TadaProvider
      preload={{
        labels,
        todos: [mk("a", "Alpha task", ["l-work"]), mk("b", "Beta task", ["l-home"])],
      }}
    >
      <AppShellContainer />
    </TadaProvider>,
  );
}

describe("AppShellContainer (store-wired)", () => {
  it("opens a todo via ⌘K and shows it in the detail pane", () => {
    renderApp();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "dakota" },
    });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(screen.getByLabelText(/todo detail/i)).toBeInTheDocument();
    // the editable title carries the todo's text
    expect(screen.getByLabelText(/^title$/i)).toHaveValue("Email Dakota");
  });

  it("routes a Today nav click and reflects it as the active item", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.getByRole("button", { name: /^today$/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("label-tap filters the list to that label", () => {
    renderFiltered();
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.getByText("Beta task")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "work" }));
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.queryByText("Beta task")).not.toBeInTheDocument();
  });

  it("saves the current filter as a View and navigates to it (criteria round-trip)", () => {
    renderFiltered();
    // filter to work, then save it as a view
    fireEvent.click(screen.getByRole("button", { name: "work" }));
    fireEvent.click(screen.getByRole("button", { name: /add view/i }));
    fireEvent.change(screen.getByPlaceholderText(/view name/i), {
      target: { value: "Work" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/view name/i), {
      key: "Enter",
    });
    // the new view is active and keeps the same filtered list
    const viewBtn = screen.getByRole("button", { name: /^Work$/ });
    expect(viewBtn).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Alpha task")).toBeInTheDocument();
    expect(screen.queryByText("Beta task")).not.toBeInTheDocument();
  });
});
