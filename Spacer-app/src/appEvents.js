// Window events fired after something is created from the header's Create menu,
// so whichever page is open can refresh. `detail` carries the new row.
export const DEPARTMENT_CREATED_EVENT = "department_created";
export const TASK_CREATED_EVENT = "task_created";
// A project was created (CreateProjectModal, from the sidebar or the Create
// menu), or one of your departments joined one by accepting an invite
// (DepartmentInvites), so the sidebar lists it at once. detail is
// { project, extraDepartmentIds }: the project_spaces row (at least id, name,
// team_space_id) and the ids of its other departments that are on it now.
export const PROJECT_CREATED_EVENT = "project_created";
export const announceProjectCreated = (project, extraDepartmentIds = []) =>
    window.dispatchEvent(new CustomEvent(PROJECT_CREATED_EVENT, { detail: { project, extraDepartmentIds } }));
// A meeting was scheduled or changed (ScheduleMeetingModal); detail is the event row
export const MEETING_SAVED_EVENT = "meeting_saved";
// Someone changed their own away period (availability/AvailabilityCard); detail is { userId }
export const AVAILABILITY_SAVED_EVENT = "availability_saved";
// Someone changed or removed their own photo (generalData.updateMyAvatar /
// removeMyAvatar); detail is { userId, path }, path null when removed
export const AVATAR_CHANGED_EVENT = "avatar_changed";
