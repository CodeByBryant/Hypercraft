# Phase 9 report: the Mirror Realm, the Crystal Abyss, the Cloud Archipelago

Status: **in progress** (this file grows with each step).

## 9.1 Third person, the player's body, a hand and a paper doll

Asked for alongside Phase 9, and done first so the rest of the phase can be seen on a body.

* **F5** (or 📷 on touch) cycles first person, third person from behind and third person from the
  front. The camera sits 4 blocks away along your 4D view direction and is pulled in by blocks
  (`Game.updateView`). Only the *view* moves: targeting, mining and attacks still start at your
  real eye, so the crosshair behaves as in Minecraft's third person.
* **The body** (`src/game/PlayerModel.ts`) is a humanoid made of the same analytic parts as the mobs
  (boxes and a capsule, at most 16), appended to the mob buffer by the packer
  (`MobManager.extraBody`). It wears the colours of your armour (taken from the armour items' icons),
  folds Phase Wings on its back and spreads them when you glide (prone along the heading), holds the
  item in the right hand, swings the arm when you attack, mine or place, walks with the legs
  against the arms, lowers when you sneak and raises a shield or a drawn bow.
* **The body frame is your camera frame without pitch**, so it turns with you and with the slice:
  rotate the slice through W and you stay a clean figure. (Mobs, with a fixed frame, are cut
  obliquely; you are not a mob.)
* **First person** has a *paper doll* hand (`src/ui/BodyViews.ts`): a flat sleeved arm holding the
  item's icon, bobbing with your stride, swinging, rising when you switch items, coming to the mouth
  when you eat, up in front of you when a shield blocks, pulled back to draw a bow. A small *paper
  doll* of yourself (the same part list drawn as rectangles, front on) sits in the top-left corner and
  shows armour, wings, sneaking and the swing. Both are settings (Settings: show hand, show paper
  doll); the hand is hidden on touch screens, where the buttons live.
* Tests: `tests/unit/playermodel.test.ts` (part budget, bounding radius, armour, swing, glide, sneak)
  and `tests/e2e/body.spec.ts` (hand, doll, third person, front view with a tilted slice).

Screenshots: `docs/screenshots/phase-9/body-1-first-person.png`, `body-2-third-person.png`,
`body-3-third-person-front-tilted.png`.
