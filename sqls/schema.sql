-- This is the improved schema of old_schema.sql
-- Created on 2023-08-01

CREATE TYPE gend AS ENUM ('Male', 'Female', 'Unknown');

CREATE TABLE IF NOT EXISTS commons (
    iid BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    gender gend NOT NULL,
    origin TEXT NOT NULL,
    img TEXT NOT NULL
);
CREATE INDEX ON commons (name);
CREATE INDEX ON commons (origin);

CREATE TABLE IF NOT EXISTS completed_series (
    uid BIGINT NOT NULL REFERENCES user_info ON DELETE CASCADE,
    origin TEXT NOT NULL,
    count INT NOT NULL
);

-- Equivalent to a multi-table check constraint,
-- raises exception when count is invalid
CREATE OR REPLACE FUNCTION check_valid_cnt() RETURNS trigger AS $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO STRICT cnt FROM chars WHERE origin = NEW.origin AND fc = TRUE;
    IF NEW.count < 0 OR NEW.count > cnt THEN
        RAISE EXCEPTION 'Invalid count, "%" has % waifu(s), inserted %', NEW.origin, cnt, NEW.count;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER check_valid_cnt
BEFORE INSERT OR UPDATE ON completed_series
FOR EACH ROW
EXECUTE PROCEDURE check_valid_cnt();

-- HoyoLab autocollect emoji mapping
CREATE TABLE IF NOT EXISTS emojis (
    name TEXT PRIMARY KEY,
    emoji TEXT NOT NULL
);

-- Notify will DM the user
-- Checkin will do a checkin silently
-- None will not attempt checkin
CREATE TYPE checkin_type AS ENUM ('none', 'checkin', 'notify');
CREATE TABLE IF NOT EXISTS hoyolab_cookies_list (
    idx BIGINT GENERATED ALWAYS AS IDENTITY,
    id BIGINT NOT NULL,
    cookie TEXT NOT NULL,
    genshin checkin_type NOT NULL DEFAULT 'none',
    star_rail checkin_type NOT NULL DEFAULT 'none',
    honkai checkin_type NOT NULL DEFAULT 'none',
    PRIMARY KEY (id, cookie)
);

CREATE TABLE IF NOT EXISTS guess_info (
    uid BIGINT PRIMARY KEY,
    easy_max_streak INT NOT NULL DEFAULT 0,
    easy_streak INT NOT NULL DEFAULT 0,
    medium_max_streak INT NOT NULL DEFAULT 0,
    medium_streak INT NOT NULL DEFAULT 0,
    hard_max_streak INT NOT NULL DEFAULT 0,
    hard_streak INT NOT NULL DEFAULT 0
);

-- Trigger to automatically update max streak on update
-- Design can probably be improved with multiple tables
-- However all uids in one place is also good
CREATE OR REPLACE FUNCTION update_max_streak() RETURNS trigger AS $$
BEGIN
    IF NEW.easy_streak > NEW.easy_max_streak THEN
        NEW.easy_max_streak := NEW.easy_streak;
    END IF;
    IF NEW.medium_streak > NEW.medium_max_streak THEN
        NEW.medium_max_streak := NEW.medium_streak;
    END IF;
    IF NEW.hard_streak > NEW.hard_max_streak THEN
        NEW.hard_max_streak := NEW.hard_streak;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_max_streak
BEFORE UPDATE ON guess_info
FOR EACH ROW
EXECUTE PROCEDURE update_max_streak();

-- Table to store guild welcome settings
CREATE TABLE IF NOT EXISTS guild_settings (
    gid BIGINT PRIMARY KEY,
    welcome_msg TEXT,
    welcome_roleid BIGINT,
    welcome_channelid BIGINT,
    emoji_replacement BOOLEAN NOT NULL DEFAULT TRUE
);

-- Table to store temporary data for any command
CREATE TABLE IF NOT EXISTS local_data (
    cmd TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    expiry TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (cmd, id)
);
CREATE INDEX ON local_data (id);

