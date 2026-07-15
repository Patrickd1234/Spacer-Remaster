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
        users.push(newUser);
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
        const user = users.find(u => u.email === email);
        if (!user) {
            return { data: null, error: { message: "Invalid login credentials", code: "invalid_credentials" } };
        }
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

    const builder = {
        async insert(data) {
            const items = getItems();
            const toInsert = Array.isArray(data) ? data : [data];
            const inserted = toInsert.map(item => ({
                id: item.id || "mock-id-" + Math.random().toString(36).substring(2, 9),
                created_at: new Date().toISOString(),
                ...item
            }));
            items.push(...inserted);
            setItems(items);
            return { data: inserted, error: null };
        },

        select(fields = "*") {
            return builder;
        },

        eq(field, value) {
            filters.push({ field, value });
            return builder;
        },

        order(field, options) {
            return builder;
        },

        async single() {
            const items = getItems();
            const filtered = items.filter(item => {
                return filters.every(f => item[f.field] === f.value);
            });
            return { data: filtered[0] || null, error: null };
        },

        async maybeSingle() {
            const items = getItems();
            const filtered = items.filter(item => {
                return filters.every(f => item[f.field] === f.value);
            });
            return { data: filtered[0] || null, error: null };
        },

        then(onfulfilled, onrejected) {
            const items = getItems();
            const filtered = items.filter(item => {
                return filters.every(f => item[f.field] === f.value);
            });
            return Promise.resolve({ data: filtered, error: null }).then(onfulfilled, onrejected);
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

// Export client with dynamic switching
export const supabase = new Proxy({}, {
    get(target, prop) {
        const useMock = localStorage.getItem("use_mock_supabase") === "true";
        if (useMock) {
            return mockSupabase[prop] || realSupabase[prop];
        }
        return realSupabase[prop];
    }
});