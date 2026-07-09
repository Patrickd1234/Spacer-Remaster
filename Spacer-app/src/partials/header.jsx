function Header() {
    return (
        <>
            {/* HEADER */}
            <header className="h-16 flex items-center justify-between px-lg w-full border-b border-outline-variant bg-surface-container-low sticky top-0 z-40">
                <div className="flex items-center flex-1 max-w-xl">
                    <div className="relative w-full">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                        <input className="w-full bg-surface-container-highest border-none rounded-lg pl-10 pr-md py-2 text-on-surface font-body-sm focus:ring-1 focus:ring-primary-fixed" placeholder="Search tasks, projects, or documents..." type="text" />
                    </div>
                </div>
                <div className="flex items-center gap-md ml-lg">
                    <button className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors relative">
                        <span className="material-symbols-outlined">videocam</span>
                    </button>
                    <button className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors relative">
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface-container-low"></span>
                    </button>
                    <div className="flex items-center gap-md border-l border-outline-variant pl-md ml-md">
                        <div className="flex flex-col items-end hidden md:flex">
                            <span className="font-label-md text-on-surface">Alex Mercer</span>
                            <span className="font-label-sm text-on-surface-variant">Admin</span>
                        </div>
                        <div className="w-10 h-10 rounded-full border-2 border-outline-variant overflow-hidden">
                            <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA1SqTVMAnvILSb6IxvVLU9j9X5n3ZJPQ3nkLKedJgxtgMdimWelcBqMSrXR31bVQhhe36WXsB-EkuowIPdFaG5vjr8_E5ioeLVO7qGj7hEBWs1vMorti-fThKy5Z259U_nyiFrEtM1tc8oCqM2nAeiBhUW21a2Zn4OaaX1dLyHa-l6bYRfil0SOoJm9PDv3ir8SMLG1UYWqCfN9HlW5DLipSeM6gWWdgGbCo-qDNYkMJNfY5Uu9rDPwg" />
                        </div>
                    </div>
                </div>
            </header>
        </>
    )
}

export default Header