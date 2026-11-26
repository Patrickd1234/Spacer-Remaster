// Marks overlays that belong to the Message Hub (e.g. an attachment preview),
// so clicking one doesn't count as a click outside the chat window, which
// SidebarRouter closes on. Its own file so the sidebar can read it without
// downloading the preview code.
export const KEEPS_CHAT_OPEN_ATTR = "data-keeps-chat-open";
