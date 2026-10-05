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
