// "Report a problem" button (Piezas SDK; route in server/app.ts). Imported first in main.ts, so it
// records errors from the moment the app starts loading, and it lives outside the app's own DOM, so
// it stays on screen even if a render breaks. Shown only when the server says it is on.
import { mountReportProblem } from '@piezas/sdk/report-problem';

mountReportProblem();
