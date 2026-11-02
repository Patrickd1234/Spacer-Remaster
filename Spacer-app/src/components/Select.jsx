import { Children, isValidElement, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { nextEnabledIndex, typeaheadIndex } from "./selectOptions"

const PANEL_MAX_HEIGHT = 256
const PANEL_GAP = 6
const VIEWPORT_MARGIN = 8
const TYPEAHEAD_RESET_MS = 600

// <option> children as { value, label, disabled, colorClass }
function readOptions(children) {
    return Children.toArray(children)
        .filter((child) => isValidElement(child) && child.type === "option")
        .map(({ props }) => {
            const label = Children.toArray(props.children).filter((part) => typeof part === "string" || typeof part === "number").join("")
            return {
                value: String(props.value ?? label),
                label,
                disabled: Boolean(props.disabled),
                // Keep an option's text colour (e.g. priority); its background is the panel's
                colorClass: (props.className || "").split(/\s+/).filter((c) => c.startsWith("text-")).join(" "),
            }
        })
}

// Where the panel goes: under the button, or above it when there's more room there
function panelPosition(button) {
    const rect = button.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN
    const above = rect.top - PANEL_GAP - VIEWPORT_MARGIN
    const opensUp = below < 200 && above > below
    return {
        left: rect.left,
        minWidth: rect.width,
        maxWidth: window.innerWidth - rect.left - VIEWPORT_MARGIN,
        maxHeight: Math.min(PANEL_MAX_HEIGHT, opensUp ? above : below),
        ...(opensUp ? { bottom: window.innerHeight - rect.top + PANEL_GAP } : { top: rect.bottom + PANEL_GAP }),
    }
}

// Drop-in for <select> with the app's dropdown styling: same <option> children,
// and onChange still gets an event-like { target: { value } }. The button takes
// the className a <select> had; the option list is drawn in a portal so modals
// and scrolling panels don't clip it.
export default function Select({ value, onChange, className = "", children, disabled = false, id, name, "aria-label": ariaLabel }) {
    const options = readOptions(children)
    const current = String(value ?? "")
    const selectedIndex = options.findIndex((o) => o.value === current)
    // Like a native select, show the first option when the value matches none
    const shown = options[selectedIndex] ?? options[0]

    const [isOpen, setIsOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [position, setPosition] = useState(null)
    const buttonRef = useRef(null)
    const panelRef = useRef(null)
    const typeahead = useRef({ text: "", timer: null })
    const listId = useId()
    const optionId = (index) => `${listId}-option-${index}`

    useEffect(() => {
        if (!isOpen) return undefined
        const handlePointer = (e) => {
            if (!buttonRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setIsOpen(false)
        }
        // Follow the button when the page or a modal scrolls (but not the list itself)
        const handleMove = (e) => {
            if (panelRef.current?.contains(e.target)) return
            if (buttonRef.current) setPosition(panelPosition(buttonRef.current))
        }
        document.addEventListener("mousedown", handlePointer)
        window.addEventListener("scroll", handleMove, true)
        window.addEventListener("resize", handleMove)
        return () => {
            document.removeEventListener("mousedown", handlePointer)
            window.removeEventListener("scroll", handleMove, true)
            window.removeEventListener("resize", handleMove)
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen && activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" })
    })

    const open = () => {
        if (disabled || options.length === 0) return
        setPosition(panelPosition(buttonRef.current))
        setActiveIndex(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : nextEnabledIndex(options, -1, 1))
        setIsOpen(true)
    }

    const choose = (index) => {
        const option = options[index]
        if (!option || option.disabled) return
        setIsOpen(false)
        if (option.value === current) return
        const target = { value: option.value, name, type: "select-one" }
        onChange?.({ target, currentTarget: target })
    }

    const handleTypeahead = (key) => {
        clearTimeout(typeahead.current.timer)
        const text = typeahead.current.text + key.toLowerCase()
        typeahead.current = { text, timer: setTimeout(() => { typeahead.current.text = "" }, TYPEAHEAD_RESET_MS) }
        const start = text.length === 1 ? activeIndex + 1 : Math.max(activeIndex, 0)
        const match = typeaheadIndex(options, text, start % Math.max(options.length, 1))
        if (match >= 0) setActiveIndex(match)
    }

    const handleKeyDown = (e) => {
        const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
        if (!isOpen) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
                e.preventDefault()
                open()
            } else if (isPrintable) {
                open()
                handleTypeahead(e.key)
            }
            return
        }
        if (e.key === "Escape") {
            // Close just the list, not a modal listening for Escape
            e.preventDefault()
            e.nativeEvent.stopPropagation()
            setIsOpen(false)
        } else if (e.key === "Tab") {
            setIsOpen(false)
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const next = nextEnabledIndex(options, activeIndex, e.key === "ArrowDown" ? 1 : -1)
            if (next >= 0) setActiveIndex(next)
        } else if (e.key === "Home" || e.key === "End") {
            e.preventDefault()
            const next = e.key === "Home" ? nextEnabledIndex(options, -1, 1) : nextEnabledIndex(options, options.length, -1)
            if (next >= 0) setActiveIndex(next)
        } else if (e.key === "Enter" || (e.key === " " && !typeahead.current.text)) {
            e.preventDefault()
            choose(activeIndex)
        } else if (isPrintable) {
            e.preventDefault()
            handleTypeahead(e.key)
        }
    }

    // Clicks in the list stay in the list: parent menus that close on an
    // outside click, and clickable rows or backdrops, never see them
    const keepInside = (e) => {
        e.stopPropagation()
        e.nativeEvent.stopPropagation()
    }

    return (
        <>
            <button
                ref={buttonRef}
                id={id}
                type="button"
                disabled={disabled}
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                onKeyDown={handleKeyDown}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listId : undefined}
                aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                className={`${className} flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
            >
                <span className="truncate">{shown?.label ?? ""}</span>
                <span className={`material-symbols-outlined text-[18px] text-muted shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
                    expand_more
                </span>
            </button>
            {isOpen && position && createPortal(
                <div
                    ref={panelRef}
                    id={listId}
                    role="listbox"
                    aria-label={ariaLabel}
                    onMouseDown={keepInside}
                    onClick={keepInside}
                    style={{ position: "fixed", ...position }}
                    className="font-body-md reports-fade z-[1000] overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-2xl shadow-black/40"
                >
                    {options.map((option, index) => {
                        const isSelected = index === selectedIndex
                        const isActive = index === activeIndex
                        return (
                            <div
                                key={`${option.value}-${index}`}
                                id={optionId(index)}
                                role="option"
                                aria-selected={isSelected}
                                aria-disabled={option.disabled || undefined}
                                // Keep focus on the button so the keyboard keeps working
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => choose(index)}
                                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] select-none transition-colors ${
                                    option.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                                } ${
                                    isSelected
                                        ? "bg-[rgba(var(--primary-color-rgb),0.12)] text-[var(--primary-color)] font-semibold"
                                        : `text-soft ${isActive ? "bg-white/5" : ""}`
                                } ${isSelected && isActive ? "ring-1 ring-[rgba(var(--primary-color-rgb),0.4)]" : ""}`}
                            >
                                <span className={`flex-1 truncate ${isSelected ? "" : option.colorClass}`}>{option.label}</span>
                                {isSelected && <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden="true">check</span>}
                            </div>
                        )
                    })}
                </div>,
                document.body
            )}
        </>
    )
}
