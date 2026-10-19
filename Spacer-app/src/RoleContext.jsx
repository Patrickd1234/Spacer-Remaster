import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const RoleContext = createContext();

export function RoleProvider({ children }) {
    const [userRole, setUserRole] = useState(null);
    const [realUserRole, setRealUserRole] = useState(null);
    const [roleLoading, setRoleLoading] = useState(true);
    const [membershipData, setMembershipData] = useState(null);
    const [simulatedRole, setSimulatedRole] = useState(null);

    useEffect(() => {
        const fetchRole = async () => {
            setRoleLoading(true);
            try {
                const { data: authData } = await supabase.auth.getUser();
                const userId = authData?.user?.id;
                
                if (!userId) {
                    setUserRole(null);
                    setRoleLoading(false);
                    return;
                }

                // Check for highest role among memberships
                const { data: memberships, error } = await supabase
                    .from("memberships")
                    .select("role, team_space_id")
                    .eq("user_id", userId);

                if (error) {
                    console.warn("Error fetching role:", error);
                    setUserRole("member");
                } else if (memberships && memberships.length > 0) {
                    // An org-level admin (admin with no department) manages the whole
                    // organization, same as is_org_admin() in the database
                    const isOrgWide = m =>
                        m.role === "super_admin" || m.role === "superadmin" ||
                        (m.role === "admin" && !m.team_space_id);
                    const hasSuperAdmin = memberships.some(isOrgWide);
                    const hasAdmin = memberships.some(m => m.role === "admin");

                    if (hasSuperAdmin) {
                        setUserRole("superadmin");
                        setRealUserRole("superadmin");
                        setMembershipData(memberships.find(isOrgWide));
                    } else if (hasAdmin) {
                        setUserRole("admin");
                        setRealUserRole("admin");
                        setMembershipData(memberships.find(m => m.role === "admin"));
                    } else {
                        setUserRole(memberships[0].role || "member");
                        setRealUserRole(memberships[0].role || "member");
                        setMembershipData(memberships[0]);
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
                setMembershipData(null);
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

    return (
        <RoleContext.Provider value={{ userRole: activeRole, realUserRole, roleLoading, isSuperAdmin, isAdmin, membershipData, simulatedRole, setSimulatedRole, canSimulate }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    return useContext(RoleContext);
}
