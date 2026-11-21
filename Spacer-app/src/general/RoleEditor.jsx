import { useState } from "react"
import Select from "../components/Select"
import PlanetLoader from "../components/PlanetLoader"
import { ErrorNote, INPUT_CLASS } from "./GeneralParts"
import { assignRole, revokeRole } from "./generalData"
import { DEPARTMENT_ROLE_OPTIONS, departmentRoleKey } from "./roleAssignment"

// Lets an organization admin change someone's roles: an Organization Admin
// switch, and a role per department. Each change is saved at once; the
// database refuses anything not allowed (docs/RBAC.md) and its wording is
// shown. `onChanged` reloads the people so the drawer shows the new roles.
export default function RoleEditor({ person, departments, onChanged }) {
    const [busyKey, setBusyKey] = useState(null)
    const [error, setError] = useState("")
    const isOrgAdmin = person.orgRole === "org_admin"

    const change = async (key, action) => {
        setBusyKey(key)
        setError("")
        const result = await action()
        if (result.error) setError(result.error)
        else await onChanged()
        setBusyKey(null)
    }

    const setOrgAdmin = (checked) => change("organization", () =>
        checked ? assignRole(person.id, null, "org_admin") : revokeRole(person.id, null))

    const setDepartmentRole = (teamId, key) => change(teamId, () =>
        key ? assignRole(person.id, teamId, key) : revokeRole(person.id, teamId))

    return (
        <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm text-soft">
                <span className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="accent-[#aff82a]"
                        checked={isOrgAdmin}
                        disabled={busyKey !== null}
                        onChange={(e) => setOrgAdmin(e.target.checked)}
                    />
                    Organization Admin
                </span>
                {busyKey === "organization" && <PlanetLoader className="text-[16px] text-accent-ink" />}
            </label>
            {isOrgAdmin && <p className="text-[11px] text-muted">Covers every department. Department roles below make no difference while this is on.</p>}

            {departments.map((d) => (
                <label key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm text-soft">
                    <span className="truncate">{d.name}</span>
                    <span className="flex items-center gap-2">
                        {busyKey === d.id && <PlanetLoader className="text-[16px] text-accent-ink" />}
                        <Select
                            aria-label={`${person.name}'s role in ${d.name}`}
                            className={`${INPUT_CLASS} py-1 w-auto`}
                            value={departmentRoleKey(person, d.id)}
                            disabled={busyKey !== null}
                            onChange={(e) => setDepartmentRole(d.id, e.target.value)}
                        >
                            {DEPARTMENT_ROLE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                        </Select>
                    </span>
                </label>
            ))}
            {departments.length === 0 && <p className="text-xs text-muted">No departments yet.</p>}
            {error && <ErrorNote>{error}</ErrorNote>}
        </div>
    )
}