CREATE TABLE IF NOT EXISTS char_mapping (
    wid BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    iid BIGINT NOT NULL,
    fc BOOLEAN NOT NULL,
    UNIQUE (iid, fc)
);

CREATE TABLE IF NOT EXISTS user_info (
    uid BIGINT PRIMARY KEY,
    brons INT NOT NULL,
    collected BOOLEAN NOT NULL DEFAULT TRUE,
    whales BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (brons >= 0) -- Crucial for improved performance w/ transactions
);

CREATE TABLE IF NOT EXISTS waifus (
    iid BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT not null,
    gender gend not null,
    origin TEXT not null,
    img TEXT[] not null,
    nimg TEXT[] not null,
    UNIQUE(name, gender, origin),
    CHECK (array_length(img, 1) > 0)
);
CREATE INDEX ON waifus (name);
CREATE INDEX ON waifus (origin);

CREATE MATERIALIZED VIEW IF NOT EXISTS chars AS
-- Common chars
SELECT D.wid, B.name, B.gender, B.origin,
    string_to_array(B.img, '') AS img, '{}' AS nimg, D.fc FROM
char_mapping D
JOIN
commons B
ON D.iid = B.iid AND D.fc = FALSE
UNION
-- Starred chars
SELECT E.wid, C.name, C.gender, C.origin, C.img, C.nimg, E.fc FROM
char_mapping E 
JOIN
waifus C
ON E.iid = C.iid AND E.fc = TRUE;
CREATE INDEX ON chars (name);
CREATE INDEX ON chars (origin);
CREATE INDEX ON chars (fc);

-- To update the materialized view whenever character changes:
-- REFRESH MATERIALIZED VIEW chars;
-- The above is to be done inside the code.

CREATE TABLE IF NOT EXISTS user_chars (
    uid BIGINT NOT NULL REFERENCES user_info ON DELETE CASCADE,
    wid BIGINT NOT NULL REFERENCES char_mapping ON DELETE CASCADE,
    lvl INT NOT NULL DEFAULT 1,
    _img INT NOT NULL DEFAULT 1,
    _nimg INT NOT NULL DEFAULT 1,
    nsfw BOOLEAN NOT NULL DEFAULT FALSE,
    idx BIGINT NOT NULL,
    -- idx is not unique, there can be reordering
    -- wid is guaranteed unique, dupes become levels.
    PRIMARY KEY (uid, wid),
    UNIQUE (uid, idx) DEFERRABLE INITIALLY IMMEDIATE,
    CHECK (lvl > 0),
    CHECK (_img > 0),
    CHECK (_nimg > 0),
    CHECK (idx > 0),
    CHECK (_img <= lvl)
);

-- Trigger to automatically generate an index for user
-- when they get a new character
CREATE OR REPLACE FUNCTION update_user_idx() RETURNS trigger AS $$
BEGIN
    SELECT COALESCE(MAX(idx), 0) + 1 INTO STRICT NEW.idx FROM user_chars
    WHERE uid = NEW.uid;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER insert_user_chars
BEFORE INSERT ON user_chars
FOR EACH ROW
EXECUTE PROCEDURE update_user_idx();

-- These views are created to make the code easier
-- Perhaps also provide a little performance boost
CREATE OR REPLACE VIEW leaderboard AS
SELECT uid, brons, COALESCE(waifus, 0) AS waifus,
    row_number() OVER(
        ORDER BY brons DESC, COALESCE(waifus, 0) DESC, uid ASC
    ) AS idx
FROM (
    SELECT uid, brons FROM user_info
    ORDER BY brons DESC
) A NATURAL LEFT JOIN (
    SELECT uid, MAX(idx) AS waifus
    FROM user_chars GROUP BY uid
) B
ORDER BY idx ASC;

CREATE OR REPLACE VIEW starLeaderboard AS
SELECT uid, brons, COALESCE(waifus, 0) AS stars,
    row_number() OVER(
        ORDER BY COALESCE(waifus, 0) DESC, brons DESC, uid ASC
    ) AS idx
