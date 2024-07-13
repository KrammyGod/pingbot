# SQL Folder

This folder contains information about the current database. It is useful as a reference when writing SQL queries
in [database.ts](/src/modules/database.ts). This may not be an updated list of files, however effort will be made to
keep it updated.

## Files

- [migrate.sql](migrate.sql): (**now readonly**) The SQL code used to convert from the [old schema](old_schema.sql) to
  the [new schema](new_schema.sql).
- [old_schema.sql](old_schema.sql): (**now readonly**) This is the schema used before professional education on
  databases. Used as a reminder of what not to do, and to show how much better it is now.
- [schema.sql](schema.sql): The new and improved schema that is currently used in production. It is certainly not the
  best, and can be improved, but it is also stable enough currently to support current usage. This will be updated when
  the underlying schema changes.
