-- This is the old schema definition
-- Prior to 2023-08-01, where I had no idea what I was doing
-- See ./schema.sql for improved schema

CREATE TYPE gend AS ENUM ('Male', 'Female', 'Unknown');

CREATE TABLE commons (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    gender gend NOT NULL,
    origin text NOT NULL,
    img text NOT NULL -- Common chars have only one image
);

CREATE TABLE completed_series (
    id bigint NOT NULL,
    origin text NOT NULL,
    count int NOT NULL,
    UNIQUE (id, origin) -- Should've been primary key instead
);

-- HoyoLab autocollect emoji mapping
CREATE TABLE emojis (
    name text PRIMARY KEY,
    emoji text NOT NULL
);

CREATE TABLE genshin_cookies_list (
    id bigint PRIMARY KEY,
    cookies text[] NOT NULL, -- array allows for multiple checkins
    notify boolean NOT NULL
);

CREATE TABLE honkai_cookies_list (
    id bigint PRIMARY KEY,
    cookies text[] NOT NULL, -- array allows for multiple checkins
    notify boolean NOT NULL
);

CREATE TABLE star_rail_cookies_list (
    id bigint PRIMARY KEY,
    cookies text[] NOT NULL, -- array allows for multiple checkins
    notify boolean NOT NULL
);

CREATE TABLE guess_info (
    id text PRIMARY KEY, -- Should be back to bigint
    easy_max_streak int NOT NULL,
    easy_streak int NOT NULL,
    medium_max_streak int NOT NULL,
    medium_streak int NOT NULL,
    hard_max_streak int NOT NULL,
    hard_streak int NOT NULL
);

-- Table to store guild welcome settings
-- All (except msg) are changed to bigint in new schema
CREATE TABLE guild_new_member (
    id text PRIMARY KEY,
    msg text,
    roleid text,
    channelid text
);

CREATE TABLE user_chars (
    id text NOT NULL,
    name text NOT NULL,
    gender gend NOT NULL,
    origin text NOT NULL,
    lvl int NOT NULL,
    fc boolean NOT NULL,
    img text NOT NULL,
    nimg text NOT NULL,
    nsfw boolean NOT NULL,
    idx bigint NOT NULL,
    UNIQUE (id, name, origin, gender, fc),
    CHECK (idx > 0)
);

CREATE TABLE user_info (
    id text PRIMARY KEY, -- Should be bigint
    brons int NOT NULL,
    collected boolean NOT NULL,
    whales boolean NOT NULL,
    CHECK (id::bigint > 0) -- Why was this here?
);

CREATE TABLE waifus (
    name text NOT NULL,
    gender gend NOT NULL,
    origin text NOT NULL,
    img text[] NOT NULL,
    nimg text[] NOT NULL,
    UNIQUE (name, gender, origin) -- Should be primary key
);
