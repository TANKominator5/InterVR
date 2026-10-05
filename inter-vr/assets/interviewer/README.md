# Female interviewer reference

`female-reference.webp` is the user-supplied reference portrait, stored losslessly
for reproducible texture authoring. It is an authoring input; the application
loads the baked GLB and its rendered thumbnail.

Rebuild from the application root:

```powershell
node scripts/build-female-interviewer.mjs --tools <tooling-directory> --source <full-resolution-mpfb.glb> --reference assets/interviewer/female-reference.webp
```

The base MPFB mesh is CC0. The supplied reference image is separate from that
base asset's license and is used here at the user's request.
