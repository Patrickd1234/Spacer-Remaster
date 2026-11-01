import { useState } from "react"
import Select from "../components/Select"
import { Modal, Field, ErrorNote, PrimaryButton, SecondaryButton, INPUT_CLASS } from "../general/GeneralParts"
import { validateSprint } from "./sprintMath"

// Plan a new sprint, or edit a planned/active one. onSave(fields) resolves to
// an error message or null.
export function SprintFormModal({ sprint, defaults, onSave, onClose }) {
    const [form, setForm] = useState(() => ({
        name: sprint?.name ?? defaults.name,
        goal: sprint?.goal ?? "",
        startsOn: sprint?.starts_on ?? defaults.startsOn,
        endsOn: sprint?.ends_on ?? defaults.endsOn,
    }))
    const [error, setError] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        const invalid = validateSprint(form)
        if (invalid) return setError(invalid)
        setIsSaving(true)
        const failure = await onSave(form)
        setIsSaving(false)
        if (failure) setError(failure)
    }

    return (
        <Modal title={sprint ? "Edit sprint" : "Plan a sprint"} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Name"><input className={INPUT_CLASS} value={form.name} onChange={set("name")} maxLength={80} autoFocus /></Field>
                <Field label="Goal" hint="What the team wants to have done by the end. Optional.">
                    <textarea className={`${INPUT_CLASS} min-h-[80px]`} value={form.goal} onChange={set("goal")} maxLength={500} placeholder="e.g. Customers can pay by card" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Starts"><input type="date" className={INPUT_CLASS} value={form.startsOn} onChange={set("startsOn")} /></Field>
                    <Field label="Ends"><input type="date" className={INPUT_CLASS} value={form.endsOn} onChange={set("endsOn")} min={form.startsOn || undefined} /></Field>
                </div>
                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="flex justify-end gap-2">
                    <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton type="submit" icon="save" disabled={isSaving}>{isSaving ? "Saving…" : sprint ? "Save" : "Plan sprint"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}

// Finish the active sprint: where unfinished work goes, and the retrospective.
// onComplete(fields) resolves to an error message or null.
export function CompleteSprintModal({ sprint, totals, plannedSprints, onComplete, onClose }) {
    const [form, setForm] = useState({ carryOverTo: "", wentWell: "", toImprove: "", actions: "" })
    const [error, setError] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
    const openTasks = totals.totalTasks - totals.doneTasks

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSaving(true)
        const failure = await onComplete(form)
        setIsSaving(false)
        if (failure) setError(failure)
    }

    return (
        <Modal title={`Complete ${sprint.name}`} onClose={onClose} wide>
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-[#c4c9b8]">
                    {totals.doneTasks} of {totals.totalTasks} task{totals.totalTasks === 1 ? "" : "s"} done
                    {totals.totalPoints > 0 && ` · ${totals.donePoints} of ${totals.totalPoints} points`}.
                    {" "}Finished tasks stay with this sprint as its history.
                </p>
                {openTasks > 0 && (
                    <Field label={`Move the ${openTasks} unfinished task${openTasks === 1 ? "" : "s"} to`}>
                        <Select className={INPUT_CLASS} value={form.carryOverTo} onChange={set("carryOverTo")}>
                            <option value="">The backlog</option>
                            {plannedSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                    </Field>
                )}
                <fieldset className="space-y-3 rounded-lg border border-[#2D3139] p-3">
                    <legend className="px-1 text-xs text-[#8c947b]">Retrospective (optional)</legend>
                    <Field label="What went well"><textarea className={`${INPUT_CLASS} min-h-[64px]`} value={form.wentWell} onChange={set("wentWell")} maxLength={2000} /></Field>
                    <Field label="What to improve"><textarea className={`${INPUT_CLASS} min-h-[64px]`} value={form.toImprove} onChange={set("toImprove")} maxLength={2000} /></Field>
                    <Field label="Actions for next sprint"><textarea className={`${INPUT_CLASS} min-h-[64px]`} value={form.actions} onChange={set("actions")} maxLength={2000} /></Field>
                </fieldset>
                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="flex justify-end gap-2">
                    <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton type="submit" icon="flag" disabled={isSaving}>{isSaving ? "Completing…" : "Complete sprint"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}