FROM (
    SELECT uid, brons FROM user_info
) A NATURAL LEFT JOIN (
    SELECT uid, COUNT(*) AS waifus
    FROM user_chars NATURAL JOIN chars
    WHERE fc = TRUE
    GROUP BY uid
) B
ORDER BY idx ASC;

CREATE OR REPLACE VIEW all_user_chars AS
SELECT U.uid, U.wid, C.name, C.gender, C.origin,
    U.lvl, C.fc, U._img, U._nimg, C.img[U._img],
    C.nimg[U._nimg], U.nsfw, U.idx FROM
user_chars U
JOIN
chars C
ON U.wid = C.wid;

-- Trigger to allow deletions from this table
CREATE OR REPLACE FUNCTION delete_all_user_chars() RETURNS trigger AS $$
BEGIN
    DELETE FROM user_chars WHERE uid = OLD.uid AND wid = OLD.wid;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER delete_from_all_user_chars
INSTEAD OF DELETE ON all_user_chars
FOR EACH ROW
EXECUTE PROCEDURE delete_all_user_chars();

-- Helper to get all chars of a user
-- Is this overkill?
CREATE OR REPLACE FUNCTION get_user_chars(uuid BIGINT)
    RETURNS TABLE (
        uid BIGINT,
        wid BIGINT,
        name TEXT,
        gender TEXT,
        origin TEXT,
        lvl INT,
        fc BOOLEAN,
        _img INT,
        _nimg INT,
        img TEXT,
        nimg TEXT,
        nsfw BOOLEAN,
        idx BIGINT
    )
AS $$
SELECT * FROM all_user_chars
WHERE uid = uuid
ORDER BY idx
$$ LANGUAGE SQL;

-- Helper to get all high chars of a user
CREATE OR REPLACE FUNCTION get_high_user_chars(uuid BIGINT)
    RETURNS TABLE (
        uid BIGINT,
        wid BIGINT,
        name TEXT,
        gender TEXT,
        origin TEXT,
        lvl INT,
        fc BOOLEAN,
        _img INT,
        _nimg INT,
        img TEXT,
        nimg TEXT,
        nsfw BOOLEAN,
        idx BIGINT
    )
AS $$
SELECT
    uid,
    wid,
    name,
    gender,
    origin,
    lvl,
    fc,
    _img,
    _nimg,
    img,
    nimg,
    nsfw,
    -- All the above just to replace the idx column
    row_number() OVER (
        ORDER BY lvl DESC, idx
    ) AS idx
FROM get_user_chars(uuid)
NATURAL JOIN
(
    SELECT wid FROM chars WHERE fc = TRUE
) A
ORDER BY idx
$$ LANGUAGE SQL;

-- Helper function to check if a waifu is upgradable
-- Used to check if we can level up user's character when getting dupe
CREATE OR REPLACE FUNCTION is_upgradable(wwid BIGINT)
    RETURNS BOOLEAN
AS $$
DECLARE
    upgradable BOOLEAN;
BEGIN
    SELECT fc INTO STRICT upgradable
    FROM chars WHERE wid = wwid;
    RETURN upgradable;
END;
$$ LANGUAGE plpgsql;

-- Helper to add a character and return details of whether the character
-- is a new character or a duplicate
CREATE OR REPLACE FUNCTION add_character(uuid BIGINT, wwid BIGINT)
RETURNS TABLE (
    uid BIGINT,
    wid BIGINT,
    name TEXT,
    gender gend,
    origin TEXT,
    lvl INT,
    fc BOOLEAN,
    _img INT,
    _nimg INT,
    img TEXT,
    nimg TEXT,
    nsfw BOOLEAN,
    idx BIGINT,
    new BOOLEAN -- Represents whether it is a new or upgraded
) AS $$
DECLARE
    newly_inserted BOOLEAN;
