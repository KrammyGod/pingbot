"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseMaintenanceError = exports.PermissionError = exports.TimedOutError = exports.IgnoredException = void 0;
/* Custom exceptions that are ignored by the bot. */
class IgnoredException extends Error {
}
exports.IgnoredException = IgnoredException;
class TimedOutError extends IgnoredException {
}
exports.TimedOutError = TimedOutError;
class PermissionError extends IgnoredException {
}
exports.PermissionError = PermissionError;
class DatabaseMaintenanceError extends IgnoredException {
}
exports.DatabaseMaintenanceError = DatabaseMaintenanceError;
//# sourceMappingURL=exceptions.js.map