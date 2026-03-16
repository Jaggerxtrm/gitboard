/**
 * Beadboard - Beads Issue Tracking Dashboard
 */

import { startServer } from "./api/server.ts";

const port = parseInt(process.env.PORT || "3001");

startServer(port);
