import { createPortal } from "react-dom";
import DocViewer from "./DocViewer";
import { KEEPS_CHAT_OPEN_ATTR } from "./chatOverlay";

// Full-screen preview of a chat attachment: { name, type, url } or null.
// Rendered on <body>: inside the chat window (which uses backdrop-filter) a
// fixed overlay would be squeezed into the window's own box.
export default function AttachmentPreview({ file, onClose }) {
    if (!file) return null;
    return createPortal(
        <div {...{ [KEEPS_CHAT_OPEN_ATTR]: "" }}>
            <DocViewer file={file} onClose={onClose} />
        </div>,
        document.body,
    );
}
