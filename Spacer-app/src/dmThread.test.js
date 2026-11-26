// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapDmRow, mergeDmMessages, dmReadStamp, latestDmPerContact } from "./dmThread.js";

const row = (over = {}) => ({
    id: "m1", sender_id: "a", receiver_id: "b", content: "hi", created_at: "2026-11-26T10:00:00Z",
    reply_to_id: null, file_attachment: null, pinned: false, direct_message_reactions: [], ...over,
});

test("mapDmRow gives database rows and live inserts the chat's shape", () => {
    const msg = mapDmRow(row({ reply_to_id: "m0", direct_message_reactions: [{ emoji: "👍", user_id: "a" }] }));
    assert.deepEqual(msg, {
        id: "m1", sender_id: "a", receiver_id: "b", content: "hi", created_at: "2026-11-26T10:00:00Z",
        replyToId: "m0", fileAttachment: null, pinned: false, reactions: [{ emoji: "👍", users: ["a"] }],
    });
    // A live insert has no reactions yet
    assert.deepEqual(mapDmRow(row({ direct_message_reactions: undefined })).reactions, []);
});

test("mapDmRow cleans the attachment's display name, old messages included", () => {
    const msg = mapDmRow(row({ file_attachment: { name: "a‮fdp.exe", path: "a/m1/a_fdp.exe", type: "application/pdf" } }));
    assert.equal(msg.fileAttachment.name, "afdp.exe");
    assert.equal(msg.fileAttachment.path, "a/m1/a_fdp.exe");
});

test("mergeDmMessages keeps one copy of each message, oldest first", () => {
    const fetched = [mapDmRow(row({ id: "m1" })), mapDmRow(row({ id: "m2", created_at: "2026-11-26T10:01:00Z" }))];
    const current = [fetched[1], fetched[0]];
    assert.deepEqual(mergeDmMessages(fetched, current, new Set()).map((m) => m.id), ["m1", "m2"]);
});

test("mergeDmMessages keeps a message still being sent until the database has it", () => {
    const sending = { ...mapDmRow(row({ id: "new", created_at: "2026-11-26T10:05:00Z" })), url: "x" };
    const fetched = [mapDmRow(row({ id: "m1" }))];
    const merged = mergeDmMessages(fetched, [fetched[0], sending], new Set(["new"]));
    assert.deepEqual(merged.map((m) => m.id), ["m1", "new"]);
    // Once saved, the database copy replaces the local one
    const saved = mapDmRow(row({ id: "new", created_at: "2026-11-26T10:05:01Z" }));
    const after = mergeDmMessages([fetched[0], saved], merged, new Set(["new"]));
    assert.equal(after.length, 2);
    assert.equal(after[1].created_at, "2026-11-26T10:05:01Z");
});

test("mergeDmMessages drops messages deleted elsewhere", () => {
    const current = [mapDmRow(row({ id: "m1" })), mapDmRow(row({ id: "gone" }))];
    assert.deepEqual(mergeDmMessages([current[0]], current, new Set()).map((m) => m.id), ["m1"]);
});

test("dmReadStamp is never earlier than the newest message seen", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    // This computer's clock is behind the server's
    assert.equal(dmReadStamp(now, "2026-11-26T10:00:30Z"), Date.parse("2026-11-26T10:00:30Z"));
    assert.equal(dmReadStamp(now, "2026-11-26T09:00:00Z"), now);
    assert.equal(dmReadStamp(now, null), now);
});

test("latestDmPerContact keeps each contact's newest message, mapped", () => {
    const rows = [
        row({ id: "3", sender_id: "c", receiver_id: "me", created_at: "2026-11-26T12:00:00Z" }),
        row({ id: "2", sender_id: "me", receiver_id: "b", created_at: "2026-11-26T11:00:00Z", file_attachment: { name: "x.pdf" } }),
        row({ id: "1", sender_id: "b", receiver_id: "me", created_at: "2026-11-26T10:00:00Z" }),
    ];
    const latest = latestDmPerContact(rows, "me");
    assert.deepEqual(Object.keys(latest).sort(), ["b", "c"]);
    assert.equal(latest.b.id, "2");
    assert.equal(latest.b.fileAttachment.name, "x.pdf");
});
