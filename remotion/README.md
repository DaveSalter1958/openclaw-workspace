# Remotion Starter Pack

A clean local Remotion project for generating videos with Willy.

## Included starter compositions

- **TitleCard** — polished animated title/subtitle opener
- **PhotoSlideshow** — simple cinematic slideshow template
- **TalkingPoints** — explainer / bullet-point template
- **MissionControlIntro** — darker dramatic intro for tools/systems videos

## Run the studio

```bash
cd /home/davesalter/.openclaw/workspace/remotion
npm run dev
```

If port 3000 is occupied, use another port:

```bash
npm run dev -- --port 3002
```

## Render a composition

Example:

```bash
npx remotion render src/index.ts TitleCard out/title-card.mp4
```

## Best workflow

Tell Willy what kind of video you want, for example:

- make a short mission control intro
- make a slideshow from these hiking photos
- make a title card video with this text
- make an explainer video using these bullet points

Then Willy can adapt or extend these starter compositions instead of beginning from nothing.
