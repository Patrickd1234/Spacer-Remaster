import { supabase } from "./supabase";
import { callEdgeFunction } from "./edgeFunctions";

export const DESCRIPTION_WORD_LIMIT = 150;

export const createdToast = (failedEmails) => failedEmails.length === 0
    ? { type: "success", title: "Department created successfully", message: "The department has been created and is ready for collaboration." }
    : { type: "success", title: "Department created", message: `Couldn't add ${failedEmails.join(", ")}. Add them from the department page.` };

export const failedToast = { type: "error", title: "Couldn't create department", message: "Something went wrong. Please try again." };

export const countWords = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// PostgREST's "column not in schema cache": the description migration hasn't run yet
const MISSING_COLUMN = "PGRST204";

async function insertDepartment(organizationId, name, description) {
    const row = { name, organization_id: organizationId };
    if (description) {
        const result = await supabase.from("team_spaces").insert({ ...row, description }).select().single();
        if (result.error?.code !== MISSING_COLUMN) return result;
        console.warn("team_spaces.description missing; creating the department without it");
    }
    return supabase.from("team_spaces").insert(row).select().single();
}

// Creates a department, then adds its lead (as department admin) and members.
// People go through the invite-department-member edge function, which re-checks
// permissions server-side, notifies existing users and emails invites to new ones.
// Returns { department, error, failedEmails }.
export async function createDepartment({ organizationId, name, description, leadEmail, memberEmails }) {
    const { data: department, error } = await insertDepartment(organizationId, name.trim(), description.trim());
    if (error) {
        console.error("Create department error:", error);
        return { department: null, error: error.message, failedEmails: [] };
    }

    const people = [
        ...(leadEmail ? [{ email: leadEmail, role: "admin" }] : []),
        ...memberEmails.filter((email) => email !== leadEmail).map((email) => ({ email, role: "member" })),
    ];
    const results = await Promise.all(people.map(({ email, role }) =>
        callEdgeFunction("invite-department-member", { email, role, team_space_id: department.id })
    ));
    const failedEmails = people.filter((_, i) => results[i].error).map(({ email }) => email);

    return { department, error: null, failedEmails };
}
