// Keyboard helpers for the Select dropdown. options: [{ value, disabled }]

// Next option that can be chosen, stepping by +1 / -1 and wrapping; -1 if none
export function nextEnabledIndex(options, from, step) {
    const count = options.length
    for (let i = 1; i <= count; i++) {
        const index = (((from + step * i) % count) + count) % count
        if (!options[index].disabled) return index
    }
    return -1
}

// First enabled option at or after `from` whose label starts with `query`
// (case-insensitive), wrapping round; -1 if none
export function typeaheadIndex(options, query, from) {
    const needle = query.trim().toLowerCase()
    if (!needle) return -1
    const count = options.length
    for (let i = 0; i < count; i++) {
        const index = (from + i) % count
        const option = options[index]
        if (!option.disabled && option.label.toLowerCase().startsWith(needle)) return index
    }
    return -1
}
