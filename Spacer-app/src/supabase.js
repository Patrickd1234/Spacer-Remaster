import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("supabaseUrl or supabaseKey not found");
}

const realSupabase = createClient(supabaseUrl, supabaseKey);

// Define Mock Supabase Client for local testing & rate-limit bypass
const authCallbacks = [];
const triggerAuthChange = (event, session) => {
    authCallbacks.forEach(cb => {
        try {
            cb(event, session);
        } catch (e) {
            console.error("Error in auth callback:", e);
        }
    });
};

// Mock-only password check: stores a SHA-256 hash, never the plain password.
// Not real security — localStorage is readable by any script on the page.
const hashPassword = async (password) => {
    const bytes = new TextEncoder().encode(password || "");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
};

const INVALID_CREDENTIALS = { message: "Invalid login credentials", code: "invalid_credentials" };

const mockAuth = {
    async signUp({ email, password, options }) {
        const users = JSON.parse(localStorage.getItem("mock_users") || "[]");
        if (users.find(u => u.email === email)) {
            return { data: null, error: { message: "User already exists", code: "user_already_exists" } };
        }
        const newUser = {
            id: "mock-user-" + Math.random().toString(36).substring(2, 9),
            email,
            user_metadata: options?.data || {}
        };
        users.push({ ...newUser, passwordHash: await hashPassword(password) });
        localStorage.setItem("mock_users", JSON.stringify(users));

        // Create the user profile in the mock users table as well
        const profiles = JSON.parse(localStorage.getItem("mock_users_profiles") || "[]");
        profiles.push({
            id: newUser.id,
            email: email,
            name: options?.data?.full_name || email.split("@")[0]
        });
        localStorage.setItem("mock_users_profiles", JSON.stringify(profiles));

        const session = {
            user: newUser,
            access_token: "mock-token",
            refresh_token: "mock-refresh-token"
        };
        localStorage.setItem("mock_session", JSON.stringify(session));
        triggerAuthChange("SIGNED_IN", session);
        return { data: { user: newUser, session }, error: null };
    },

    async signInWithPassword({ email, password }) {
        const users = JSON.parse(localStorage.getItem("mock_users") || "[]");
        const record = users.find(u => u.email === email);
        // Same error for unknown email and wrong password, like the real API.
        // Mock users created before password hashing have no hash and cannot sign in.
        if (!record?.passwordHash || record.passwordHash !== await hashPassword(password)) {
            return { data: null, error: INVALID_CREDENTIALS };
        }
        const user = { ...record };
        delete user.passwordHash; // never expose the hash in the session
        const session = {
            user,
            access_token: "mock-token",
            refresh_token: "mock-refresh-token"
        };
        localStorage.setItem("mock_session", JSON.stringify(session));
        triggerAuthChange("SIGNED_IN", session);
        return { data: { user, session }, error: null };
    },

    async getSession() {
        const session = JSON.parse(localStorage.getItem("mock_session") || "null");
        return { data: { session }, error: null };
    },

    async getUser() {
        const session = JSON.parse(localStorage.getItem("mock_session") || "null");
        return { data: { user: session?.user || null }, error: null };
    },

    async signOut() {
        localStorage.removeItem("mock_session");
        triggerAuthChange("SIGNED_OUT", null);
        return { error: null };
    },

    onAuthStateChange(callback) {
        authCallbacks.push(callback);
        const session = JSON.parse(localStorage.getItem("mock_session") || "null");
        setTimeout(() => {
            callback("INITIAL_SESSION", session);
        }, 0);
        return {
            data: {
                subscription: {
                    unsubscribe() {
                        const index = authCallbacks.indexOf(callback);
                        if (index !== -1) {
                            authCallbacks.splice(index, 1);
                        }
                    }
                }
            }
        };
    }
};

