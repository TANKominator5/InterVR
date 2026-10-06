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

Bella uses interviewer-female-photo.glb (approximately 2.61 MB), authored from
the user-supplied portrait in assets/interviewer/female-reference.webp.
Reference pixels are projected into the skinned facial UVs, the movable eyes,
and an authored side-part bob with a fitted hair curtain and 500 fine strands.
The model remains a 3D skeleton with all authored facial/speech channels; it is
not a static portrait substituted for the avatar. Texture projection is
calibrated for the interviewer's frontal portrait view and modest head motion.

The reference's lighting is preserved through unlit face/eye/hair materials.
Other meshes retain their normal 3D shading. Skin under the eyes is inpainted
so closed lids do not display a painted iris; eyeballs fade behind closing
lids. The photo's backdrop is removed only where connected to the image edges,
preserving internal highlights such as eye whites.

Eye detail uses a separate portrait texture registered to each eye's neutral
centre, with the spherical geometry and authored gaze morphs preserved. Face
UVs are baked from the sculpted positions and share depth-aware projection
with the hair. Facial UV islands have five pixels of colour padding to avoid
old-colour bleed at temples/ears. The hair mask excludes facial skin with a
feathered overlap, so its curtain cannot project a second cheek onto the face.

Facial sculpting applies to both bind geometry and authored expressions.
The source MPFB mesh remains CC0; the supplied reference image is separate
from that license and is used at the user's request. A lossless authoring
copy is retained outside public/ for reproducible builds.

Both assets are locally hosted and use Meshopt/WebP. The dashboard preloads
the selected model; each model has its own loader cache. Dashboard portraits
are interviewer-male-original.png and interviewer-female-photo.png.
Voices: am_michael and af_bella respectively.

Rebuild Bella (offline authoring only; no tooling is needed at runtime):

1. Download the full-resolution CC0 mpfb.glb from the source URL above.
2. In a separate tooling directory, install @gltf-transform/core@4.5.1,
   @gltf-transform/extensions@4.5.1, @gltf-transform/functions@4.5.1,
   meshoptimizer, gl-matrix and sharp.
3. From the application root, run:
   node scripts/build-female-interviewer.mjs --tools <tooling-directory> --source <full-resolution-mpfb.glb> --reference assets/interviewer/female-reference.webp

The script writes interviewer-female-photo.glb and never writes to the approved
interviewer.glb. Refresh Bella's dashboard portrait from the rendered neutral
pose after an intentional model change. The GLB embeds its source reference
dimensions and decoded-pixel SHA-256 fingerprint for provenance checks.
