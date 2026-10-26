import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("check signal lost", { minutes: 1 }, internal.busState.markSignalLost, {});
crons.interval("close shifts after hours", { minutes: 15 }, internal.shifts.closeAfterHours, {});
crons.interval("purge old pings", { hours: 24 }, internal.pings.purgeOld, {});
export default crons;
