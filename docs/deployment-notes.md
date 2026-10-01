## Deployment Notes

Keep `./data` and `./library` on persistent storage. The Library mount must be writable so MediaWall can save artist images.

Mount `./app/sounds`, `./app/custom_logo`, and `./app/collections` separately, as shown in Quick Start. Put custom sounds in `app/sounds`. Don't mount over the whole `/app` directory: that can hide the files MediaWall needs to run.

A local music mount only needs write access if you want to edit its artwork. MediaWall never edits audio or video files.
