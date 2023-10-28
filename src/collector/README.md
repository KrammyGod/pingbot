# Collector Folder
This folder contains the autocollector script and the crontab job file that runs all the games. This may not be an updated list of files, however effort will be made to keep it updated.

## Files
- [collector.ts](collector.ts): A special script run on 16:00 UTC to collect HoyoLab dailies from either Genshin Impact, Honkai Impact 3rd, or Honkai Star Rail. More details of the time can be found in the crontab file below.
- [crontab](crontab): The crontab configuration to automatically collect HoyoLab dailies when it resets, and resetting dailies for anime character system.

## Other Files
- [.env-cmdrc](../../.env-cmdrc): The environment variables defined for each game. Used in [package.json](../../package.json) to run the correct game.
