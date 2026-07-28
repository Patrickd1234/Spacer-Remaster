import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Sidebar from "./sidebar";
import AdminSidebar from "./admin_sidebar";
import SuperAdminSidebar from "./super_admin_sidebar";

export default function SidebarRouter(props) {
    const [userRole, setUserRole] = useState(null);
    const [roleLoaded, setRoleLoaded] = useState(false);

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser();
                const userId = authData?.user?.id;
                if (!userId) {
                    setRoleLoaded(true);
                    return;
                }

                const { data: membership } = await supabase
                    .from("memberships")
                    .select("role")
                    .eq("user_id", userId)
                    .maybeSingle();

                setUserRole(membership?.role ?? null);
            } catch (err) {
                console.error("SidebarRouter: role fetch error", err);
            } finally {
                setRoleLoaded(true);
            }
        };
        fetchRole();
    }, []);

    if (!roleLoaded) return null;

    if (userRole === "super_admin" || userRole === "superadmin") {
        return <SuperAdminSidebar {...props} />;
    }

    if (userRole === "admin") {
        return <AdminSidebar {...props} />;
    }

    // member, team_lead, or any other role
    return <Sidebar {...props} />;
}
