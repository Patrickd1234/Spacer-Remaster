// Turns the per-invite results from the launch-organization edge function into
// a message for the founder, or null when every invite went out.
// invites: [{ email, status }] where status is one of
//   invite_sent | notified_existing | other_organization | email_failed

const PROBLEM_MESSAGES = {
    email_failed: "Couldn't email",
    other_organization: "Already in another organization, not invited",
}

export function summarizeInviteProblems(invites) {
    const lines = Object.entries(PROBLEM_MESSAGES)
        .map(([status, label]) => {
            const emails = (invites ?? []).filter((i) => i.status === status).map((i) => i.email)
            return emails.length ? `${label}: ${emails.join(", ")}` : null
        })
        .filter(Boolean)
    return lines.length ? lines.join(". ") + "." : null
}
