# Higgsfield route

Generation through the Higgsfield MCP tools (`mcp__Higgsfield__*`) instead of
`scripts/kie.mjs`. Everything after generation is unchanged: download the file
into `out/`, read it, encode it with `encode.sh`, pull the poster with ffmpeg.

**Which provider.** Use Higgsfield when its MCP tools are connected in the
session, unless the user asks for kie.ai. Use kie.ai ([assets.md](assets.md))
when Higgsfield is not connected and `KIE_AI_API_KEY` is set. Do not mix the two
inside one wave of stills: the style preamble holds a shoot together only when
the same model renders every frame.

## Command mapping

| kie.mjs | Higgsfield |
|---|---|
| `kie.mjs probe` | `balance` |
| per-call price from the table | `generate_image` / `generate_video` with `get_cost: true` (submits nothing) |
| `still "<prompt>" out.png --ar 16:9` | `generate_image` `{model, prompt, aspect_ratio}` |
| `--ref brand.png` | `media_upload` → `curl -X PUT` the file → `media_confirm` → `medias: [{value: <media_id>, role: ...}]` |
| `shot "<move>" head.png out.mp4 --dur 5` | `generate_video` `{model, prompt, duration: 5, medias: [{value: <head>, role: "start_image"}]}` |
| `--tail end.png` | add `{value: <tail>, role: "end_image"}` to `medias` |
| polling `recordInfo` | `jobs_wait` with the returned job id(s), which returns the result URLs |

A still you just generated does not need to be downloaded and re-uploaded to
drive a clip: pass its **job id** as the `start_image` / `end_image` value.
Download it anyway, because you still have to read it before you spend a clip on
it.

## Models

Confirm a model's current aspect ratios, durations and media roles with
`models_explore` (`action: "get"`) before the first call of a build. The catalog
changes, and these notes are a starting point, not a contract.

- **Stills:** `nano_banana_2_1` (photoreal, takes `image_references`, `16:9`,
  `9:16`, `3:4`, `4:5` and more, up to `4k`) or `flux_3_image` (up to ten
  `image_references`, which suits passing the brand object every time). Ask for
  `resolution: "2k"` or higher for full-bleed heroes. Avoid
  `marketing_studio_image` and `ms_image` here: they compose an ad, and the
  skill needs a plate that copy sits on.
- **Clips (camera moves):** `minimax_h3` (2K, `start_image` + `end_image`, so
  chained legs can pin both ends) or `flux_3_video` (1080p, `start_image` +
  `end_image`). On `flux_3_video` pass `generate_audio: false`. `encode.sh`
  strips audio anyway with `-an`, so generating it only costs credits.
- **Single-frame clip with no tail:** `grok_video_v15` (`start_image` only).

Keep the 2-clip cap from SKILL.md. A cheaper provider does not change it,
because the cap is a quality rule.

## Procedure

1. `balance`, then preflight the plan: one `get_cost: true` call per distinct
   model and setting, multiplied out over the calls you intend to make. Tell
   the user the total before the first paid call.
2. Upload brand references once with `media_upload` (several files in one call),
   PUT each file to its `upload_url` with curl, then `media_confirm`
   (`type: "image"`). Reuse the returned media ids on every still.
3. Generate the stills. Independent prompts go through `generate_image_batch`
   (up to 12), and variants of one prompt use `count`. Every prompt is
   **preamble, blank line, scene**, exactly as in [assets.md](assets.md).
4. `jobs_wait` until every job is terminal (it waits up to 15s per call, so call
   it again while `all_terminal` is false). Download each result URL into
   `out/` with `curl -L -o`. **Read every image.**
5. Generate the clips from the approved stills' job ids, then wait and download
   them the same way.
6. Continue with `encode.sh`, the ffmpeg poster and the seam checks in
   [assets.md](assets.md). Nothing downstream changes.

If a generation call times out at the transport, do not resubmit it blindly.
The job may have been accepted. Check it with `jobs_wait` on any id you have,
or `show_generations`, before submitting it again.

## What does not carry over from kie.ai

- The aspect-ratio table and the "seedream rejects `4:5`" warning are seedream
  facts. Take each Higgsfield model's ratios from `models_explore`.
- The 28 / 160 credit rates and the "ledger debits about 0.4x" observation are
  kie.ai billing. Higgsfield credits are a different unit, so cost a build from
  `get_cost` and the `balance` before and after. The same rule applies: a
  balance delta is only this build's spend if nothing else is generating on the
  account.
- `use_unlim`: leave it unset unless the user explicitly asks to spend
  free-trial generations. If the tool returns an `unlim_choice`, put that
  question to the user.
