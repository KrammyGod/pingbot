BEGIN;
ALTER TABLE guild_new_member RENAME TO guild_settings;
ALTER TABLE guild_settings RENAME COLUMN msg TO welcome_msg;
ALTER TABLE guild_settings RENAME COLUMN roleid TO welcome_roleid;
ALTER TABLE guild_settings RENAME COLUMN channelid TO welcome_channelid;
ALTER TABLE guild_settings ADD COLUMN emoji_replacement BOOLEAN NOT NULL DEFAULT TRUE;
COMMIT;
