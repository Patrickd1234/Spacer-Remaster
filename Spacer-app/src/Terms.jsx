import LegalPage, { OPERATOR_NAME } from "./legal/LegalPage"

// Public terms of service (/terms). Google's OAuth consent screen links here.
const LAST_UPDATED = "24 November 2026"

const SECTIONS = [
    {
        title: "About these terms",
        body: [
            `Spacer is a workspace for teams, provided by ${OPERATOR_NAME} ("we", "us"). By creating an account or using Spacer, you agree to these terms. If you use Spacer for an organization, you confirm you're allowed to accept these terms for it.`,
        ],
    },
    {
        title: "Your account",
        list: [
            "Give accurate details when you sign up, and keep your password and two-factor device safe.",
            "You're responsible for what happens under your account. Tell us straight away if you think someone else has used it.",
            "Organization administrators can invite and remove members and decide what each member can see and do.",
        ],
    },
    {
        title: "Your content",
        body: [
            "Everything you and your organization put into Spacer (tasks, comments, messages, files and so on) stays yours. You give us permission to store, copy and show it only as needed to run Spacer for you and the people you share it with. Our Privacy Policy explains how we handle personal information.",
        ],
    },
    {
        title: "Acceptable use",
        body: ["Don't use Spacer to:"],
        list: [
            "break the law or anyone else's rights, including copyright and privacy;",
            "upload malware or anything meant to harm Spacer or its users;",
            "try to get into accounts, organizations or data you haven't been given access to;",
            "overload, scrape or reverse-engineer the service, or get around its security checks;",
            "send spam or harass other people.",
        ],
        after: "We may suspend or remove accounts that break these rules.",
    },
    {
        title: "The service",
        body: [
            "We work to keep Spacer available and your data safe, but Spacer is provided \"as is\". We may change, add or remove features, and there may be interruptions for maintenance or reasons outside our control. Keep your own copies of anything you can't afford to lose.",
        ],
    },
    {
        title: "Ending your use",
        body: [
            "You can stop using Spacer at any time and ask us to delete your account. We may suspend or close an account that breaks these terms, or if we stop offering Spacer; where we reasonably can, we'll warn you first so you can save your content.",
        ],
    },
    {
        title: "Liability",
        body: [
            "As far as the law allows, we aren't liable for indirect or consequential losses, such as lost profits or lost data, arising from your use of Spacer. Nothing in these terms limits liability that can't be limited by law.",
        ],
    },
    {
        title: "Changes to these terms",
        body: [
            "If we change these terms, we'll update the date at the top of this page, and tell you in Spacer or by email if the change is significant. Using Spacer after a change means you accept the new terms.",
        ],
    },
]

export default function Terms() {
    return <LegalPage title="Terms of Service" lastUpdated={LAST_UPDATED} sections={SECTIONS} />
}
