# Shaders pilot adaptations

The fluted glass and Bayer dither kernels, and the flowing gradient composition structure, are adapted from https://github.com/shader-effects-inc/shaders.

Upstream files: `packages/core/src/gpu/kit/warpMaps.ts`, `packages/core/src/gpu/kit/patternPaints.ts`, and `packages/core/src/shaders/FlowingGradient/index.ts`.

The additional ContourLines, Watercolor, Emboss, PixelSort, Frost, GlassTiles, CRTScreen and Shatter designs inspire bounded screen-space WebGL adaptations in `src/render/extendedEffects.ts`. Their implementation differences are recorded in exported recipes.

These are GLSL ports for Shader Room. The pilot implements only bars glass and Bayer 2/4/8 dithering. The gradient uses smooth value noise and sRGB interpolation, so it is not pixel-identical to the upstream default. See exported recipes for rendering conventions.

MIT License

Copyright (c) 2026 Shader Effects Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
