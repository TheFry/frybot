# Manual Discord Test Checklist

This checklist covers the ~5% of frybot behavior that automated tests cannot reach: the real Discord WebSocket layer, voice channel audio playback, button/modal rendering, and multi-bot coordination.

Run this before every production release.

---

## Setup

- [ ] Test server with the bot(s) invited and slash commands registered
- [ ] At least one voice channel in the test server
- [ ] `cmd_processor` and at least one `voice_bot` instance running (dev or Nomad)
- [ ] Redis accessible to all running processes
- [ ] A second Discord account (or a friend) for multi-user tests

---

## Play Flow

- [ ] `/play <search query>` — bot replies with search results as buttons
- [ ] Click a song button — bot joins the voice channel and starts playing audio
- [ ] Audio is audible in the voice channel
- [ ] Queue display updates correctly after selection
- [ ] `/play <query> next:true` — new song is inserted at the front of the queue, not the back

---

## Queue Controls

- [ ] `/skip` — currently playing song stops; next song in queue starts
- [ ] `/pause` — audio pauses mid-playback
- [ ] `/unpause` — audio resumes from where it paused
- [ ] `/stop` — audio stops, bot leaves the voice channel
- [ ] `/replay` — restarts the current (or last played) song from the beginning

---

## Clip Flow

- [ ] `/clip <YouTube URL>` — modal appears with URL pre-filled, start time, and duration fields
- [ ] Submit modal with valid values — bot processes and returns a trimmed `.mp3` file attachment
- [ ] `/clip <search query>` — search results appear; "Select Video" button opens the clip modal
- [ ] Submit with an invalid duration (letters) — bot replies with an error, no file returned
- [ ] Let the modal time out — bot replies with timeout message

---

## Play-Many Flow

- [ ] `/play-many` — modal appears with a multi-line text input
- [ ] Paste 3–5 valid YouTube URLs (one per line) — bot queues all songs
- [ ] Include one invalid URL in the list — bot reports invalid link but queues the valid ones
- [ ] Paste only invalid URLs — bot replies with "No valid links provided"

---

## Edge Cases

- [ ] Run a command while **not** in a voice channel — bot replies with the correct error message
- [ ] Let button selection time out (wait 30 seconds after `/play`) — bot replies with timeout message
- [ ] Start playing in two different voice channels simultaneously using two bot accounts — each bot serves its own channel independently
- [ ] `/skip` while nothing is playing — verify bot handles it gracefully (no crash)
- [ ] Queue multiple songs, then `/stop` mid-queue — bot cleans up and leaves; queue is cleared

---

## Multi-Bot Coordination

- [ ] Start two separate voice sessions in different channels — confirm different voicebot instances handle each (check logs for `voicebot1` vs `voicebot2`)
- [ ] Stop one session — confirm the other session continues uninterrupted
- [ ] Fill all three voice bot slots simultaneously — fourth attempt to start a new session either waits or fails gracefully

---

## Permissions & Visibility

- [ ] Bot buttons and modals render correctly for other users (not just the command invoker)
- [ ] Non-admin user can run `/play`, `/skip`, `/stop`, etc.
- [ ] Bot does not crash or expose errors when it lacks permission to join a voice channel

---

## Post-Test Cleanup

- [ ] All test voice sessions ended
- [ ] No stale keys left in Redis (`redis-cli keys "discord:channel:*"`)
- [ ] No orphaned `frybot:reserved-channels` entries (`redis-cli smembers frybot:reserved-channels`)
