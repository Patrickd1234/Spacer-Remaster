import LegalPage, { OPERATOR_NAME } from "./legal/LegalPage"

// Public privacy policy (/privacy). Google's OAuth consent screen links here.
// Keep it in line with what the app really stores and which services it uses.
const LAST_UPDATED = "24 November 2026"

const SECTIONS = [
    {
        title: "Who we are",
        body: [
            `Spacer is a workspace for teams, run by ${OPERATOR_NAME}. This policy explains what information Spacer collects, why, and what you can do about it.`,
        ],
    },
    {
        title: "What we collect",
        list: [
            "Account details: your name, email address and password (stored only in scrambled form by our sign-in provider).",
            "If you sign in with Google: your name, email address and profile picture from your Google account.",
            "Profile details you choose to add: job title, location, a short description, a profile picture and away dates with a note.",
            "Work you put into Spacer: organizations, departments, projects, tasks, comments, stand-ups, announcements, meetings and calendar events, messages and the files you upload.",
            "Security information: whether two-factor sign-in is on, and a record of key actions in your organization (for example, who changed a task).",
        ],
    },
    {
        title: "How we use it",
        list: [
            "To sign you in and keep your account secure.",
            "To show your work to the people in your organization who are allowed to see it.",
            "To send emails you need: invitations, sign-in and password emails, and notifications such as task assignments. You can turn notification emails off in Settings.",
        ],
        after: "We don't sell your information, show ads or use your information to train AI models.",
    },
    {
        title: "Google user data",
        body: [
            "When you sign in with Google, Spacer receives only your name, email address and profile picture. We use them only to create and sign in to your Spacer account and to show your name and picture to your organization. We don't share them with anyone else, and Spacer's use of information received from Google follows the Google API Services User Data Policy, including the Limited Use requirements.",
        ],
    },
    {
        title: "Services that handle your information",
        list: [
            "Supabase: stores the database, files and sign-in accounts.",
            "Vercel: hosts the website.",
            "Resend: sends Spacer's emails.",
            "Cloudflare Turnstile: the security check on sign-up, sign-in and password reset, to stop automated abuse.",
            "Google: Google sign-in, if you use it, and the fonts and icons the site loads.",
        ],
        after: "These services process information only to run Spacer for us.",
    },
    {
        title: "Your browser",
        body: [
            "Spacer saves a few things in your browser so it works smoothly: your sign-in session, display preferences, which messages you've read, and, if you choose \"remember this device\", a token that skips the two-factor code for 7 days. There are no advertising or tracking cookies.",
        ],
    },
    {
        title: "Who can see your information",
        body: [
            "People in your organization see what their role and department allow. Organization administrators manage the workspace, including its members and their access. We don't share your information outside Spacer unless the law requires it.",
        ],
    },
    {
        title: "How long we keep it",
        body: [
            "We keep your information while your account is active. If you ask us to delete your account, we delete your personal information, except what we have to keep by law. Work you created inside an organization may stay with that organization.",
        ],
    },
    {
        title: "Your choices and rights",
        body: [
            "You can view and change your profile at any time in Spacer. To get a copy of your information, correct it or delete your account, email us. Depending on where you live, you may also have the right to object to how we use your information or to complain to a data protection authority.",
        ],
    },
    {
        title: "Changes to this policy",
        body: [
            "If we change this policy, we'll update the date at the top of this page, and tell you in Spacer or by email if the change is significant.",
        ],
    },
]

export default function Privacy() {
    return <LegalPage title="Privacy Policy" lastUpdated={LAST_UPDATED} sections={SECTIONS} />
}