BEGIN
    WITH inserted_char AS (
        INSERT INTO user_chars(uid, wid)
        VALUES(uuid, wwid)
        ON CONFLICT ON CONSTRAINT user_chars_pkey
        DO UPDATE SET lvl = user_chars.lvl + 1
        WHERE user_chars.uid = EXCLUDED.uid AND
            user_chars.wid = EXCLUDED.wid AND
            is_upgradable(EXCLUDED.wid)
        RETURNING *
    )
    SELECT inserted_char.lvl = 1 INTO newly_inserted FROM inserted_char;
    IF newly_inserted IS NULL THEN
        newly_inserted := FALSE;
    END IF;

    RETURN QUERY SELECT *, newly_inserted AS new
    FROM all_user_chars A
    WHERE A.uid = uuid AND A.wid = wwid;
END;
$$ LANGUAGE plpgsql;

-- Helper that subtracts brons safely; throws exception on any unexpected changes
CREATE OR REPLACE PROCEDURE sub_brons(uuid BIGINT, special BOOLEAN, amt INT)
AS $$
DECLARE
    valid BOOLEAN;
BEGIN
    WITH brons_update AS (
        UPDATE user_info SET brons = brons - amt
        WHERE uid = uuid RETURNING *
    )
    SELECT EXISTS (SELECT 1 FROM brons_update) INTO valid;
    IF NOT valid THEN
        RAISE EXCEPTION 'user_not_found_error';
    END IF;
    IF special THEN
        WITH whale AS (
            UPDATE user_info SET whales = TRUE
            WHERE uid = uuid AND whales = FALSE RETURNING *
        )
        SELECT EXISTS (SELECT 1 FROM whale) INTO valid;
        IF NOT valid THEN
            RAISE EXCEPTION 'whale_fail_error';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Helper that removes gaps from one user's index efficiently
CREATE OR REPLACE PROCEDURE repair_index(uuid BIGINT)
AS $$
BEGIN
    UPDATE user_chars A SET idx = B.index FROM (
        SELECT uid, wid, row_number() OVER (
            ORDER BY idx
        ) AS index FROM user_chars WHERE uid = uuid
    ) B WHERE A.uid = B.uid AND A.wid = B.wid AND
    A.idx <> B.index;
END;
$$ LANGUAGE plpgsql;

-- The following are triggers that aid char_mapping
-- Create triggers to update char_mapping on insert/delete
CREATE OR REPLACE FUNCTION update_char_mapping() RETURNS trigger AS $$
DECLARE
    waifu_type BOOLEAN;
BEGIN
    -- Check if the table is commons or waifus
    IF TG_TABLE_NAME = 'commons' THEN
        waifu_type = FALSE;
    ELSIF TG_TABLE_NAME = 'waifus' THEN
        waifu_type = TRUE;
    ELSE
        -- Unrecognized table, just return NULL for safety.
        RETURN NULL;
    END IF;
    -- Update char_mapping
    IF TG_OP = 'INSERT' THEN
        INSERT INTO char_mapping (iid, fc) VALUES (NEW.iid, waifu_type);
        -- BEFORE INSERT
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM char_mapping WHERE iid = OLD.iid AND fc = waifu_type;
        -- BEFORE DELETE
        RETURN OLD;
    END IF;
    -- Unrecognized operation, just return NULL for safety.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER commons_changed
BEFORE INSERT OR DELETE ON commons
FOR EACH ROW
EXECUTE PROCEDURE update_char_mapping();

CREATE OR REPLACE TRIGGER waifus_changed
BEFORE INSERT OR DELETE ON waifus
FOR EACH ROW
EXECUTE PROCEDURE update_char_mapping();

-- ON UPDATE CASCADE was not enabled for user_chars
CREATE OR REPLACE FUNCTION update_user_chars_mapping() RETURNS trigger AS $$
BEGIN
    -- Only works on updates
    UPDATE user_chars SET wid = NEW.wid WHERE wid = OLD.wid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_user_chars_mapping
AFTER UPDATE ON char_mapping
FOR EACH ROW
EXECUTE PROCEDURE update_user_chars_mapping();
