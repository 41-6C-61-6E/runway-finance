#!/bin/bash
# Sync local changes to the remote machine runway-finance directory

echo "Syncing local files to antithropic@10.1.1.10:~/runway-finance/ ..."

rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  ./ antithropic@10.1.1.10:~/runway-finance/

echo "Sync complete!"
