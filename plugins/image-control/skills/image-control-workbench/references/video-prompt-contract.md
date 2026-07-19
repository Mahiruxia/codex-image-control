# Video prompt contract

Use this contract only after a formal shot image exists.

## Positive prompt

- Use affirmative, executable language only.
- Describe, in order: visible initial state, one principal action, physical contact and weight transfer, final stable state, and camera behavior.
- Keep one clip to one principal action. Preserve identity, outfit, prop count, scene geometry, and normal 1x speed.
- For walking, describe only the current step and its support-foot transition. For a stable standing shot, keep both soles and contact points fixed while the upper body performs the one small action.
- Do not place prohibitions, negative lists, or words such as “不要、禁止、避免、不能、不得、无” in the positive prompt.

## Negative prompt

Put quality controls here, separate from the positive prompt: extra people or objects, duplicate limbs, face or outfit drift, sliding feet, crossed legs, floating contact, distorted hands, sudden camera movement, looping motion, long eye closure, text, watermark, logo, and temporal deformation.

## Duration

- 49 frames at 16fps: 3.0625 seconds, for a simple look, breath, hand adjustment, or environmental motion.
- 65 frames at 16fps: 4.0625 seconds, for one medium action with a clear contact transition.
- 81 frames at 16fps: 5.0625 seconds, the default baseline for a clearly motivated action with a short settle.
- 97 frames at 16fps: 6.0625 seconds, for a longer contact transition or a single walking step that needs a visible settle.
- 113 frames at 16fps: 7.0625 seconds, the longest option, for one complex but singular action such as putting on a shoe, opening a door, or carefully moving an object across a level change.
- Keep every shot within this approximately 3–7 second range. For a multi-shot set, use 81 frames as the starting point and distribute shorter or longer choices by real action complexity so the set averages about 5 seconds. Do not mechanically assign the same duration to an entire set.

The saved prompt is editable. Enqueueing creates an immutable prompt snapshot. If the source image or shot action changes, prepare a fresh plan unless the user explicitly confirms use of the stale snapshot.
