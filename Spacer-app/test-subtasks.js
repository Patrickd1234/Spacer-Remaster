// Spacer-app/test-subtasks.js
// Test script for M7: sub_tasks JSON error handling

function processTaskSubtasks(t) {
    let subtasksList = [];
    if (t.sub_tasks) {
        if (Array.isArray(t.sub_tasks)) {
            subtasksList = t.sub_tasks;
        } else if (typeof t.sub_tasks === "string") {
            const trimmed = t.sub_tasks.trim();
            if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        subtasksList = parsed;
                    } else {
                        console.warn("Malformed sub_tasks (expected array) for task", t.id, parsed);
                        subtasksList = [];
                    }
                } catch (e) {
                    console.warn("Malformed sub_tasks for task", t.id, e);
                    subtasksList = [];
                }
            }
        }
    }
    const allDone = subtasksList.length > 0 && subtasksList.every(st => Boolean(st?.done));
    const anyDone = subtasksList.some(st => Boolean(st?.done));

    let expectedStatus = t.status;
    if (allDone) {
        expectedStatus = 'done';
    } else if (subtasksList.length === 0 || !anyDone) {
        expectedStatus = 'todo';
    } else {
        expectedStatus = 'in_progress';
    }
    return { ...t, status: expectedStatus, parsedCount: subtasksList.length };
}

console.log("\n=======================================================");
console.log(" M7 Subtasks JSON Error Handling Test Suite");
console.log("=======================================================\n");

const scenarios = [
    {
        name: "Valid subtasks (JSON string)",
        task: {
            id: "task-01",
            title: "Task with valid subtasks",
            status: "todo",
            sub_tasks: JSON.stringify([
                { text: "Design page", done: true },
                { text: "Test page", done: false }
            ])
        }
    },
    {
        name: "No subtasks (null / missing)",
        task: {
            id: "task-02",
            title: "Task without subtasks",
            status: "todo",
            sub_tasks: null
        }
    },
    {
        name: "Malformed JSON (syntax error: unclosed bracket)",
        task: {
            id: "task-03",
            title: "Task with broken JSON",
            status: "todo",
            sub_tasks: '["Design the page", "Test the page'
        }
    },
    {
        name: "Malformed structure (valid JSON object instead of array)",
        task: {
            id: "task-04",
            title: "Task with object subtasks",
            status: "todo",
            sub_tasks: '{"key": "not an array"}'
        }
    }
];

scenarios.forEach((sc, index) => {
    console.log(`[Test ${index + 1}] ${sc.name}`);
    const result = processTaskSubtasks(sc.task);
    console.log(" -> Result status:", result.status, "| Subtasks parsed:", result.parsedCount);
    console.log("-------------------------------------------------------");
});

console.log("\nAll scenarios processed safely. No unhandled exceptions thrown.\n");
