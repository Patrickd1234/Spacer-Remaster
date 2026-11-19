// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionQueryAt, insertMention, matchMentionables, timeAgo, COMMENT_MAX } from "./commentFormat.js";

test("mentionQueryAt finds the word being typed after @", () => {
    assert.deepEqual(mentionQueryAt("Thanks @To", 10), { start: 7, query: "To" });
    assert.deepEqual(mentionQueryAt("@", 1), { start: 0, query: "" });
    assert.deepEqual(mentionQueryAt("cc @Tolu Ade", 12), { start: 3, query: "Tolu Ade" });
});

test("mentionQueryAt ignores emails, finished lines and long runs", () => {
    assert.equal(mentionQueryAt("mail me at a@b.com", 18), null);
    assert.equal(mentionQueryAt("@Tolu\nnext", 10), null);
    assert.equal(mentionQueryAt("no mention here", 15), null);
    assert.equal(mentionQueryAt(`@${"x".repeat(40)}`, 41), null);
});

test("insertMention replaces the typed query with the full name, reusing a following space", () => {
    const middle = insertMention("Thanks @To for this", { start: 7, query: "To" }, "Tolu Adebayo");
    assert.equal(middle.text, "Thanks @Tolu Adebayo for this");
    assert.equal(middle.caret, "Thanks @Tolu Adebayo ".length);
    const end = insertMention("cc @to", { start: 3, query: "to" }, "Tolu Adebayo");
    assert.equal(end.text, "cc @Tolu Adebayo ");
    assert.equal(end.caret, end.text.length);
});

test("matchMentionables matches names, skips me and caps the list", () => {
    const people = [
        { id: "me", name: "Destiny Okafor" },
        { id: "a", name: "Tolu Adebayo" },
        { id: "b", name: "Esther Williams" },
        { id: "c", name: null },
    ];
    assert.deepEqual(matchMentionables(people, "to", "me").map((p) => p.id), ["a"]);
    assert.deepEqual(matchMentionables(people, "", "me").map((p) => p.id), ["a", "b"]);
    assert.deepEqual(matchMentionables(people, "will", "me").map((p) => p.id), ["b"]);
});

test("timeAgo reads naturally", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    assert.equal(timeAgo("2026-11-19T11:59:40Z", now), "just now");
    assert.equal(timeAgo("2026-11-19T11:55:00Z", now), "5m ago");
    assert.equal(timeAgo("2026-11-19T09:00:00Z", now), "3h ago");
    assert.equal(timeAgo("2026-11-17T12:00:00Z", now), "2d ago");
    assert.match(timeAgo("2026-10-01T12:00:00Z", now), /Oct/);
});

test("the comment limit matches the database", () => {
    assert.equal(COMMENT_MAX, 5000);
});
