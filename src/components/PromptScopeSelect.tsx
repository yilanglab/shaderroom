import { PanelSelect } from './PanelSelect'
import type { PromptScope } from '../lib/prompt'

const options: { value: PromptScope; label: string; detail: string }[] = [
  { value: 'both', label: '背景与效果', detail: '完整场景与效果配置' },
  { value: 'background', label: '仅背景', detail: '背景、网格与场景光照' },
  { value: 'effect', label: '仅效果', detail: '模型、Shader 与必要光照' },
]
export function PromptScopeSelect({ value, onChange }: { value: PromptScope; onChange: (value: PromptScope) => void }) {
  return <PanelSelect value={value} onChange={onChange} options={options} label="复制内容" />
}
