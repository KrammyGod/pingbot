/* Custom exceptions that are ignored by the bot. */
export class IgnoredException extends Error {}

export class TimedOutError extends IgnoredException {}

export class PermissionError extends IgnoredException {}

export class DatabaseMaintenanceError extends IgnoredException {}
