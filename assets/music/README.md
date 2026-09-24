# Drop-in music

InkTrack synthesizes its soundtrack at runtime (`src/audio/songs.js`), so no
audio files ship with the game. To use recorded music instead, put files here
named after the song ids, e.g. `menu.mp3`, `rooftop.ogg`, `ocean.m4a`:

| id | plays on |
|---|---|
| `menu` | menus, garage, editor |
| `rooftop` | City Rooftops tracks |
| `ruins` | Jungle Ruins tracks |
| `frost` | Snowy Peaks tracks |
| `canyon` | Red Canyon tracks |
| `ocean` | Tropic Bay (speedboat) tracks |
| `sky` | Cloud Kingdom (plane) tracks |

Supported: `.mp3`, `.ogg`, `.m4a`, `.wav`. A file replaces the synthesized
song with the same id and loops. Only add music you have the rights to.
