# Deployment Folder

This folder contains scripts to upload slash commands to Discord. This may not be an updated list of files, however
effort will be made to keep it updated.

## Files

- [deploy_commands.ts](deploy_commands.ts): The script that will deploy to Discord as global slash commands. This script
  is run with every build (see [package.json](/package.json#L44),
  [pull_requests.yml](../../.github/workflows/pull_requests.yml#L66), and
  [push.yml](../../.github/workflows/push.yml#L52)).
