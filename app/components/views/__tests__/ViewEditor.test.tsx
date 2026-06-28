import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FilterCriteria, TodoLabel } from "@/lib/contracts";
import { ViewEditor } from "../ViewEditor";

const labels: TodoLabel[] = [
  { id: "l-work", name: "work", colorHex: "#c8632e" },
];

const seed: FilterCriteria = {
  labelIds: [],
  minPriority: null,
  dateWindow: "any",
  includeCompleted: false,
};

describe("ViewEditor", () => {
  it("create mode: saves the typed name with composed criteria", () => {
    const onSave = vi.fn();
    render(
      <ViewEditor
        mode="create"
        initialCriteria={seed}
        labels={labels}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/view name/i), {
      target: { value: "Deep work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "P1+" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(
      "Deep work",
      expect.objectContaining({ minPriority: "p1" }),
    );
  });

  it("will not save an empty name", () => {
    const onSave = vi.fn();
    render(
      <ViewEditor
        mode="create"
        initialCriteria={seed}
        labels={labels}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("edit mode: prefills name + criteria and exposes delete", () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <ViewEditor
        mode="edit"
        initialName="Urgent"
        initialCriteria={{ ...seed, minPriority: "p1", dateWindow: "today" }}
        labels={labels}
        onSave={onSave}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByLabelText(/view name/i)).toHaveValue("Urgent");
    expect(screen.getByRole("button", { name: "P1+" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("create mode shows no delete affordance", () => {
    render(
      <ViewEditor
        mode="create"
        initialCriteria={seed}
        labels={labels}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("cancel backs out without saving", () => {
    const onCancel = vi.fn();
    render(
      <ViewEditor
        mode="create"
        initialCriteria={seed}
        labels={labels}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
