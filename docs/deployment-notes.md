## Deployment Notes

Current compose examples mount `./app/sounds`, `./app/custom_logo`, and `./app/collections` separately. Add custom sounds to `app/sounds` so MediaWall has one canonical sound directory at `/app/sounds`. Mounting the whole `/app` directory is not recommended because it can hide the application files inside the container.

