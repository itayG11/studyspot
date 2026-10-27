# How the demo video was made

Two scripts, kept here so the video can be made again.

1. `record.mjs`: `node record.mjs <en|he> <folder>`. Drives the live demo site in a browser with Playwright, records a video, and writes `scenes.json` with the start and end of every scene. The length of each scene is fixed in `WINDOWS` at the top, so it matches the narration.
2. `assemble.py`: `python3 assemble.py <folder> <en|he> <out.mp4>`. Cuts the scenes out of the recording, joins them, and lays one narration sentence at the start of each scene.

The narration was one clip per language, made with Higgsfield (ElevenLabs). The sentence boundaries in `assemble.py` (`BOUNDS`) were found with `ffmpeg -af silencedetect` and must be measured again for a new narration.

The paths inside both scripts point to the machine they were written on (the browser, the Playwright folder, the audio folder). Edit them before use.

The finished videos are on the release page: https://github.com/itayG11/studyspot/releases/tag/demo-video-v1
