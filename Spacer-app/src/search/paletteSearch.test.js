import { test } from "node:test"
import assert from "node:assert/strict"
import { toPrefixQuery, escapeLike, parseTaskKey, scopesWithPrefix, matchCommands, taskPath, flattenSections } from "./paletteSearch.js"
import { isTypingTarget, matchesShortcut } from "../shortcuts.js"

test("typed words become prefix matches, with tsquery syntax dropped", () => {
    assert.equal(toPrefixQuery("laun  Mark"), "laun:* & mark:*")
    assert.equal(toPrefixQuery("a & b | !c:*"), "a:* & b:* & c:*")
    assert.equal(toPrefixQuery("café"), "cafe:*")
    assert.equal(toPrefixQuery("  ''  "), null)
    assert.equal(toPrefixQuery("1 2 3 4 5 6 7 8").split("&").length, 6)
})

test("ILIKE patterns take % and _ literally", () => {
    assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\")
})

test("task keys", () => {
    assert.deepEqual(parseTaskKey(" dev-12 "), { prefix: "DEV", number: 12 })
    assert.equal(parseTaskKey("dev 12"), null)
    assert.equal(parseTaskKey("12-dev"), null)
    const prefixes = new Map([["p1", "DEV"], ["p2", "MKT"], ["org", "dev"]])
    assert.deepEqual(scopesWithPrefix(prefixes, "DEV"), ["p1", "org"])
})

test("pages and actions match every word", () => {
    const items = [{ id: "reports", label: "Reports", keywords: "analytics scorecard" }, { id: "dir", label: "Directory", keywords: "people" }]
    assert.deepEqual(matchCommands(items, "").map((i) => i.id), ["reports", "dir"])
    assert.deepEqual(matchCommands(items, "score"), [items[0]])
    assert.deepEqual(matchCommands(items, "rep people"), [])
})

test("where results go, in one list", () => {
    assert.equal(taskPath({ id: "t", project_id: "p" }), "/project_page/p?task_id=t")
    assert.equal(taskPath({ id: "t", project_id: null }), "/tasks")
    assert.deepEqual(flattenSections([{ key: "a", items: [{ id: 1 }] }, { key: "b", items: [{ id: 2 }, { id: 3 }] }]).map((i) => `${i.section}${i.id}`), ["a1", "b2", "b3"])
})

test("shortcuts ignore typing and the browser's own combinations", () => {
    const input = { tagName: "input" }
    const body = { tagName: "BODY" }
    assert.equal(isTypingTarget(input), true)
    assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true)
    assert.equal(matchesShortcut({ key: "c", target: body }, "c"), true)
    assert.equal(matchesShortcut({ key: "c", target: input }, "c"), false)
    assert.equal(matchesShortcut({ key: "c", ctrlKey: true, target: body }, "c"), false)
    assert.equal(matchesShortcut({ key: "K", ctrlKey: true, target: input }, "mod+k"), true)   // works while typing
    assert.equal(matchesShortcut({ key: "k", metaKey: true, target: body }, "mod+k"), true)
    assert.equal(matchesShortcut({ key: "?", target: body }, "?"), true)
})
