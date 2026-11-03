// The organization name, remembered in this browser. Pages mount their own
// sidebar and home heading, so the name would otherwise load (and change) on
// every page; showing the last name loaded avoids a placeholder flashing first.
const ORG_NAME_KEY = "spacers.orgName"

export function readSavedOrgName() {
    try {
        return localStorage.getItem(ORG_NAME_KEY) || ""
    } catch {
        return ""
    }
}

export function saveOrgName(name) {
    try {
        if (name) localStorage.setItem(ORG_NAME_KEY, name)
        else localStorage.removeItem(ORG_NAME_KEY)
    } catch {
        // Storage blocked (private mode): the name still shows once loaded
    }
}
