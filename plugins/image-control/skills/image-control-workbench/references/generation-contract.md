# Generation handoff contract

## Required tool order

For each request ID:

1. `get_generation_context`
2. `set_generation_status(status: "generating")` — call this only after a worker has an available generation slot and can begin immediately. It atomically claims the request and returns `request.claimToken`, `claimedAt`, `leaseExpiresAt`, and `attempt`. Retain the token inside this worker only. If the call is rejected or no token is returned, another task owns or finished it; stop this pipeline without generating or committing.
3. Codex built-in image generation or image editing
4. Visual contract validation against every affected shot's exact `cast`, order, and request-specific invariants
5. `commit_generation_result(claimToken: "...")` with the exact token returned by step 2

After a claim, every later status transition and result commit must include the same `claimToken`. On an exception, use `set_generation_status(status: "failed", error: "...", claimToken: "...")`. A mismatched, expired, recovered, or missing token must stop that worker; it must never overwrite a newer attempt.

For multiple request IDs, use Codex's available multi-agent worker pool up to the host's current maximum safe capacity. Keep the IDs in a shared unclaimed backlog. The root agent may participate as one worker, and each worker claims exactly one request, performs the complete order above, then claims its next request only after commit or failure. As soon as one worker receives and validates its generated bitmap, it must call `commit_generation_result` immediately. Never wait for sibling image generations and never batch several commits at the end; the workbench relies on per-request commits to reveal each finished frame while the remaining requests continue.

Do not pre-claim the backlog or mark requests `generating` while they are merely waiting for a worker. This is fake concurrency and also prevents safe retry after an interrupted task. If the host offers no parallel agent/image-generation capacity, downgrade honestly to one complete pipeline at a time and leave the rest queued. One worker's failure never stops or delays the others.

Correct orchestration is conceptually `allSettled(requestIds.map(processOne))`, where `processOne` performs context → generating → imagegen → commit/fail before it resolves. The incorrect pattern is `generate all → wait for all → commit all`.

`commit_generation_result` is the only supported completion path. It normalizes the output to PNG, writes through a temporary file, atomically replaces the target, stores only one undo image for a shot, updates request state, and removes request runtime files.

If a claimed request outlives its lease because a task was interrupted, use `recover_generation_request` for that specific request before retrying it. Recovery invalidates the old claim token; any late result from that attempt must be rejected. Never recover a healthy request just to obtain another worker slot.

Before that commit, visually inspect the actual returned bitmap. A contact sheet is accepted only when every cell has the correct subject identities, exact total count, gender/species mapping, canonical position, and no generated text. Never knowingly commit a cell that changed one male plus one female into two males or duplicated one identity. Retry once with the failing cell locks repeated locally; if the retry still fails or the bitmap cannot be inspected reliably, mark the request failed with the affected cell numbers and concrete reason.

## Request kinds

### contact_sheet

- `shotIds` must cover every current project shot exactly once. The server and generator use canonical project order regardless of the caller's input order; a subset, duplicate, missing, or unknown ID is invalid.
- Save to the project's `storyboard/contact-sheet.png` through commit.
- Produce exactly one panel per current shot using the exact `contactSheetGrid.columns` × `contactSheetGrid.rows` layout from context. Fill cells in shot order, left-to-right then top-to-bottom. Do not generate words or save duplicate full-size images for this step.
- Repeat every shot's complete `cast` inside its own cell instructions. Each cell must independently preserve the exact subject count, persistent identity, gender/species, and role relationship. A global cast paragraph is not sufficient.
- Commit marks the sheet current but unapproved. Human confirmation through `mark_contact_sheet_review` is required before `final` requests can be registered. Never approve it automatically as part of generation.

### contact_sheet_edit

- One or more selected shot IDs are associated with the request; the server canonicalizes them to full project order, and their cell positions follow the full project shot order and `contactSheetGrid`.
- `currentImagePath`, `maskPath`, and `annotatedPreviewPath` are required. The mask is authoritative and the numbered preview identifies the selected cells.
- Apply the instruction only inside selected cells. Reassert the complete `cast` for each selected cell, including exact identity, gender/species, and count. Preserve unselected cells, grid boundaries, output dimensions, shot order, and all pixels outside the mask. Return one complete, text-free contact-sheet bitmap.
- Commit atomically replaces `storyboard/contact-sheet.png`, keeps the same grid metadata, and clears prior approval so the edited sheet is reviewed again.

### final

- Exactly one shot is associated with each request.
- The shot's `cast` is mandatory and authoritative for subject count, persistent identity, gender/species, and role relationship. Apply all labeled image references and text constraints to their corresponding subjects without blending or swapping roles.
- Every project requires a present, current, human-approved contact sheet. If the brief, ratio, references, text constraints, shot content, count, or order changed, regenerate and confirm the sheet first.
- Commit replaces only that shot's `current.png` and leaves other shots untouched.

### image_edit

- Exactly one image-editor shot is associated with the request.
- `currentImagePath` is required and is the authoritative editing base. No contact sheet or project reference is required.
- Apply the user's instruction to the complete image while preserving subjects, identity, objects, composition, text, lighting, and texture that the user did not ask to change.
- Commit replaces the editor's `current.png`, keeps one undo image, and makes the result the base of the next edit. The same image may be edited repeatedly without a version-count limit.

### region_edit

- Exactly one shot is associated with the request.
- `currentImagePath`, `maskPath`, and `annotatedPreviewPath` are required.
- The transparent mask is the authoritative edit area; the marked preview explains intent.
- Keep every unmasked pixel exactly unchanged; semantic similarity is not sufficient. Ask the image generator to preserve the pixel dimensions and aspect ratio of `currentImagePath`.
- The server normalizes a same-aspect generated candidate to the source canvas when necessary, then composites only the generated masked region over the authoritative current image before commit. An incompatible aspect ratio, empty or mismatched mask, or result that cannot be safely confined to the mask must fail rather than overwrite the whole image.

## Result transfer

Prefer the image generator's returned data URL. If the host provides an official OpenAI file reference instead, pass it as `imageFile` with its download URL and optional token. Never create a public upload or third-party storage dependency.

## State meanings

- `queued`: registered and waiting for Codex.
- `generating`: one real worker owns the request under a lease and built-in image generation is running; backlog waiting for a slot remains `queued`.
- `saving`: server is normalizing and atomically committing.
- `completed`: file is committed; the corresponding shot becomes `review`.
- `failed`: error is retained for targeted retry.
- `cancelled`: only a still-queued request was cancelled.

For a successful `final` or `region_edit`, the owning worker may prepare and save the shot's video plan from the committed real frame before taking another image request. This is prompt preparation only. It must not delay image commit and must never submit a paid video job.