const mockFrom = (tableName) => {
    // Map projects_spaces or project_spaces table to mock_project_spaces
    const cleanTable = (tableName === "projects_spaces" || tableName === "project_spaces")
        ? "mock_project_spaces"
        : `mock_${tableName}`;

    const getItems = () => JSON.parse(localStorage.getItem(cleanTable) || "[]");
    const setItems = (items) => localStorage.setItem(cleanTable, JSON.stringify(items));

    let filters = [];
    let pendingInsert = null;
    let pendingUpdate = null;
    let pendingDelete = false;
    let shouldSelect = false;
    let limitCount = null;

    const applyFilters = (items) => {
        return items.filter(item => {
            return filters.every(f => {
                // Handle JSON path notation like "new_state->>project_id"
                if (f.field.includes("->>")) {
                    const [jsonCol, jsonKey] = f.field.split("->>");
                    const jsonVal = item[jsonCol];
                    if (jsonVal && typeof jsonVal === "object") {
                        return jsonVal[jsonKey] === f.value;
                    }
                    return false;
                }
                return item[f.field] === f.value;
            });
        });
    };

    const resolveData = () => {
        if (pendingInsert) {
            const items = getItems();
            const toInsert = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
            const inserted = toInsert.map(item => ({
                id: item.id || "mock-id-" + Math.random().toString(36).substring(2, 9),
                created_at: new Date().toISOString(),
                ...item
            }));
            items.push(...inserted);
            setItems(items);
            if (shouldSelect) return { data: inserted.length === 1 ? inserted[0] : inserted, isInsert: true };
            return { data: inserted, isInsert: true };
        }
        if (pendingUpdate) {
            const items = getItems();
            const updated = [];
            const newItems = items.map(item => {
                const match = filters.every(f => {
                    if (f.field.includes("->>")) {
                        const [jsonCol, jsonKey] = f.field.split("->>");
                        return item[jsonCol]?.[jsonKey] === f.value;
                    }
                    return item[f.field] === f.value;
                });
                if (match) {
                    const updatedItem = { ...item, ...pendingUpdate };
                    updated.push(updatedItem);
                    return updatedItem;
                }
                return item;
            });
            setItems(newItems);
            return { data: updated, isUpdate: true };
        }
        if (pendingDelete) {
            const items = getItems();
            const remaining = items.filter(item => {
                return !filters.every(f => {
                    if (f.field.includes("->>")) {
                        const [jsonCol, jsonKey] = f.field.split("->>");
                        return item[jsonCol]?.[jsonKey] === f.value;
                    }
                    return item[f.field] === f.value;
                });
            });
            setItems(remaining);
            return { data: null, isDelete: true };
        }
        // Plain select
        let result = applyFilters(getItems());
        if (limitCount !== null) {
            result = result.slice(0, limitCount);
        }
        return { data: result };
    };

    const builder = {
        insert(data) {
            pendingInsert = data;
            return builder;
        },

        update(data) {
            pendingUpdate = data;
            return builder;
        },

        delete() {
            pendingDelete = true;
            return builder;
        },

        select(fields = "*") {
            shouldSelect = true;
            return builder;
        },

        eq(field, value) {
            filters.push({ field, value });
            return builder;
        },

        order(field, options) {
            return builder;
        },

        limit(count) {
            limitCount = count;
            return builder;
        },

        async single() {
            const result = resolveData();
            if (result.isInsert) {
                const d = Array.isArray(result.data) ? result.data[0] : result.data;
                return { data: d || null, error: null };
            }
            if (result.isUpdate) {
                return { data: result.data[0] || null, error: null };
            }
            if (result.isDelete) {
                return { data: null, error: null };
            }
            return { data: result.data[0] || null, error: null };
        },

        async maybeSingle() {
            return builder.single();
        },

        then(onfulfilled, onrejected) {
            const result = resolveData();
            return Promise.resolve({ data: result.data, error: null }).then(onfulfilled, onrejected);
        }
    };

    return builder;
};

const mockFunctions = {
    async invoke(functionName, options) {
        console.log(`[Mock] Edge Function call: ${functionName}`, options);
        return { data: { success: true }, error: null };
    }
};

const mockSupabase = {
    auth: mockAuth,
    from: mockFrom,
    functions: mockFunctions
};

// Export client directly so it only uses the live database
export const supabase = realSupabase;