import { test } from "node:test";
import assert from "node:assert/strict";
import { nextEnabledIndex, typeaheadIndex } from "./selectOptions.js";

const OPTIONS = [
    { value: "", label: "Not set" },
    { value: "a", label: "Africa/Lagos" },
    { value: "b", label: "Africa/Cairo", disabled: true },
    { value: "c", label: "America/New_York" },
];

test("nextEnabledIndex skips disabled options and wraps", () => {
    assert.equal(nextEnabledIndex(OPTIONS, 1, 1), 3);
    assert.equal(nextEnabledIndex(OPTIONS, 3, 1), 0);
    assert.equal(nextEnabledIndex(OPTIONS, 0, -1), 3);
    assert.equal(nextEnabledIndex(OPTIONS, 3, -1), 1);
    assert.equal(nextEnabledIndex([{ disabled: true }], 0, 1), -1);
});

test("typeaheadIndex finds the next enabled label starting with the typed text", () => {
    assert.equal(typeaheadIndex(OPTIONS, "af", 0), 1);
    assert.equal(typeaheadIndex(OPTIONS, "africa/c", 0), -1);
    assert.equal(typeaheadIndex(OPTIONS, "AM", 0), 3);
    assert.equal(typeaheadIndex(OPTIONS, "n", 1), 0);
    assert.equal(typeaheadIndex(OPTIONS, " ", 0), -1);
});
