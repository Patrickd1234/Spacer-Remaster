import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, getSessionUser } from './supabase';

const RoleContext = createContext();

const isSuperAdminRole = (role) => role === "super_admin" || role === "superadmin";
const ROLE_RANK = { super_admin: 3, superadmin: 3, admin: 2 };
const roleRank = (role) => ROLE_RANK[role] ?? 1;

// The user's chosen department is remembered per user in this browser
const departmentKey = (userId) => `activeDepartment:${userId}`;
const readStoredDepartment = (userId) => {
    try {
        return localStorage.getItem(departmentKey(userId));
    } catch {
        return null;
    }
};
const storeDepartment = (userId, teamSpaceId) => {
    try {
        localStorage.setItem(departmentKey(userId), teamSpaceId);
    } catch (err) {
        console.warn("Unable to remember department choice", err);
    }
};

// One entry per department, sorted by name so the order is stable
const toDepartments = (memberships) => {
    const byTeam = new Map();
    memberships.forEach((m) => {
        if (!m.team_space_id) return;
        const id = String(m.team_space_id);
        const existing = byTeam.get(id);
        if (!existing || roleRank(m.role) > roleRank(existing.role)) {
            byTeam.set(id, { team_space_id: m.team_space_id, role: m.role, name: m.team_space?.name || "Department" });
        }
    });
    return [...byTeam.values()].sort((a, b) => a.name.localeCompare(b.name));
};

// Default: the first department (alphabetically) where the user has their highest role
const defaultDepartmentId = (departments) => {
    if (departments.length === 0) return null;
    const top = Math.max(...departments.map((d) => roleRank(d.role)));
    return String(departments.find((d) => roleRank(d.role) === top).team_space_id);
};

export function RoleProvider({ children }) {
    const [userRole, setUserRole] = useState(null);
    const [realUserRole, setRealUserRole] = useState(null);
    const [roleLoading, setRoleLoading] = useState(true);
    const [superAdminMembership, setSuperAdminMembership] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [activeDepartmentId, setActiveDepartmentId] = useState(null);
    const [roleUserId, setRoleUserId] = useState(null);
    const [simulatedRole, setSimulatedRole] = useState(null);

    useEffect(() => {
        const fetchRole = async () => {
            setRoleLoading(true);
            try {
                const authData = { user: await getSessionUser() };
                const userId = authData?.user?.id;
                
                if (!userId) {
                    setUserRole(null);
                    setRoleLoading(false);
                    return;
                }

                // Check for highest role among memberships
                const { data: memberships, error } = await supabase
                    .from("memberships")
                    .select("role, team_space_id, team_space:team_spaces(name)")
                    .eq("user_id", userId);

                setRoleUserId(userId);
                if (error) {
                    console.warn("Error fetching role:", error);
                    setUserRole("member");
                } else if (memberships && memberships.length > 0) {
                    const depts = toDepartments(memberships);
                    setDepartments(depts);
                    const stored = readStoredDepartment(userId);
                    const storedIsValid = depts.some((d) => String(d.team_space_id) === stored);
                    setActiveDepartmentId(storedIsValid ? stored : defaultDepartmentId(depts));
                    // An org-level admin (admin with no department) manages the whole
                    // organization, same as is_org_admin() in the database
                    const isOrgWide = m =>
                        isSuperAdminRole(m.role) || (m.role === "admin" && !m.team_space_id);
                    const superMembership = memberships.find(isOrgWide);
                    const hasAdmin = memberships.some(m => m.role === "admin");
                    setSuperAdminMembership(superMembership || null);

                    if (superMembership) {
                        setUserRole("superadmin");
                        setRealUserRole("superadmin");
                    } else if (hasAdmin) {
                        setUserRole("admin");
                        setRealUserRole("admin");
                    } else {
                        setUserRole(memberships[0].role || "member");
                        setRealUserRole(memberships[0].role || "member");
                    }
                } else {
                    setUserRole("member");
                    setRealUserRole("member");
                }
            } catch (err) {
                console.error("RoleContext fetch error:", err);
                setUserRole("member");
                setRealUserRole("member");
            } finally {
                setRoleLoading(false);
            }
        };

        fetchRole();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                fetchRole();
            } else if (event === 'SIGNED_OUT') {
                setUserRole(null);
                setSuperAdminMembership(null);
                setDepartments([]);
                setActiveDepartmentId(null);
                setRoleUserId(null);
                setRoleLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const activeRole = simulatedRole || userRole;
    const isSuperAdmin = activeRole === "superadmin" || activeRole === "super_admin";
    const isAdmin = activeRole === "admin";
    
    // Only real Superadmins or Admins can simulate other roles
    const canSimulate = realUserRole === "superadmin" || realUserRole === "super_admin" || realUserRole === "admin";

    // The membership the app works in. Super admins keep their super-admin
    // membership (they pick departments with their own picker); everyone else
    // gets the department chosen in the switcher.
    const activeDepartment = useMemo(
        () => departments.find((d) => String(d.team_space_id) === activeDepartmentId) || null,
        [departments, activeDepartmentId]
    );
    const membershipData = superAdminMembership || activeDepartment;

    const setActiveDepartment = useCallback((teamSpaceId) => {
        const id = String(teamSpaceId);
        setActiveDepartmentId(id);
        if (roleUserId) storeDepartment(roleUserId, id);
    }, [roleUserId]);

    return (
        <RoleContext.Provider value={{ userRole: activeRole, realUserRole, roleLoading, isSuperAdmin, isAdmin, membershipData, departments, activeDepartment, setActiveDepartment, simulatedRole, setSimulatedRole, canSimulate }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    return useContext(RoleContext);
}
