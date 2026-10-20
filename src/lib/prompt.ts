import type { ExportInput } from '../types'
import { buildExportDocument, buildExportSpec } from './export'

export type PromptScope = 'both' | 'background' | 'effect'
export function buildPrompt(input: ExportInput, scope: PromptScope): string {
  if (scope !== 'effect') {
    const flowNote = input.background.flow?.enabled ? '程序背景需要按 spec.background.flow 中的完整 GLSL、uniforms 和动画时钟约定实现独立背景画布，再将模型及 CSS 网格叠加。纯色 CSS 仅作为回退，不能替代所选背景效果。\n\n' : ''
    return flowNote + buildExportDocument({ ...input, scope: scope === 'background' ? 'background' : 'shader', format: 'md' }).content
  }
  const { background: _background, ...effect } = buildExportSpec({ ...input, scope: 'shader' })
  return `# Shader Room · 仅效果复现

请在宿主页面中实现下面的模型与 Shader 效果，保留宿主背景，不创建或覆盖背景颜色和背景网格。画布保持透明。光照是效果的必要依赖，按 spec 中的 lighting 复现。

1. 使用 dependencies 中的版本，按 sceneRecipe 配置加载器及同源解码资源。按 model.instructions 获取随附的原始模型文件，并核对文件大小及 SHA-256；未附文件时请求原文件。
2. 按 sceneRecipe.normalization 归一化模型，恢复 snapshot 中相机、viewport、模型外层姿态。snapshot 已含缩放和累计旋转，不要再叠加 view 的姿态。恢复动画时从快照时间及角度继续。
3. 按 effect.renderPath 及对应 recipe、shaders 或 glsl、uniforms 构建渲染流程。原始材质保留模型材质；后处理效果使用透明离屏输入与全屏 pass；粒子使用独立 Points 材质及采样配方。保留 spec 中颜色空间、混合方式和输出约定，避免重复 tone mapping 或颜色转换。
4. 如有 particleRecipe、surfaceRecipe、referenceRecipe 或 interactiveEffectRecipe，完整实现其采样、字符图集、动画状态与参数映射。interactive-original-material-postprocess 保留原始材质进入线性离屏输入；interactive-direct-mesh 使用专属网格 Shader，直接输出 display-sRGB。不得套用旧效果的白色替代材质流程。
5. 如有 interaction，完整实现其 settings、uniforms、snapshot 和 recipe，包括左下原点 UV、CSS 像素半径、鼠标跟随与强度缓动、拖动及面板遮挡暂停、减少动态效果行为。互动开关独立于模型自转及动画播放。精确参数和完整 GLSL 以下方 Spec 为准。

6. 如果 effect.renderPath 为 effect-stack，严格按 composition.layers 的数组顺序执行两层，分别保留各层 parameters、uniforms、shaders、interaction 与字符图集。按 composition 中的颜色空间及透明度协议传递中间纹理，不叠加背景，不将两层参数合并。

## 完整效果 Spec

\`\`\`json
${JSON.stringify({ ...effect, scope: 'effect' }, null, 2)}
\`\`\`
`
}
