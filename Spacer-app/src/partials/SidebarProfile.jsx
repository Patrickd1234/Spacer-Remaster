import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../supabase"

// Signed-in user at the bottom of the sidebar, with profile/settings/log out menu
export default function SidebarProfile({ name, email, isExpanded }) {
    const navigate = useNavigate()
    const menuRef = useRef(null)
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        localStorage.removeItem("userId")
        localStorage.removeItem("userEmail")
        navigate("/login")
    }

    const avatar = (
        <div className="w-9 h-9 rounded-full bg-[#3d424d] text-white flex items-center justify-center font-bold text-[14px] border border-[#2D3139] shrink-0">
            {name.charAt(0).toUpperCase()}
        </div>
    )

    return (
        <div className="mt-auto px-4 border-t border-[#2D3139] pt-4 pb-2 relative" ref={menuRef}>
            <button type="button" onClick={() => setIsOpen((open) => !open)} title={isExpanded ? undefined : name} className="w-full cursor-pointer">
                {isExpanded ? (
                    <div className="flex items-center justify-between px-3 py-1 group rounded-lg hover:bg-[#2D3139] transition-colors">
                        <div className="flex items-center gap-3 min-w-0 text-left">
                            {avatar}
                            <div className="flex flex-col min-w-0">
                                <span className="text-white text-[14px] font-medium leading-tight truncate">{name}</span>
                                <span className="text-[#8c947b] text-[12px] truncate">{email}</span>
                            </div>
                        </div>
                        <span className={`material-symbols-outlined text-[#8c947b] group-hover:text-white transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                    </div>
                ) : (
                    <div className="flex justify-center px-3 py-1 rounded-lg hover:bg-[#2D3139] transition-colors">{avatar}</div>
                )}
            </button>

            {isOpen && (
                <div className={`absolute ${isExpanded ? "left-4 right-4" : "left-16 w-48"} bottom-full mb-2 bg-[#1C1F26] border border-[#2D3139] rounded-xl shadow-xl overflow-hidden z-50`}>
                    <Link to="/profile" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-colors">
                        <span className="material-symbols-outlined text-[20px]">person</span>
                        <span className="text-sm font-medium">Your Profile</span>
                    </Link>
                    <Link to="/settings" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-colors">
                        <span className="material-symbols-outlined text-[20px]">settings</span>
                        <span className="text-sm font-medium">Settings</span>
                    </Link>
                    <div className="h-[1px] bg-[#2D3139] mx-2" />
                    <button type="button" onClick={() => { setIsOpen(false); handleLogout() }} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-[20px]">logout</span>
                        <span className="text-sm font-medium">Log out</span>
                    </button>
                </div>
            )}
        </div>
    )
}
