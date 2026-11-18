# Hide-and-seek warmer / colder slider

## Scope

Make the existing multiplayer house support informal hide-and-seek with a clear proximity slider. Players agree on hiding and seeking themselves; this change does not add roles, timers, rounds, or automatic capture. Preserve flight, paint tagging, doors, cupboards, and existing work in progress.

## Behavior

- Add a compact HUD indicator with COLDER at the blue end and WARMER at the orange/red end, plus a moving thumb. It is an automatic readout, not a draggable setting.
- Track the nearest eligible other player using three-dimensional distance, including floor height. Exclude self and unavailable/respawning players. Do not display target identity, room, direction, or exact distance.
- Map distance to a bounded 0–100 warmth value using documented constants suited to the house bounds. Use light smoothing and a distance-change deadband so network corrections do not flicker the feedback.
- Display WARMER or COLDER based on distance change to the same target; show a neutral steady state without meaningful movement. Reset trend when targets switch, on respawn, reconnect, or room changes. Never treat proximity through a wall as a confirmed find.
- Show a clear waiting state with no other player, and a paused/unavailable state during connection loss. Do not leave stale active readings on screen.
- Remove opponent map markers and roster room labels that reveal hiding places. Keep the local map, roster identities, visible drones, and existing flight controls.

## Implementation

1. Put deterministic proximity selection, normalization, and trend logic in a small module with focused tests. Reuse existing network snapshots; no additional server messages are necessary.
2. Integrate updates with the existing HUD cadence and lifecycle cleanup. Keep per-frame work and DOM updates small.
3. Add responsive slider styling consistent with the existing interface, visible text feedback, accessible meter semantics, and reduced-motion support. Keep it clear of controls and door prompts at narrow widths.
4. Adjust lobby/help/README copy to describe hide-and-seek and explain the indicator and informal roles accurately.
5. Run focused tests, typecheck, existing tests, and production build. Perform a targeted browser check when available, recording any environmental limitation without claiming unperformed validation.

## Acceptance

- Moving closer increases warmth and shows WARMER; moving away decreases warmth and shows COLDER.
- Vertical separation counts; stationary jitter does not rapidly alternate feedback.
- Solo, target changes, respawn, disconnect, leave, and rejoin do not produce misleading trends.
- Opponents are not revealed by map markers or roster location text.
- Indicator is legible at desktop and narrow widths and never captures flight input.
- Existing geometry/assets and unrelated work remain intact.

## Implementation and validation

Implemented by a GPT-5.6 Sol agent, with root integration review. The tracker lives in `src/client/proximity.ts`, with focused coverage in `tests/proximity.test.ts`. HUD markup/styles and lifecycle integration use the existing client, with no new server messages or asset changes.

The full 71-test suite and production build passed. Root also ran a three-client Chrome check against the local development server: solo waiting, multiplayer activation, departure back to waiting, and connection loss to paused all passed without runtime errors. HUD captures were inspected at desktop and narrow widths. That browser run substituted a lightweight visual house while retaining the real client, multiplayer server, and simulation; it is not a full-house rendering or performance validation. Review additionally identified and corrected held-trend state on target switches and a medium-width HUD overlap.
