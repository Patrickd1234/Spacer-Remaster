import { Link } from "react-router-dom"
import RocketLogo from "../components/RocketLogo"

// Shared layout for the public legal pages (/privacy, /terms), which Google's
// OAuth consent screen links to. Readable signed in or not.
export const OPERATOR_NAME = "Nospace Ltd"
export const CONTACT_EMAIL = "pinoka@openspace.finance"

function LegalSection({ section }) {
    return (
        <section className="mb-10">
            <h2 className="text-[19px] font-semibold text-white mb-3">{section.title}</h2>
            {section.body?.map((text) => (
                <p key={text} className="text-muted text-[15px] leading-relaxed mb-3">{text}</p>
            ))}
            {section.list && (
                <ul className="list-disc pl-5 space-y-2 text-muted text-[15px] leading-relaxed mb-3">
                    {section.list.map((item) => <li key={item}>{item}</li>)}
                </ul>
            )}
            {section.after && <p className="text-muted text-[15px] leading-relaxed">{section.after}</p>}
        </section>
    )
}

export default function LegalPage({ title, lastUpdated, sections }) {
    return (
        <div className="min-h-screen bg-panel">
            <header className="border-b border-line/50">
                <div className="max-w-[720px] mx-auto px-6 py-5 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <RocketLogo size={26} />
                        <span className="text-[15px] font-bold tracking-widest text-white">Spacer</span>
                    </Link>
                    <nav className="flex items-center gap-5 text-[14px]">
                        <Link to="/privacy" className="text-muted hover:text-white transition-colors">Privacy</Link>
                        <Link to="/terms" className="text-muted hover:text-white transition-colors">Terms</Link>
                        <Link to="/login" className="text-muted hover:text-white transition-colors">Sign in</Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-[720px] mx-auto px-6 py-12">
                <h1 className="text-[34px] font-bold text-white tracking-tight mb-2">{title}</h1>
                <p className="text-muted text-[14px] mb-12">Last updated {lastUpdated}</p>

                {sections.map((section) => <LegalSection key={section.title} section={section} />)}

                <section className="border-t border-line/50 pt-8">
                    <h2 className="text-[19px] font-semibold text-white mb-3">Contact</h2>
                    <p className="text-muted text-[15px] leading-relaxed">
                        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent-ink hover:underline">{CONTACT_EMAIL}</a>
                    </p>
                </section>
            </main>
        </div>
    )
}
