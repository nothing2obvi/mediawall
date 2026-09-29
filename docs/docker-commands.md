## Docker Commands

Once the container is running, you can test sounds, MediaWall fallback animations, and backdrop animations from inside the container:

```sh
docker exec mediawall npm run mediawall -- play sound noted.mp3 on livingroom
docker exec mediawall npm run mediawall -- play sounds All on livingroom
docker exec mediawall npm run mediawall -- play mediawall dvd on livingroom
docker exec mediawall npm run mediawall -- play screensaver All on livingroom
docker exec mediawall npm run mediawall -- play user transition on livingroom
docker exec mediawall npm run mediawall -- play user transition doug on livingroom
docker exec mediawall npm run mediawall -- animation pan on livingroom
docker exec mediawall npm run mediawall -- animation all --random on livingroom
```

The MediaWall fallback test displays the selected fallback for 30 seconds. `All` previews each configured MediaWall fallback animation for 30 seconds each and labels the current one in the bottom-right corner. Animation previews use the current backdrop by default; add `--random` to pick a random backdrop for the preview. `play sounds All` plays each available sound with two seconds between sounds and labels the current sound in the bottom-right corner. `play user transition` previews the Now Playing user-intro overlay. The command reads `config.yml`, so it can target password-protected spaces without putting the password in the command.

