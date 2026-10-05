Bundled human interviewer

interviewer.glb is an optimized copy of the Blender/MPFB human example
from Mika Suominen's TalkingHead project, distributed under CC0.

Source: https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb
Source Git blob: cd2ebbe1fe8bcbf3d5b2dfbf1262a7f76814e68f
Asset license: https://creativecommons.org/publicdomain/zero/1.0/
Attribution and license declaration:
https://github.com/met4citizen/TalkingHead#the-indexhtml-test-app

The model includes textured skin, eyes, hair, a fitted outfit, teeth and tongue,
with authored Oculus visemes and ARKit facial shapes. It is hosted locally
and does not require an avatar service or API key.

Optimization: glTF Transform 4.5.1, Meshopt geometry compression and WebP
textures (maximum 2048px). Rig and facial shapes preserved. 36.82MB -> 3.55MB.

The renderer uses a cloned skeleton, a fixed head-and-shoulders camera,
and direct viseme targets; silence restores the neutral face. The example's
outfit is recoloured charcoal and the arms are posed down from the rig's A-pose.

Conversational articulation attenuates the maximum vowel shapes (especially
aa/E/I/O/U), normalizes overlapping cues, and does not add a second jaw morph
on top of authored visemes. Skin uses physical specular shading with the
original textures, directional self-shadows, and restrained portrait lighting.

The dashboard preloads the renderer/GLTF decoder cache. The interview ready
screen renders the same canvas used by the first question and warms up its
shaders before enabling Start Interview, including for coding questions.

Interviewer variants

Michael uses the approved interviewer.glb with its original proportions,
hairstyle, facial details and charcoal outfit. There are no variant-specific
bone scale changes or hair cuts applied to this character.

Bella is a separately authored interviewer-female.glb (3.24 MB). It retains the
MPFB rig and facial channels, with a softly sculpted lower face/nose, subtle
adult skin detail, chestnut chin-length bob and a simple muted plum outfit.
The fringe is shaped above the eyes for clear eye contact. Facial sculpting is
applied consistently to the bind mesh AND every authored expression; eyes,
teeth and tongue continue to follow speech. The bob is bound to the Head joint.

Additional CC0 assets: MakeHuman system bob02 mesh/strand texture and
middleage_lightskinned_female_diffuse skin texture (blended with the source skin).
Asset pack, license and previews:
https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
Hair OBJ SHA-256: 30d44038836d786364eb4134a9259cf93ca0c707f883861b0135ebfb149caa08
Hair PNG SHA-256: 38c88e6f71631356591f09b1f17a1bb5a99c3bb095b1a29003f1dc3d3e839b0d
Skin PNG SHA-256: bcb9c2c8ace23880bc4407602a249abbcf4608b6ba0894e423b031913012a363

Both assets are locally hosted and use Meshopt/WebP. The dashboard preloads
the selected model; each model has its own loader cache. Dashboard portraits
are interviewer-male-original.png and interviewer-female-bob.png.
Voices: am_michael and af_bella respectively.

Rebuild Bella (offline authoring only; no tooling is needed at runtime):

1. Extract the CC0 system asset pack into an asset-input directory.
2. In a separate tooling directory, install @gltf-transform/core@4.5.1,
   @gltf-transform/extensions@4.5.1, @gltf-transform/functions@4.5.1,
   meshoptimizer, gl-matrix and sharp.
3. From the application root, run:
   node scripts/build-female-interviewer.mjs --tools <tooling-directory> --assets <asset-input-directory>

The script reads interviewer.glb and writes interviewer-female.glb. It never
writes to the approved original asset. Refresh Bella's dashboard portrait from
the rendered neutral pose after an intentional model change.
