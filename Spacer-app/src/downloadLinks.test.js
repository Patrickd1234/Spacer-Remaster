import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadUrl } from "./downloadLinks.js";

const SIGNED = "https://abc.supabase.co/storage/v1/object/sign/chat-attachments/c/m/photo.png?token=xyz";

test("downloadUrl asks Supabase to send a signed file as a download, keeping the token", () => {
    const url = new URL(downloadUrl(SIGNED, "Holiday photo.png"));
    assert.equal(url.searchParams.get("token"), "xyz");
    assert.equal(url.searchParams.get("download"), "Holiday photo.png");
});

test("downloadUrl leaves the saved name to Supabase when there is none", () => {
    assert.equal(new URL(downloadUrl(SIGNED, null)).searchParams.get("download"), "");
});

test("downloadUrl returns other https links unchanged", () => {
    assert.equal(downloadUrl("https://example.com/file.pdf", "file.pdf"), "https://example.com/file.pdf");
});

test("downloadUrl refuses unsafe or missing links", () => {
    assert.equal(downloadUrl("javascript:alert(1)", "x"), null);
    assert.equal(downloadUrl("data:text/html,hi", "x"), null);
    assert.equal(downloadUrl(null, "x"), null);
});
