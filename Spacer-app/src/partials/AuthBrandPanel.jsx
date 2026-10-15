// Left-side brand panel shared by the Login and Signup pages (hidden on mobile).
// `tagline` renders under the logo, `children` below the branding block, `quote` pinned to the bottom.
export default function AuthBrandPanel({ tagline, quote, showThirdGlow = false, children }) {
    return (
        <div className="hidden lg:flex w-[55%] relative flex-col px-16 py-12 border-r border-[color:color-mix(in_srgb,var(--bg-border)_30%,transparent)]">
            {/* Abstract Glowing Backgrounds */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#2A3A4A] rounded-full blur-[120px] opacity-40 mix-blend-screen pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-[#3B2A4A] rounded-full blur-[120px] opacity-40 mix-blend-screen pointer-events-none" />
            {showThirdGlow && (
                <div className="absolute bottom-[20%] left-[-5%] w-[300px] h-[300px] bg-[#1A4A3A] rounded-full blur-[100px] opacity-40 mix-blend-screen pointer-events-none" />
            )}

            {/* Branding */}
            <div className="relative z-10 mb-12">
                <div className="flex items-center gap-2 mb-8">
                    <span className="material-symbols-outlined text-[var(--primary-color)] font-bold text-[24px]">token</span>
                    <h1 className="text-[16px] font-bold tracking-widest text-white uppercase">Spacer</h1>
                </div>
                {tagline}
            </div>

            {children}

            <div className={`relative z-10 mt-auto ${children ? "pt-8 " : ""}border-l-2 border-[var(--primary-color)] pl-4`}>
                <p className="text-sm text-[#8c947b] italic">
                    &quot;{quote}&quot;
                </p>
            </div>
        </div>
    )
}
