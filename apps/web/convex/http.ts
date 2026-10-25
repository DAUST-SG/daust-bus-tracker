import { httpRouter } from "convex/server";
import { pair, getConfig, startShift, endShift, postPings, patchState } from "./driverApi";
import { getStatus, health } from "./publicApi";

const http = httpRouter();

http.route({ path: "/api/v1/driver/pair", method: "POST", handler: pair });
http.route({ path: "/api/v1/driver/config", method: "GET", handler: getConfig });
http.route({ path: "/api/v1/driver/shifts", method: "POST", handler: startShift });
http.route({ path: "/api/v1/driver/shifts/end", method: "POST", handler: endShift });
http.route({ path: "/api/v1/driver/pings", method: "POST", handler: postPings });
http.route({ path: "/api/v1/driver/state", method: "PATCH", handler: patchState });

http.route({ path: "/api/v1/status", method: "GET", handler: getStatus });
http.route({ path: "/api/v1/health", method: "GET", handler: health });

export default http;
