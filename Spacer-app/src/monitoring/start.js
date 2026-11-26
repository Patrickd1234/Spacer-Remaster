// Imported first in main.jsx, so monitoring is on before the rest of the app's
// modules load and errors while they start are reported too.
import { startMonitoring } from "./sentry";

startMonitoring();
