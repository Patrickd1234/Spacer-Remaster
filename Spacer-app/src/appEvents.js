// Window events fired after something is created from the header's Create menu,
// so whichever page is open can refresh. `detail` carries the new row.
export const DEPARTMENT_CREATED_EVENT = "department_created";
export const TASK_CREATED_EVENT = "task_created";
// A meeting was scheduled or changed (ScheduleMeetingModal); detail is the event row
export const MEETING_SAVED_EVENT = "meeting_saved";
