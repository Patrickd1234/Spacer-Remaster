import { Component, Suspense, lazy } from "react";
import PlanetLoader from "./PlanetLoader";

// Group chat is downloaded the first time a chat is shown (a Messages tab, or a
// group in the Message Hub), not with every page. Takes GroupChat's own props.
const GroupChat = lazy(() => import("./GroupChat"));

function ChatLoading() {
    return (
        <div role="status" className="h-full flex flex-col items-center justify-center gap-3 py-20 text-muted text-sm">
            <PlanetLoader className="text-[44px] text-accent-ink" />
            Loading messages…
        </div>
    );
}

// If the chat can't download (offline, or a new version was deployed), say so
// in its place rather than crashing the whole page
class ChatLoadBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error("Group chat failed to load:", error);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div role="alert" className="h-full flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                <p className="text-white font-semibold text-sm">Messages couldn't load</p>
                <p className="text-muted text-xs">Reload the page to try again.</p>
                <button type="button" onClick={() => window.location.reload()} className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent font-bold text-xs rounded-lg cursor-pointer">
                    Reload
                </button>
            </div>
        );
    }
}

export default function LazyGroupChat(props) {
    return (
        <ChatLoadBoundary>
            <Suspense fallback={<ChatLoading />}>
                <GroupChat {...props} />
            </Suspense>
        </ChatLoadBoundary>
    );
}
