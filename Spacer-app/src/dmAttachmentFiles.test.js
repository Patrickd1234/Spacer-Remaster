// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    validateDmAttachment, formatFileSize, dmAttachmentPath, attachmentDisplay, DM_ATTACHMENT_MAX_BYTES,
} from "./dmAttachmentFiles.js";

test("validateDmAttachment accepts allowed types up to 5 MB", () => {
    assert.equal(validateDmAttachment({ name: "a.png", type: "image/png", size: DM_ATTACHMENT_MAX_BYTES }), null);
    assert.equal(validateDmAttachment({ name: "a.pdf", type: "application/pdf", size: 10 }), null);
});

test("validateDmAttachment rejects other types and oversized files", () => {
    assert.match(validateDmAttachment({ name: "a.mp4", type: "video/mp4", size: 10 }), /can't be sent/);
    assert.match(validateDmAttachment({ name: "a.html", type: "text/html", size: 10 }), /can't be sent/);
    assert.match(validateDmAttachment({ name: "a.png", type: "image/png", size: DM_ATTACHMENT_MAX_BYTES + 1 }), /too large/);
});

test("formatFileSize uses KB below 0.1 MB", () => {
    assert.equal(formatFileSize(2048), "2.0 KB");
    assert.equal(formatFileSize(3 * 1024 * 1024), "3.00 MB");
});

test("dmAttachmentPath puts the file in the sender's folder with a storage-safe name", () => {
    assert.equal(dmAttachmentPath("s", "m", "My Report (v2).pdf"), "s/m/My_Report_v2_.pdf");
    assert.equal(dmAttachmentPath("s", "m", "../../etc/passwd"), "s/m/.._.._etc_passwd");
});

test("attachmentDisplay shows signed links for stored files", () => {
    assert.deepEqual(
        attachmentDisplay({ path: "s/m/a.png", type: "image/png", url: "https://x/signed" }),
        { imageSrc: "https://x/signed", downloadHref: "https://x/signed" },
    );
    assert.deepEqual(
        attachmentDisplay({ path: "s/m/a.pdf", type: "application/pdf", url: "https://x/signed" }),
        { imageSrc: null, downloadHref: "https://x/signed" },
    );
    // Link not signed yet (or access denied): nothing to open
    assert.deepEqual(attachmentDisplay({ path: "s/m/a.png", type: "image/png" }), { imageSrc: null, downloadHref: null });
});

test("attachmentDisplay still renders old base64 attachments, but never active content", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    assert.equal(attachmentDisplay({ dataUrl: png }).imageSrc, png);
    assert.equal(attachmentDisplay({ dataUrl: "data:text/html;base64,PHNjcmlwdD4=" }).downloadHref, null);
    assert.deepEqual(attachmentDisplay(null), { imageSrc: null, downloadHref: null });
});
