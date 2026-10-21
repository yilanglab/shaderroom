import { DockTooltipGroup } from './components/DockTooltipGroup'
import { EXTENDED_CONTROLS, extendedSettings } from './render/extendedEffects'
import { FlowBackground } from './components/FlowBackground'
import { DEFAULT_FLOW, BACKGROUND_PRESETS } from './render/flowBackground'
import { pilotSettings } from './render/shadersPilot'
import { InfoTip } from './components/InfoTip'
import { HEAT_COLORS, HEAT_PRESETS, heatSettings } from './render/heatmap'
import { PanelSelect } from './components/PanelSelect'
import { ListFilter, ArrowRightLeft, Layers, ArrowUpToLine, ArrowDownToLine } from 'lucide-react'
import { DEFAULT_INTERACTION, isNewInteractive, supportsInteraction, type InteractionSettings } from './render/interaction'
import { MousePointer2 as HoverPointer } from 'lucide-react'
import { PromptScopeSelect } from './components/PromptScopeSelect'
import { PUBLIC_BASE, publicPath } from './lib/publicPath'
import { DEFAULT_REFERENCE, isReferenceShader, type ReferenceSettings } from './render/referenceEffects'
import { ColorPicker } from './components/ColorPicker'
import { TabPane } from './components/TabPane'
import { panelThemeForColor } from './lib/panelTheme'
import { DEFAULT_SURFACE, createDissolve, isSurfaceShader, type SurfaceSettings } from './render/surfaceEffects'
import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Box, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, FileJson, Focus, Grid2X2, LoaderCircle, Maximize2, Minimize2, MousePointer2, Palette, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-react'
import ShaderStage from './render/ShaderStage'
import { MODEL_SCALE_RANGE } from './render/modelZoom'
import { buildPrompt, type PromptScope } from './lib/prompt'
import { backgroundStyle as buildBackgroundStyle } from './lib/backgroundStyle'
import { prepareModelFile } from './lib/upload'
import { BACKGROUND_COLORS, EFFECT_BACKGROUNDS, DEFAULT_LIGHTING, DEFAULT_MODELS, DEFAULT_PARAMS, DEFAULT_PARTICLE, DEFAULT_VIEW, SHADERS } from './defaults'
import type { EffectLayer, BackgroundSettings, DirectionalLightSettings, LightingSettings, LightSettings, ModelEntry, ModelStats, ParticlePlayback, ParticleSettings, ShaderId, ShaderParams, StageHandle, ViewSettings } from './types'

function ToolbarTooltip({ label, children }: { label: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const id = useId()
  return <span className="toolbar-tooltip-wrap" data-tooltip-label={label}>
    {cloneElement(children, { 'aria-describedby': id })}<span className="panel-tooltip" id={id} role="tooltip">{label}</span>
  </span>
}

type LeftTab = 'models' | 'effects'
type RightTab = 'background' | 'shader'
const COMPOSITION_EXCLUDED: ShaderId[] = ['particle-morph', 'engraving', 'hologram', 'iridescent', 'dissolve', 'magnetic-pull', 'material-reveal', 'elastic-indent']
const canCompose = (id: ShaderId) => !COMPOSITION_EXCLUDED.includes(id)

function TabButton({ active, children, onClick, id, controls }: { active: boolean; children: ReactNode; onClick: () => void; id: string; controls: string }) {
  return <button type="button" role="tab" aria-selected={active} aria-controls={controls} id={id} tabIndex={active ? 0 : -1} className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>
}
function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
    const panel = event.currentTarget.closest('aside')
    if (panel) panel.dataset.tabInput = 'keyboard'
  }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.click(); buttons[next]?.focus()
}

function SlidingTabs({ active, label, children }: { active: string; label: string; children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const positioned = useRef(false)
  const position = useCallback((snap: boolean) => {
    const tab = barRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    const pill = pillRef.current
    if (!tab || !pill || tab.offsetWidth === 0) return
    if (snap) pill.style.transition = 'none'
    pill.style.transform = `translateX(${tab.offsetLeft}px)`
    pill.style.width = `${tab.offsetWidth}px`
    if (snap) {
      void pill.offsetWidth
      pill.style.removeProperty('transition')
    }
    positioned.current = true
  }, [])
  useLayoutEffect(() => { position(!positioned.current) }, [active, position])
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const observer = new ResizeObserver(() => position(true))
    observer.observe(bar)
    bar.querySelectorAll('[role="tab"]').forEach(tab => observer.observe(tab))
    return () => observer.disconnect()
  }, [position])
  return <div ref={barRef} className="panel-tabs" role="tablist" aria-label={label} onKeyDown={tabKeys} onPointerDown={event => { const panel = event.currentTarget.closest('aside'); if (panel) panel.dataset.tabInput = 'pointer' }}>
    <span ref={pillRef} className="panel-tabs-pill" aria-hidden="true" />
    {children}
  </div>
}

function Parameter({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  const id = useId()
  const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0
  const normalize = (next: number) => Math.min(max, Math.max(min, Number(next.toFixed(digits))))
  return <div className="parameter">
    <div className="parameter-heading"><label htmlFor={id}>{label}</label><div className="numeric-field"><input aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={Number(value.toFixed(digits))} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(normalize(e.target.valueAsNumber)) }} /><span>{suffix}</span></div></div>
    <input id={id} className="range" type="range" min={min} max={max} step={step} value={value} style={{ '--range-progress': `${(value - min) / (max - min) * 100}%`, '--range-fraction': (value - min) / (max - min) } as CSSProperties} onChange={e => onChange(normalize(Number(e.target.value)))} />
  </div>
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const [interacted, setInteracted] = useState(false)
  return <label className={`toggle-row ${interacted ? 'is-init' : ''}`} data-on={checked}><span>{children}</span><input type="checkbox" role="switch" checked={checked} onChange={e => { setInteracted(true); onChange(e.target.checked) }} /><span className="toggle-track" aria-hidden="true" /></label>
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <ColorPicker label={label} value={value} onChange={onChange} />
}

function LightControls({ label, value, defaultOpen = false, onChange }: { label: string; value: LightSettings | DirectionalLightSettings; defaultOpen?: boolean; onChange: (patch: Partial<DirectionalLightSettings>) => void }) {
  return <details className="light-settings" open={defaultOpen}>
    <summary><span>{label}</span><span className="light-summary"><i style={{ backgroundColor: value.color }} />{value.enabled ? `强度 ${Number(value.intensity.toFixed(2))}` : '已关闭'}<ChevronDown size={14} /></span></summary>
    <Toggle checked={value.enabled} onChange={enabled => onChange({ enabled })}>启用{label}</Toggle>
    <fieldset disabled={!value.enabled} aria-label={`${label}参数`}>
      <ColorField label={`${label}颜色`} value={value.color} onChange={color => onChange({ color })} />
      <Parameter label={`${label}强度`} value={value.intensity} min={0} max={8} step={0.05} onChange={intensity => onChange({ intensity })} />
      {'azimuth' in value && <>
        <Parameter label={`${label}方位角`} value={value.azimuth} min={-180} max={180} step={0.1} suffix="°" onChange={azimuth => onChange({ azimuth })} />
        <Parameter label={`${label}高度角`} value={value.elevation} min={-90} max={90} step={0.1} suffix="°" onChange={elevation => onChange({ elevation })} />
      </>}
    </fieldset>
  </details>
}

function EffectPreview({ effect }: { effect: ShaderId }) {
  return <span className={`effect-preview effect-${effect}`} aria-hidden="true">{effect === 'ascii' ? <span className="ascii-preview">{' .:+\n+#@*\n =:. '}</span> : effect === 'particle-morph' ? <img src={publicPath('assets/ams-logo.svg')} alt="" /> : <span className="effect-orb" />}</span>
}

export default function App() {
  const stageRef = useRef<StageHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadUrls = useRef(new Set<string>())
  const dragDepth = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [models, setModels] = useState<ModelEntry[]>(DEFAULT_MODELS)
  const [selectedId, setSelectedId] = useState('knot')
  const [selectedShader, setShader] = useState<ShaderId>(() => (['original', 'comic-line', 'prism-trail', 'cross-stitch'] as const)[Math.floor(Math.random() * 4)])
  const shader = SHADERS.some(item => item.id === selectedShader) ? selectedShader : 'original'
  const [interactions, setInteractions] = useState<Partial<Record<ShaderId, InteractionSettings>>>({})
  const interaction = interactions[shader] ?? DEFAULT_INTERACTION
  const interactive = supportsInteraction(shader)
  function changeInteraction<K extends keyof InteractionSettings>(key: K, value: InteractionSettings[K]) {
    setInteractions(previous => ({ ...previous, [shader]: { ...(previous[shader] ?? DEFAULT_INTERACTION), [key]: value } }))
  }
  const [params, setParams] = useState<ShaderParams>(DEFAULT_PARAMS)
  const [combinationEnabled, setCombinationEnabled] = useState(false)
  const [layerOrder, setLayerOrder] = useState<ShaderId[]>([])
  const [layerSettings, setLayerSettings] = useState<Partial<Record<ShaderId, Pick<EffectLayer, 'params' | 'reference'>>>>({})
  const [reference,setReference] = useState(DEFAULT_REFERENCE)
  const changeReference = <K extends keyof ReferenceSettings>(key:K,value:ReferenceSettings[K])=>setReference(prev=>({...prev,[key]:value}))
  const [surface, setSurface] = useState(DEFAULT_SURFACE)
  const [dissolvePlayback, setDissolvePlayback] = useState(createDissolve)
  const changeSurface = <K extends keyof SurfaceSettings>(key: K, value: SurfaceSettings[K]) => setSurface(prev => ({ ...prev, [key]: value }))
  const [particle, setParticle] = useState<ParticleSettings>(DEFAULT_PARTICLE)
  const [particlePlayback, setParticlePlayback] = useState<ParticlePlayback>({ phase: 'logo', progress: 0, ready: false })
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const flowClock = useRef(0)
  const [background, setBackground] = useState<BackgroundSettings>(() => ({ ...EFFECT_BACKGROUNDS[selectedShader] }))
  const themeColor = background.flow?.enabled ? background.flow.colors[0] : background.color
  const [panelTheme, setPanelTheme] = useState(() => panelThemeForColor(themeColor))
  useLayoutEffect(() => {
    setPanelTheme(previous => panelThemeForColor(themeColor, previous))
  }, [themeColor])
  useLayoutEffect(() => {
    // The document root also themes colour-picker portals mounted under body.
    document.documentElement.dataset.panelTheme = panelTheme
    return () => { delete document.documentElement.dataset.panelTheme }
  }, [panelTheme])
  const [lighting, setLighting] = useState<LightingSettings>(DEFAULT_LIGHTING)
  const [view, setView] = useState<ViewSettings>(() => ({ ...DEFAULT_VIEW, autoRotate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches }))
  const [leftTab, setLeftTab] = useState<LeftTab>('models')
  const [effectLayout, setEffectLayout] = useState<'grid' | 'list'>('grid')
  const [effectFilter, setEffectFilter] = useState<'all' | 'animated' | 'interactive'>('all')
  const visibleEffects = SHADERS.filter(effect => effectFilter === 'all' || (effectFilter === 'interactive' ? supportsInteraction(effect.id) : ['particle-morph', 'hologram', 'iridescent', 'dissolve', 'ascii', 'glyph-matrix', 'word-mosaic', 'pixel-glyph'].includes(effect.id)))
  const [rightTab, setRightTab] = useState<RightTab>('shader')
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  useEffect(() => {
    // Briefly expose the collapsed controls, then demonstrate the existing morph.
    const timer = window.setTimeout(() => {
      setLeftOpen(window.innerWidth > 640)
      setRightOpen(window.innerWidth > 900)
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450)
    return () => window.clearTimeout(timer)
  }, [])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [stageError, setStageError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const onThumbnail = useCallback((id: string, url: string) => setThumbnails(previous => ({ ...previous, [id]: url })), [])
  const [stats, setStats] = useState<ModelStats | null>(null)
  const [promptScope, setPromptScope] = useState<PromptScope>('both')
  const [copying, setCopying] = useState(false)
  const [toast, setToast] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const model = models.find(item => item.id === selectedId) ?? DEFAULT_MODELS[0]
  const layers: EffectLayer[] | undefined = combinationEnabled ? layerOrder.map(id => ({ shader: id, params: id === shader ? params : layerSettings[id]?.params ?? DEFAULT_PARAMS, reference: id === shader ? reference : layerSettings[id]?.reference ?? DEFAULT_REFERENCE, interaction: interactions[id] ?? DEFAULT_INTERACTION })) : undefined
  const hoverIds = (layers?.map(layer=>layer.shader) ?? [shader]).filter(supportsInteraction)
  const hoverEnabled = hoverIds.some(id => (interactions[id] ?? DEFAULT_INTERACTION).enabled)
  function toggleHover() { setInteractions(previous => { const next = { ...previous }; for(const id of hoverIds) next[id]={...(previous[id] ?? DEFAULT_INTERACTION),enabled:!hoverEnabled}; return next }); }
  const currentShader = SHADERS.find(item => item.id === shader)!
  const isParticle = shader === 'particle-morph'
  const particlePlaying = particlePlayback.phase === 'to-model' || particlePlayback.phase === 'to-logo'
  const particleCanPlay = particlePlayback.ready && !particlePlaying && !loading && !stageError
  const particleAction = particlePlaying ? '动画播放中…' : particlePlayback.phase === 'model' ? '反向还原' : '播放动画'
  const particleStatus = particlePlayback.phase === 'logo' ? '标志形态' : particlePlayback.phase === 'model' ? '模型形态' : particlePlayback.phase === 'to-model' ? '标志 → 模型' : '模型 → 标志'

  const notify = useCallback((message: string) => {
    setToast(message); clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3600)
  }, [])
  function editLayer(id: ShaderId) {
    if (id === shader) return
    setLayerSettings(previous => ({ ...previous, [shader]: { params, reference } }))
    setParams(layerSettings[id]?.params ?? DEFAULT_PARAMS)
    setReference(layerSettings[id]?.reference ?? DEFAULT_REFERENCE)
    setShader(id)
    setRightTab('shader')
  }
  function toggleCombination() {
    if (combinationEnabled) { setCombinationEnabled(false); return }
    const id = canCompose(shader) ? shader : 'original'
    setLayerOrder([id])
    setLayerSettings({ [id]: { params, reference } })
    setShader(id)
    setCombinationEnabled(true)
    setRightTab('shader')
  }
  function chooseEffect(id: ShaderId) {
    if (!combinationEnabled) {
      if (id !== shader) { setShader(id); setBackground({ ...EFFECT_BACKGROUNDS[id] }) }
      setRightTab('shader'); return
    }
    if (!canCompose(id)) return
    if (layerOrder.includes(id)) {
      if (layerOrder.length === 2) {
        const remaining = layerOrder.find(value => value !== id)!
        if (shader === id) editLayer(remaining)
        setLayerOrder([remaining])
      } else setRightTab('shader')
      return
    }
    if (layerOrder.length >= 2) { notify('最多组合 2 个效果，请先取消一个已选效果'); return }
    setLayerSettings(previous => ({ ...previous, [shader]: { params, reference } }))
    setLayerOrder(previous => [...previous, id])
    setParams(layerSettings[id]?.params ?? DEFAULT_PARAMS)
    setReference(layerSettings[id]?.reference ?? DEFAULT_REFERENCE)
    setShader(id)
    setRightTab('shader')
  }
  useEffect(() => () => { for (const url of uploadUrls.current) URL.revokeObjectURL(url); clearTimeout(toastTimer.current) }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 900px)')
    const mobile = window.matchMedia('(max-width: 640px)')
    const adaptPanels = () => { if (compact.matches) setRightOpen(false); if (mobile.matches) setLeftOpen(false) }
    compact.addEventListener('change', adaptPanels); mobile.addEventListener('change', adaptPanels)
    return () => { compact.removeEventListener('change', adaptPanels); mobile.removeEventListener('change', adaptPanels) }
  }, [])
  useEffect(() => {
    const preventFileDrop = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', preventFileDrop); window.addEventListener('drop', preventFileDrop)
    return () => { window.removeEventListener('dragover', preventFileDrop); window.removeEventListener('drop', preventFileDrop) }
  }, [])
  useEffect(() => {
    const closeHelp = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setHelpOpen(false) }
    window.addEventListener('keydown', closeHelp); return () => window.removeEventListener('keydown', closeHelp)
  }, [])

  const onReady = useCallback((nextStats: ModelStats) => {
    setLoading(false); setStageError(''); setStats(nextStats)
  }, [])
  const onError = useCallback((message: string) => { setStageError(message); setLoading(false); setStats(null) }, [])
  const onLoading = useCallback(() => { setLoading(true); setStageError(''); setStats(null) }, [])
  const onScaleChange = useCallback((scale: number) => setView(prev => prev.scale === scale ? prev : { ...prev, scale }), [])
  function selectModel(id: string) {
    if (id !== selectedId) { setSelectedId(id); setView(prev => ({ ...prev, scale: DEFAULT_VIEW.scale, rotationX: 0, rotationY: 0, rotationZ: 0 })) }
  }
  function togglePanel(side: 'left' | 'right') {
    const opening = side === 'left' ? !leftOpen : !rightOpen
    if (side === 'left') { setLeftOpen(!leftOpen); if (!leftOpen && window.innerWidth <= 900) setRightOpen(false) }
    else { setRightOpen(!rightOpen); if (!rightOpen && window.innerWidth <= 900) setLeftOpen(false) }
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`.${side}-panel ${opening ? '.panel-top button' : '.panel-expand'}`)?.focus({ preventScroll: true })
    })
  }
  async function uploadFiles(files: File[]) {
    if (!files.length || uploading) return
    setUploading(true); setUploadError(''); let failed = ''; let added = 0
    for (const file of files) {
      try {
        const entry = await prepareModelFile(file)
        if (entry.url) uploadUrls.current.add(entry.url)
        setModels(prev => [...prev, entry]); selectModel(entry.id); added++
      } catch (error) { failed = error instanceof Error ? error.message : '模型读取失败，请重新选择 GLB 或 FBX 文件。' }
    }
    setUploadError(failed); setUploading(false)
    if (added) notify(`已添加 ${added} 个模型，仅保存在当前页面`)
  }
  function removeModel(entry: ModelEntry) {
    if (selectedId === entry.id) selectModel('claw')
    setModels(prev => prev.filter(item => item.id !== entry.id))
    setThumbnails(prev => { const next = { ...prev }; delete next[entry.id]; return next })
    if (entry.url) { URL.revokeObjectURL(entry.url); uploadUrls.current.delete(entry.url) }
  }
  function changeParam<K extends keyof ShaderParams>(key: K, value: ShaderParams[K]) {
    setParams(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'threshold1') next.threshold2 = Math.max(next.threshold1, next.threshold2)
      if (key === 'threshold2') next.threshold1 = Math.min(next.threshold1, next.threshold2)
      return next
    })
  }
  function changeView<K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) { setView(prev => ({ ...prev, [key]: value })) }
  function changeParticle<K extends keyof ParticleSettings>(key: K, value: ParticleSettings[K]) { setParticle(prev => ({ ...prev, [key]: value })) }
  function changeLight(key: keyof LightingSettings, patch: Partial<DirectionalLightSettings>) { setLighting(prev => ({ ...prev, [key]: { ...prev[key], ...patch } })) }
  async function exportCurrent() {
    if (!stageRef.current || copying) return
    setCopying(true)
    try {
      const content = buildPrompt({ scope: 'shader', format: 'md', model, shader, params, background, lighting, view, particle, surface, reference, interaction, layers, snapshot: { ...stageRef.current.getSnapshot(), backgroundFlowTime: flowClock.current }, stats }, promptScope)
      await navigator.clipboard.writeText(content)
      notify('已复制提示词')
    } catch (error) {
      notify(error instanceof Error ? error.message : '复制失败，请允许浏览器访问剪贴板后重试')
    } finally { setCopying(false) }
  }
  const backgroundStyle = buildBackgroundStyle(background)
  const luminance = [1, 3, 5].map((index) => parseInt(themeColor.slice(index, index + 2), 16)).reduce((a, v, i) => a + v * [0.299, 0.587, 0.114][i], 0)

  return <main className={`workspace ${luminance > 165 ? 'light-canvas' : ''}`} style={backgroundStyle}>
    {background.flow?.enabled && <><FlowBackground settings={background.flow} clock={flowClock} /><div className="flow-grid" aria-hidden="true" style={{ ...backgroundStyle, backgroundColor: 'transparent' }} /></>}
    <div className="stage-layer" aria-label="3D 模型预览区"><ShaderStage layers={layers} interaction={interaction} key={retryKey} ref={stageRef} model={model} shader={shader} params={params} lighting={lighting} view={view} particle={particle} surface={surface} reference={reference} onDissolveState={setDissolvePlayback} onParticleState={setParticlePlayback} onScaleChange={onScaleChange} onThumbnail={onThumbnail} onReady={onReady} onError={onError} onLoading={onLoading} /></div>
    <header className="workspace-header">
      <a className="brand" href={PUBLIC_BASE} aria-label="Shader Room 首页"><span className="brand-mark" aria-hidden="true" style={{ maskImage: `url("${publicPath('assets/shaderroom-knot.svg')}")` }} /><span className="brand-wordmark" aria-hidden="true" style={{ maskImage: `url("${publicPath('assets/shaderroom-wordmark.svg')}")` }} /></a>
      <div className="header-caption">3D 模型 × 材质实验</div>
      <button className="header-help" aria-label="操作说明" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}><CircleHelp size={17} /><span>使用帮助</span></button>
      {helpOpen && <div className="help-popover"><strong>在这里，试一点新效果。</strong><p>拖动模型旋转，滚轮或双指缩放。左右面板可以收起，给模型留出更多空间。</p><p>上传的 GLB / FBX 只在浏览器中处理，刷新页面后需重新选择。导出效果文档时，请把对应模型一起交给 Agent。</p><button onClick={() => setHelpOpen(false)}>知道了 <Check size={14} /></button></div>}
    </header>

    <aside className="floating-panel left-panel morph-panel" data-open={leftOpen} aria-label="模型与效果面板">
      <div className="panel-surface" aria-hidden="true" />
      <div id="model-panel-content" className="panel-body" inert={!leftOpen} aria-hidden={!leftOpen}>
        <div className="panel-top"><span className="panel-eyebrow">模型及效果资产</span><button className="icon-button" onClick={() => togglePanel('left')} aria-label="收起模型面板"><ChevronLeft size={17} /></button></div>
        <SlidingTabs active={leftTab} label="选择素材类型">
          <TabButton active={leftTab === 'models'} id="models-tab" controls="models-panel" onClick={() => setLeftTab('models')}><Box size={15} />模型</TabButton>
          <TabButton active={leftTab === 'effects'} id="effects-tab" controls="effects-panel" onClick={() => setLeftTab('effects')}><Sparkles size={15} />效果</TabButton>
        </SlidingTabs>
        <div className="tab-content-viewport">
          <TabPane active={leftTab === 'models'} side="left" className="left-scroll">
          <section id="models-panel" role="tabpanel" aria-labelledby="models-tab">
            <div className="section-heading"><h2>模型库</h2></div>
            <div className="model-grid">
              {models.map(entry => <div className={`model-card ${selectedId === entry.id ? 'selected' : ''}`} key={entry.id}>
                <button type="button" className="model-choice" aria-label={`选择${entry.name}`} aria-pressed={selectedId === entry.id} onClick={() => selectModel(entry.id)}>
                  <span className="model-thumbnail"><>{thumbnails[entry.id] ? <img src={thumbnails[entry.id]} alt="" draggable={false} /> : <LoaderCircle size={20} className="spin" aria-label="生成模型预览" />}</></span>
                  <span className="model-name" title={entry.name}>{entry.name}</span><span className="model-type">{entry.source === 'upload' ? `已上传 · ${entry.kind.toUpperCase()}` : entry.kind === 'glb' ? 'GLB' : '基础几何'}</span>
                  {selectedId === entry.id && <span className="selection-check"><Check size={10} strokeWidth={3} /></span>}
                </button>
                {entry.source === 'upload' && <button className="remove-model" aria-label={`移除${entry.name}`} onClick={() => removeModel(entry)}><X size={12} /></button>}
              </div>)}
            </div>
            <div className="upload-section"><div className="heading-with-info upload-heading">上传模型<InfoTip text="文件只在本地处理。FBX 展示静态姿态，外部贴图不加载。刷新后需重新上传。" /></div>
              <div id="upload-area">
                <button className={`upload-area ${isDragging ? 'dragging' : ''}`} disabled={uploading} onClick={() => fileInput.current?.click()} onDragEnter={e => { e.preventDefault(); dragDepth.current++; setIsDragging(true) }} onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (!dragDepth.current) setIsDragging(false) }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setIsDragging(false); void uploadFiles(Array.from(e.dataTransfer.files)) }}>
                  {uploading ? <LoaderCircle className="spin" size={23} /> : <Upload size={23} strokeWidth={1.5} />}<strong>{uploading ? '正在读取模型…' : isDragging ? '松开，添加模型' : '点击或拖拽上传'}</strong><span>GLB / FBX · 最大 50 MB</span>
                </button>

              </div>
              <input type="file" accept=".glb,.fbx" multiple ref={fileInput} className="sr-only" aria-label="上传 GLB / FBX 模型" onChange={e => { void uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              {uploadError && <div className="inline-error" role="alert">{uploadError}<button aria-label="关闭上传错误" onClick={() => setUploadError('')}><X size={14} /></button></div>}
            </div>
          </section>
          </TabPane>
          <TabPane active={leftTab === 'effects'} side="right" className="left-scroll">
          <section id="effects-panel" role="tabpanel" aria-labelledby="effects-tab">
            <div className="section-heading effect-library-heading"><h2>效果库</h2><div className="effect-library-controls">
              <ToolbarTooltip label={combinationEnabled ? '关闭效果组合' : '启用效果组合（最多 2 个）'}><button type="button" className={`prompt-scope-trigger composition-toggle ${combinationEnabled ? 'active' : ''}`} aria-label="效果组合" aria-pressed={combinationEnabled} onClick={toggleCombination}><Layers size={15} /></button></ToolbarTooltip>
              <PanelSelect value={effectFilter} onChange={setEffectFilter} label="筛选效果" icon={<ListFilter size={15} />} active={effectFilter !== 'all'} downward options={[{ value: 'all', label: '全部' }, { value: 'animated', label: '含动画' }, { value: 'interactive', label: '含交互' }]} />
              <button type="button" className="prompt-scope-trigger effect-layout-toggle" aria-label={`当前${effectLayout === 'grid' ? '宫格' : '列表'}展示，切换为${effectLayout === 'grid' ? '列表' : '宫格'}`} onClick={() => setEffectLayout(current => current === 'grid' ? 'list' : 'grid')}>{effectLayout === 'grid' ? '宫格' : '列表'}<ArrowRightLeft size={14} /></button>
            </div></div>
            {combinationEnabled && <div className="composition-caption heading-with-info">组合 {layerOrder.length}/2<InfoTip text="最多叠加 2 个画面效果，先执行置顶效果，再执行置底效果。点击箭头互换顺序；点击已选卡片取消，右侧标签切换参数。图像效果可叠加；粒子与直接材质效果仅支持单独使用。" /></div>}
            <div className={`effects-list ${effectLayout === 'list' ? 'effects-compact' : ''}`}>{visibleEffects.map(effect => {
              const selected = combinationEnabled ? layerOrder.includes(effect.id) : shader === effect.id
              const disabled = combinationEnabled && !canCompose(effect.id)
              const index = layerOrder.indexOf(effect.id)
              return <div className={`effect-card ${selected ? 'selected' : ''} ${disabled ? 'composition-unavailable' : ''}`} key={effect.id}>
                <button type="button" className="effect-choice" aria-label={effect.name} aria-pressed={selected} disabled={disabled} onClick={() => chooseEffect(effect.id)}>
                  <EffectPreview effect={effect.id} /><span className="effect-info"><span className="effect-title">{effect.name}{selected && (!combinationEnabled || layerOrder.length === 1) && <Check size={14} />}</span><span className="effect-tag">{disabled ? '暂不支持组合' : effect.tag}</span></span>
                </button>
                {selected && combinationEnabled && layerOrder.length === 2 && <ToolbarTooltip label={index === 0 ? '先执行 · 点击置底' : '后执行 · 点击置顶'}><button type="button" className="effect-order-button" aria-label={`${effect.name}${index === 0 ? '置底' : '置顶'}`} onClick={() => setLayerOrder(previous => [...previous].reverse())}>{index === 0 ? <ArrowUpToLine size={15} /> : <ArrowDownToLine size={15} />}</button></ToolbarTooltip>}
              </div>
            })}</div>
          </section>
          </TabPane>
        </div>
      </div>
      <div className="panel-trigger-wrap" inert={leftOpen} aria-hidden={leftOpen}>
        <button className="panel-expand" aria-label="展开模型面板" aria-describedby="model-panel-tooltip" aria-expanded={leftOpen} aria-controls="model-panel-content" onClick={() => togglePanel('left')}><Grid2X2 size={19} /></button>
        <span className="panel-tooltip" id="model-panel-tooltip" role="tooltip">模型及效果资产</span>
      </div>
    </aside>

    <aside className="floating-panel right-panel morph-panel" data-open={rightOpen} aria-label="参数面板">
      <div className="panel-surface" aria-hidden="true" />
      <div id="settings-panel-content" className="panel-body" inert={!rightOpen} aria-hidden={!rightOpen}>
        <div className="panel-top"><span className="panel-eyebrow">参数面板</span><button className="icon-button" onClick={() => togglePanel('right')} aria-label="收起参数面板"><ChevronRight size={17} /></button></div>
        <SlidingTabs active={rightTab} label="参数类型">
          <TabButton active={rightTab === 'background'} id="background-tab" controls="background-panel" onClick={() => setRightTab('background')}><Palette size={15} />背景</TabButton>
          <TabButton active={rightTab === 'shader'} id="shader-tab" controls="shader-panel" onClick={() => setRightTab('shader')}><SlidersHorizontal size={15} />Shader</TabButton>
        </SlidingTabs>
        <div className="tab-content-viewport">
          <TabPane active={rightTab === 'background'} side="left" className="right-scroll">
          <section id="background-panel" role="tabpanel" aria-labelledby="background-tab">
            <div className="section-heading"><h2 className="heading-with-info">背景样式<InfoTip text="选择纯色或程序背景；提示词包含完整背景算法、参数、参考网格和光照。" /></h2><span>{background.flow?.enabled ? BACKGROUND_PRESETS.find(item => item.kind === (background.flow?.kind ?? 'flow'))?.name : '纯色'}</span></div>
            <div className="color-grid" role="group" aria-label="背景样式">
              {BACKGROUND_COLORS.map(item => <button key={item.color} className={`color-swatch ${!background.flow?.enabled && background.color === item.color ? 'selected' : ''}`} aria-label={`背景设为${item.name}`} aria-pressed={!background.flow?.enabled && background.color === item.color} style={{ background: item.color }} title={item.name} onClick={() => setBackground(prev => ({ ...prev, color: item.color, flow: prev.flow ? { ...prev.flow, enabled: false } : undefined }))}>{!background.flow?.enabled && background.color === item.color && <Check size={17} color={item.color === '#222631' || item.color === '#4e70ef' ? '#fff' : '#293346'} />}</button>)}
              {BACKGROUND_PRESETS.map(item => <button key={item.kind} className={`color-swatch background-asset ${background.flow?.enabled && (background.flow.kind ?? 'flow') === item.kind ? 'selected' : ''}`} style={{ background: item.preview }} aria-label={`背景设为${item.name}`} title={item.name} aria-pressed={!!background.flow?.enabled && (background.flow.kind ?? 'flow') === item.kind} onClick={() => setBackground(prev => ({ ...prev, flow: (prev.flow?.kind ?? 'flow') === item.kind && prev.flow ? { ...prev.flow, enabled: true } : { ...item.settings, colors: [...item.settings.colors] } }))}>
                {background.flow?.enabled && (background.flow.kind ?? 'flow') === item.kind && <Check size={17} color="#fff" />}<span className="background-asset-label">{item.shortName}</span>
              </button>)}
            </div>
            <ColorPicker label="自定义颜色" value={background.color} className="custom-background-picker" onChange={color => setBackground(prev => ({ ...prev, color, flow: prev.flow ? { ...prev.flow, enabled: false } : undefined }))} />
            {background.flow?.enabled && <div className="settings-section background-parameters">
              <h3>{BACKGROUND_PRESETS.find(item => item.kind === (background.flow?.kind ?? 'flow'))?.name}参数</h3>
              {background.flow.colors.slice(0, background.flow.kind === 'noise' ? 2 : background.flow.kind && background.flow.kind !== 'flow' ? 3 : 4).map((color,i) => <ColorField key={i} label={['底色','主色','辅色','强调色'][i]} value={color} onChange={value => setBackground(prev => { const flow = { ...DEFAULT_FLOW, ...prev.flow }; const colors = [...flow.colors] as typeof flow.colors; colors[i] = value; return { ...prev, flow: { ...flow, colors } } })} />)}
              <Parameter label={background.flow.kind === 'noise' ? '演化速度' : '流动速度'} value={background.flow.speed} min={0} max={3} step={.1} onChange={speed => setBackground(prev => ({ ...prev, flow: { ...DEFAULT_FLOW, ...prev.flow, speed } }))} />
              <Parameter label={background.flow.kind === 'aurora' ? '光带起伏' : background.flow.kind === 'orbit' ? '星环起伏' : background.flow.kind === 'noise' ? '纹理对比' : '扭曲强度'} value={background.flow.distortion} min={0} max={2} step={.05} onChange={distortion => setBackground(prev => ({ ...prev, flow: { ...DEFAULT_FLOW, ...prev.flow, distortion } }))} />
              <Parameter label={background.flow.kind === 'orbit' ? '星环大小' : '纹理密度'} value={background.flow.scale ?? 1} min={.5} max={6} step={.1} onChange={scale => setBackground(prev => ({ ...prev, flow: { ...DEFAULT_FLOW, ...prev.flow, scale } }))} />
              <Parameter label="亮度" value={background.flow.intensity ?? 1} min={.2} max={2} step={.05} onChange={intensity => setBackground(prev => ({ ...prev, flow: { ...DEFAULT_FLOW, ...prev.flow, intensity } }))} />
              {background.flow.kind && background.flow.kind !== 'flow' && <Parameter label="颗粒强度" value={background.flow.grain ?? 0} min={0} max={.3} step={.005} onChange={grain => setBackground(prev => ({ ...prev, flow: { ...DEFAULT_FLOW, ...prev.flow, grain } }))} />}
              <Parameter label="图案种子" value={background.flow.seed} min={0} max={100} step={1} onChange={seed => setBackground(prev => ({ ...prev, flow: { ...DEFAULT_FLOW, ...prev.flow, seed } }))} />
            </div>}
            <div className="settings-section lighting-section">
              <div className="section-heading"><h3 className="heading-with-info">场景光照<InfoTip text="控制模型的明暗与光线方向。方位角绕模型水平旋转，高度角正值从上方照射。" /></h3><button className="icon-button" aria-label="重置光照" title="重置光照" onClick={() => { setLighting(DEFAULT_LIGHTING); notify('光照已恢复默认') }}><RotateCcw size={14} /></button></div>

              <LightControls label="环境光" value={lighting.ambient} defaultOpen onChange={patch => changeLight('ambient', patch)} />
              <LightControls label="主光" value={lighting.key} defaultOpen onChange={patch => changeLight('key', patch)} />
              <LightControls label="补光" value={lighting.fill} onChange={patch => changeLight('fill', patch)} />

            </div>
            <div className="settings-section"><h3>参考网格</h3><Toggle checked={background.grid} onChange={grid => setBackground(prev => ({ ...prev, grid }))}>显示网格</Toggle>
              {background.grid && <><Parameter label="网格间距" value={background.gridSize} min={24} max={120} suffix="px" onChange={gridSize => setBackground(prev => ({ ...prev, gridSize }))} /><Parameter label="网格透明度" value={background.gridOpacity} min={0.02} max={0.3} step={0.01} onChange={gridOpacity => setBackground(prev => ({ ...prev, gridOpacity }))} /></>}
            </div>

            <button className="text-button reset-background" onClick={() => { setBackground({ ...EFFECT_BACKGROUNDS[shader] }); notify('已恢复当前效果的默认背景') }}><RotateCcw size={14} />重置背景</button>
          </section>
          </TabPane>
          <TabPane active={rightTab === 'shader'} side="right" className="right-scroll" resetKey={shader}>
          <section id="shader-panel" role="tabpanel" aria-labelledby="shader-tab">
            {combinationEnabled && layerOrder.length === 2 && <div className="layer-edit-tabs" aria-label="选择效果参数">{layerOrder.map((id, index) => <button type="button" key={id} className={shader === id ? 'active' : ''} aria-pressed={shader === id} onClick={() => editLayer(id)}>{index + 1} · {SHADERS.find(effect => effect.id === id)?.name}</button>)}</div>}
            <div className="effect-heading"><div><h2 className="heading-with-info">{currentShader.name}{shader === 'original' && <InfoTip text="保留模型自带的材质与贴图。基础几何使用默认的灰白材质。" />}{shader === 'ascii' && <InfoTip text="8 个明暗层级，每层 3 种字符。关闭随机变动时保留当前字符分布。" />}</h2></div><button className="icon-button subtle" aria-label="重置 Shader 参数" title="重置效果参数" onClick={() => { if (interactive) setInteractions(previous => ({ ...previous, [shader]: { ...DEFAULT_INTERACTION } })); if (isParticle) { setParticle(DEFAULT_PARTICLE); stageRef.current?.resetParticle() } else if (isSurfaceShader(shader)) { setSurface(DEFAULT_SURFACE); stageRef.current?.setDissolveProgress(0) } else if(isReferenceShader(shader)) setReference(DEFAULT_REFERENCE); else setParams(DEFAULT_PARAMS); notify('Shader 参数已恢复默认') }}><RotateCcw size={15} /></button></div>
            <div className="shader-parameters">
              {EXTENDED_CONTROLS[shader as keyof typeof EXTENDED_CONTROLS]?.map(control => <Parameter key={control.key} label={control.label} value={Number(extendedSettings(params)[control.key])} min={control.min} max={control.max} step={control.step} suffix={control.unit ?? ''} onChange={value => changeParam(control.key, value)} />)}
              {['contour-lines', 'emboss'].includes(shader) && <div className="colors-pair"><ColorField label={shader === 'contour-lines' ? '线条颜色' : '暗部颜色'} value={params.shadowColor} onChange={value => changeParam('shadowColor', value)} /><ColorField label={shader === 'contour-lines' ? '底色' : '纸面颜色'} value={params.highlightColor} onChange={value => changeParam('highlightColor', value)} /></div>}
              {shader === 'watercolor' && <ColorField label="纸张颜色" value={params.highlightColor} onChange={value => changeParam('highlightColor', value)} />}
              {interactive && <div className="interaction-settings">
                <div className="section-heading"><h3 className="heading-with-info">鼠标互动<InfoTip text="移动鼠标探索效果；按住拖动时暂停互动以旋转模型，移入面板后淡出。触屏保留模型旋转。" /></h3><HoverPointer size={14} /></div>
                <Toggle checked={interaction.enabled} onChange={v => changeInteraction('enabled',v)}>开启鼠标互动</Toggle>
                <Parameter label="影响半径" value={interaction.radius} min={40} max={320} step={5} suffix="px" onChange={v=>changeInteraction('radius',v)} />
                <Parameter label="互动强度" value={interaction.strength} min={0} max={1.5} step={.05} onChange={v=>changeInteraction('strength',v)} />
                <Parameter label="跟随延迟" value={interaction.follow} min={0} max={.4} step={.01} suffix="s" onChange={v=>changeInteraction('follow',v)} />
                {['liquid-ripple','ascii','hologram','glyph-matrix','word-mosaic'].includes(shader) && <Parameter label="互动速度" value={interaction.speed} min={.2} max={3} step={.1} onChange={v=>changeInteraction('speed',v)} />}
                {isNewInteractive(shader) && <>
                  {shader==='lens-distortion' && <><Parameter label="放大倍率" value={interaction.magnification} min={1} max={2.5} step={.05} suffix="×" onChange={v=>changeInteraction('magnification',v)} /><Parameter label="边缘柔和度" value={interaction.softness} min={.1} max={1} step={.05} onChange={v=>changeInteraction('softness',v)} /></>}
                  {['lens-distortion','liquid-ripple','prism-trail'].includes(shader) && <Parameter label="色散幅度" value={interaction.dispersion} min={0} max={8} step={.25} suffix="px" onChange={v=>changeInteraction('dispersion',v)} />}
                  {['magnetic-pull','material-reveal','elastic-indent'].includes(shader) && <ColorField label="材质颜色" value={interaction.color} onChange={v=>changeInteraction('color',v)} />}
                </>}
              </div>}
              {isParticle && <>
                <div className="particle-playback">
                  <div className="particle-route"><span className="particle-logo"><img src={publicPath('assets/ams-logo.svg')} alt="AMS 标志" /></span><span className="particle-route-arrow">↔</span><span className="particle-target"><Box size={15} /><span title={model.name}>{model.name}</span></span></div>
                  <div className="particle-status"><span aria-live="polite">{particleStatus}</span><span>{particlePlaying ? `${Math.round(particlePlayback.progress * 100)}%` : particlePlayback.phase === 'logo' ? 'SVG' : '3D'}</span></div>
                  <div className="particle-progress" role="progressbar" aria-label="粒子变形进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(particlePlayback.progress * 100)}><span style={{ transform: `scaleX(${particlePlayback.progress})` }} /></div>
                  <div className="particle-actions"><button className="particle-play-button" disabled={!particleCanPlay} onClick={() => stageRef.current?.playParticle()}>{particlePlaying ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}{particleAction}</button><button className="icon-button" title="还原标志" aria-label="重置粒子动画" disabled={!particlePlayback.ready || !!stageError} onClick={() => stageRef.current?.resetParticle()}><RotateCcw size={14} /></button></div>
                </div>

                {reducedMotion && <p className="particle-note motion-note">系统已开启减少动态效果，播放将直接切换形态。</p>}
                <fieldset className="particle-parameters" disabled={particlePlaying}>
                  <Parameter label="粒子数量" value={particle.count} min={2000} max={40000} step={1000} onChange={v => changeParticle('count', v)} />
                  <Parameter label="粒子大小" value={particle.size} min={0.5} max={6} step={0.1} suffix="px" onChange={v => changeParticle('size', v)} />
                  <ColorField label="粒子颜色" value={particle.color} onChange={v => changeParticle('color', v)} /><ColorField label="粒子高光" value={particle.highlightColor} onChange={v => changeParticle('highlightColor', v)} />
                  <div className="settings-section"><h3 className="heading-with-info">变形动画<InfoTip text="旋转一周，从设定角度开始变为目标模型。再次播放，沿原路径还原标志。" /></h3><Parameter label="动画时长" value={particle.duration} min={1} max={12} step={0.1} suffix="s" onChange={v => changeParticle('duration', v)} /><Parameter label="变形起点" value={particle.morphStartAngle ?? DEFAULT_PARTICLE.morphStartAngle} min={0} max={300} step={5} suffix="°" onChange={v => changeParticle('morphStartAngle', v)} /><label className="parameter-select"><span>旋转轴</span><select aria-label="粒子动画旋转轴" value={particle.rotationAxis} onChange={e => changeParticle('rotationAxis', e.target.value as ParticleSettings['rotationAxis'])}><option value="y">Y 轴 · 左右转动</option><option value="x">X 轴 · 上下翻转</option><option value="z">Z 轴 · 平面转动</option></select></label><Parameter label="散开幅度" value={particle.scatter} min={0} max={1} step={0.05} onChange={v => changeParticle('scatter', v)} /></div>
                  <details className="pose-settings particle-idle"><summary>标志浮动 <ChevronDown size={14} /></summary><Parameter label="浮动幅度" value={particle.floatAmplitude} min={0} max={0.3} step={0.01} onChange={v => changeParticle('floatAmplitude', v)} /><Parameter label="浮动速度" value={particle.floatSpeed} min={0.1} max={2} step={0.05} onChange={v => changeParticle('floatSpeed', v)} /><Parameter label="粒子游动幅度" value={particle.driftAmplitude ?? 0.055} min={0} max={0.15} step={0.005} onChange={v => changeParticle('driftAmplitude', v)} /></details>
                  <div className="settings-section"><h3 className="heading-with-info">模型完成态<InfoTip text="到达模型形态后停止上下浮动。" /></h3><Toggle checked={particle.modelRotate} onChange={v => changeParticle('modelRotate', v)}>完成后旋转</Toggle>{particle.modelRotate && <Parameter label="模型旋转速度" value={particle.modelRotateSpeed} min={0.05} max={1.5} step={0.05} onChange={v => changeParticle('modelRotateSpeed', v)} />}</div>
                </fieldset>
              </>}
              {shader === 'cross-stitch' && <>
                <Parameter label="网格大小" value={params.gridSize} min={4} max={48} suffix="px" onChange={v => changeParam('gridSize', v)} />
                <Parameter label="针脚粗细" value={params.thickness} min={0.05} max={0.5} step={0.01} onChange={v => changeParam('thickness', v)} />
                <Parameter label="阴影阈值" value={params.threshold1} min={0} max={1} step={0.01} onChange={v => changeParam('threshold1', v)} />
                <Parameter label="高光阈值" value={params.threshold2} min={0} max={1} step={0.01} onChange={v => changeParam('threshold2', v)} />
                <div className="colors-pair"><ColorField label="针脚颜色" value={params.lightColor} onChange={v => changeParam('lightColor', v)} /><ColorField label="高光颜色" value={params.highlightColor} onChange={v => changeParam('highlightColor', v)} /></div>
              </>}
              {shader === 'engraving' && <>
                <Parameter label="刻线间距" value={surface.engravingSpacing} min={2} max={16} step={0.5} onChange={v => changeSurface('engravingSpacing', v)} />
                <Parameter label="刻线宽度" value={surface.engravingWidth} min={0.2} max={2} step={0.05} onChange={v => changeSurface('engravingWidth', v)} />
                <Parameter label="刻线角度" value={surface.engravingAngle} min={-90} max={90} step={1} onChange={v => changeSurface('engravingAngle', v)} />
                <Parameter label="明暗对比" value={surface.engravingContrast} min={0.3} max={3} step={0.05} onChange={v => changeSurface('engravingContrast', v)} />
                <Parameter label="纸张颗粒" value={surface.engravingGrain} min={0} max={0.3} step={0.01} onChange={v => changeSurface('engravingGrain', v)} />
                <ColorField label="油墨颜色" value={surface.engravingInk} onChange={v => changeSurface('engravingInk', v)} />
                <ColorField label="纸张颜色" value={surface.engravingPaper} onChange={v => changeSurface('engravingPaper', v)} />
              </>}
              {shader === 'hologram' && <>
                <Parameter label="透明度" value={surface.hologramOpacity} min={0.05} max={1} step={0.01} onChange={v => changeSurface('hologramOpacity', v)} />
                <Parameter label="扫描线密度" value={surface.hologramLines} min={5} max={80} step={1} onChange={v => changeSurface('hologramLines', v)} />
                <Parameter label="光带宽度" value={surface.hologramScanWidth} min={0.05} max={1} step={0.01} onChange={v => changeSurface('hologramScanWidth', v)} />
                <Parameter label="扫描速度" value={surface.hologramSpeed} min={0.1} max={2} step={0.05} onChange={v => changeSurface('hologramSpeed', v)} />
                <ColorField label="全息颜色" value={surface.hologramColor} onChange={v => changeSurface('hologramColor', v)} />
                <Toggle checked={surface.hologramAnimate} onChange={v => changeSurface('hologramAnimate', v)}>扫描动画</Toggle>
              </>}
              {shader === 'iridescent' && <>
                <Parameter label="粗糙度" value={surface.metalRoughness} min={0.02} max={1} step={0.01} onChange={v => changeSurface('metalRoughness', v)} />
                <Parameter label="虹彩强度" value={surface.metalIridescence} min={0} max={1} step={0.01} onChange={v => changeSurface('metalIridescence', v)} />
                <Parameter label="流动速度" value={surface.metalSpeed} min={0.05} max={2} step={0.05} onChange={v => changeSurface('metalSpeed', v)} />
                <ColorField label="虹彩颜色一" value={surface.metalColorA} onChange={v => changeSurface('metalColorA', v)} />
                <ColorField label="虹彩颜色二" value={surface.metalColorB} onChange={v => changeSurface('metalColorB', v)} />
                <ColorField label="虹彩颜色三" value={surface.metalColorC} onChange={v => changeSurface('metalColorC', v)} />
                <Toggle checked={surface.metalAnimate} onChange={v => changeSurface('metalAnimate', v)}>虹彩流动</Toggle>
              </>}
              {shader === 'dissolve' && <>
                <button className="particle-play-button" disabled={loading || !!stageError || dissolvePlayback.playing} onClick={() => stageRef.current?.playDissolve()}><Play size={14} />{dissolvePlayback.playing ? '溶解动画播放中…' : dissolvePlayback.progress >= .999 ? '还原模型' : '播放溶解'}</button>
                <Parameter label="溶解进度" value={dissolvePlayback.progress} min={0} max={1} step={.01} onChange={v => stageRef.current?.setDissolveProgress(v)} />
                <label className="toggle-row">溶解方向<select aria-label="溶解方向" value={surface.dissolveAxis} onChange={e => changeSurface('dissolveAxis', Number(e.target.value))}><option value={0}>X 轴</option><option value={1}>Y 轴</option><option value={2}>Z 轴</option></select></label>
                <Parameter label="溶解时长" value={surface.dissolveDuration} min={0.3} max={6} step={0.1} onChange={v => changeSurface('dissolveDuration', v)} />
                <Parameter label="噪声密度" value={surface.dissolveNoise} min={0.5} max={8} step={0.1} onChange={v => changeSurface('dissolveNoise', v)} />
                <Parameter label="边缘宽度" value={surface.dissolveEdgeWidth} min={0.01} max={0.2} step={0.005} onChange={v => changeSurface('dissolveEdgeWidth', v)} />
                <ColorField label="模型颜色" value={surface.dissolveColor} onChange={v => changeSurface('dissolveColor', v)} />
                <ColorField label="溶解边缘颜色" value={surface.dissolveEdgeColor} onChange={v => changeSurface('dissolveEdgeColor', v)} />
              </>}
              {shader === 'glyph-matrix' && <>
                <Parameter label="字符大小" value={reference.glyphSize} min={5} max={28} step={1} onChange={v=>changeReference('glyphSize',v)} />
                <Parameter label="笔画粗细" value={reference.glyphStroke} min={0.4} max={2} step={0.1} onChange={v=>changeReference('glyphStroke',v)} />
                <Parameter label="辉光强度" value={reference.glyphGlow} min={0} max={1} step={0.05} onChange={v=>changeReference('glyphGlow',v)} />
                <Parameter label="明暗对比" value={reference.glyphContrast} min={0.4} max={2.5} step={0.05} onChange={v=>changeReference('glyphContrast',v)} />
                <ColorField label="字符颜色" value={reference.glyphColor} onChange={v=>changeReference('glyphColor',v)} />
              </>}
              {shader === 'adaptive-grid' && <>
                <Parameter label="基础格距" value={reference.adaptiveSize} min={24} max={120} step={4} onChange={v=>changeReference('adaptiveSize',v)} />
                <Parameter label="细分层数" value={reference.adaptiveDepth} min={0} max={4} step={1} onChange={v=>changeReference('adaptiveDepth',v)} />
                <Parameter label="细分阈值" value={reference.adaptiveThreshold} min={0.04} max={0.6} step={0.01} onChange={v=>changeReference('adaptiveThreshold',v)} />
                <Parameter label="网格线宽" value={reference.adaptiveLineWidth} min={0.2} max={2} step={0.1} onChange={v=>changeReference('adaptiveLineWidth',v)} />
                <ColorField label="网格颜色" value={reference.adaptiveLineColor} onChange={v=>changeReference('adaptiveLineColor',v)} />
                <ColorField label="影像暗部" value={reference.adaptiveDarkColor} onChange={v=>changeReference('adaptiveDarkColor',v)} />
                <ColorField label="影像亮部" value={reference.adaptiveLightColor} onChange={v=>changeReference('adaptiveLightColor',v)} />
              </>}
              {shader === 'word-mosaic' && <>
                <Parameter label="文字行高" value={reference.wordHeight} min={10} max={28} step={1} onChange={v=>changeReference('wordHeight',v)} />
                <Parameter label="词块间距" value={reference.wordGap} min={0} max={6} step={0.5} onChange={v=>changeReference('wordGap',v)} />
                <Parameter label="标签底色" value={reference.wordFill} min={0} max={1} step={0.05} onChange={v=>changeReference('wordFill',v)} />
                <ColorField label="文字颜色" value={reference.wordColor} onChange={v=>changeReference('wordColor',v)} />
                <ColorField label="标签暗部" value={reference.wordDarkColor} onChange={v=>changeReference('wordDarkColor',v)} />
                <ColorField label="标签亮部" value={reference.wordLightColor} onChange={v=>changeReference('wordLightColor',v)} />
                <label className="reference-vocabulary">自定义词库<textarea aria-label="自定义词库" rows={3} maxLength={500} value={reference.wordVocabulary} onChange={e=>changeReference('wordVocabulary',e.target.value)} placeholder="用空格或换行分隔词语" /></label>
              </>}
              {shader === 'pixel-glyph' && <>
                <Parameter label="格子大小" value={reference.pixelSize} min={4} max={24} step={1} onChange={v=>changeReference('pixelSize',v)} />
                <Parameter label="格子宽高比" value={reference.pixelAspect} min={0.6} max={1.8} step={0.1} onChange={v=>changeReference('pixelAspect',v)} />
                <Parameter label="格缝宽度" value={reference.pixelGap} min={0} max={2} step={0.1} onChange={v=>changeReference('pixelGap',v)} />
                <Parameter label="灰阶数量" value={reference.pixelLevels} min={3} max={12} step={1} onChange={v=>changeReference('pixelLevels',v)} />
                <Parameter label="画面亮度" value={reference.pixelBrightness} min={0.2} max={1.2} step={0.05} onChange={v=>changeReference('pixelBrightness',v)} />
                <Parameter label="字符占比" value={reference.pixelCharacters} min={0} max={0.5} step={0.01} onChange={v=>changeReference('pixelCharacters',v)} />
                <Parameter label="扫描纹强度" value={reference.pixelScan} min={0} max={0.3} step={0.01} onChange={v=>changeReference('pixelScan',v)} />
                <ColorField label="灰阶亮部" value={reference.pixelColor} onChange={v=>changeReference('pixelColor',v)} />
              </>}
              {isReferenceShader(shader) && shader!=='adaptive-grid' && <><Toggle checked={reference.animate} onChange={v=>changeReference('animate',v)}>字符随机变动</Toggle><Parameter label="变动速度" value={reference.speed} min={.5} max={8} step={.5} onChange={v=>changeReference('speed',v)} /></>}

              {shader === 'halftone' && <><Parameter label="网格大小" value={params.gridSize} min={4} max={48} suffix="px" onChange={v => changeParam('gridSize', v)} /><Parameter label="网点大小" value={params.dotSize} min={0.1} max={0.7} step={0.01} onChange={v => changeParam('dotSize', v)} /><Parameter label="明暗对比" value={params.contrast} min={0.2} max={3} step={0.05} onChange={v => changeParam('contrast', v)} /></>}
              {shader === 'pixelate' && <><Parameter label="像素大小" value={params.gridSize} min={4} max={48} suffix="px" onChange={v => changeParam('gridSize', v)} /><Parameter label="颜色层级" value={params.levels} min={2} max={12} onChange={v => changeParam('levels', v)} /></>}
              {shader === 'ascii' && <><Parameter label="字符大小" value={params.asciiSize ?? 24} min={12} max={64} suffix="px" onChange={v => changeParam('asciiSize', v)} /><Parameter label="明暗对比" value={params.contrast} min={0.2} max={3} step={0.05} onChange={v => changeParam('contrast', v)} /><Toggle checked={params.asciiRandomize ?? false} onChange={v => changeParam('asciiRandomize', v)}>字符随机变动</Toggle>{params.asciiRandomize && <Parameter label="变动速度" value={params.asciiSpeed ?? 3} min={0.5} max={10} step={0.5} suffix="次/s" onChange={v => changeParam('asciiSpeed', v)} />}</>}
              {shader === 'comic-line' && <><Parameter label="线条宽度" value={params.comicWidth ?? 1.2} min={.5} max={3} step={.1} onChange={v => changeParam('comicWidth', v)} /><Parameter label="结构线阈值" value={params.comicDetail ?? .3} min={.05} max={.8} step={.01} onChange={v => changeParam('comicDetail', v)} /><ColorField label="墨线颜色" value={params.comicInk ?? '#292b2c'} onChange={v => changeParam('comicInk', v)} /><ColorField label="填充颜色" value={params.comicPaper ?? '#ffffff'} onChange={v => changeParam('comicPaper', v)} /><div className="settings-section"><Toggle checked={params.comicHatching ?? false} onChange={v => changeParam('comicHatching', v)}>阴影排线</Toggle>{params.comicHatching && <><Parameter label="排线组数" value={params.comicHatchGroups ?? 3} min={1} max={3} step={1} suffix="组" onChange={v => changeParam('comicHatchGroups', v)} /><Parameter label="排线方向" value={params.comicHatchAngle ?? 35} min={-90} max={90} step={1} suffix="°" onChange={v => changeParam('comicHatchAngle', v)} /></>}</div></>}
              {shader === 'fluted-glass' && <>
                <Parameter label="条纹方向" value={pilotSettings(params).fluteAngle} min={0} max={180} suffix="°" onChange={v => changeParam('fluteAngle',v)} />
                <Parameter label="条纹密度" value={pilotSettings(params).fluteFrequency} min={4} max={60} onChange={v => changeParam('fluteFrequency',v)} />
                <Parameter label="曲面柔和度" value={pilotSettings(params).fluteSoftness} min={0} max={1} step={.01} onChange={v => changeParam('fluteSoftness',v)} />
                <Parameter label="折射强度" value={pilotSettings(params).fluteRefraction} min={0} max={4} step={.05} onChange={v => changeParam('fluteRefraction',v)} />
                <Parameter label="色散强度" value={pilotSettings(params).fluteAberration} min={0} max={1} step={.01} onChange={v => changeParam('fluteAberration',v)} />
                <Parameter label="玻璃高光" value={pilotSettings(params).fluteHighlight} min={0} max={2} step={.05} onChange={v => changeParam('fluteHighlight',v)} />
              </>}
              {shader === 'dither' && <>
                <div className="section-heading"><h3>抖色图案</h3><PanelSelect label="抖色图案" value={String(pilotSettings(params).ditherPattern)} onChange={v => changeParam('ditherPattern',Number(v))} downward options={[{value:'0',label:'Bayer 2×2'},{value:'1',label:'Bayer 4×4'},{value:'2',label:'Bayer 8×8'}]} /></div>
                <Parameter label="像素大小" value={pilotSettings(params).ditherSize} min={1} max={12} suffix="px" onChange={v => changeParam('ditherSize',v)} />
                <Parameter label="明暗阈值" value={pilotSettings(params).ditherThreshold} min={0} max={1} step={.01} onChange={v => changeParam('ditherThreshold',v)} />
                <Parameter label="抖色范围" value={pilotSettings(params).ditherSpread} min={0} max={1} step={.01} onChange={v => changeParam('ditherSpread',v)} />
                <ColorField label="暗部颜色" value={params.shadowColor} onChange={v => changeParam('shadowColor',v)} /><ColorField label="亮部颜色" value={params.highlightColor} onChange={v => changeParam('highlightColor',v)} />
              </>}
              {shader === 'heatmap' && <>
                <div className="settings-section"><h3>热区分布</h3><Parameter label="冷暖偏移" value={heatSettings(params).heatOffset} min={-.5} max={.5} step={.01} onChange={v => changeParam('heatOffset', v)} /><Parameter label="热区对比" value={heatSettings(params).heatContrast} min={.3} max={3} step={.05} onChange={v => changeParam('heatContrast', v)} /><Parameter label="有机纹理" value={heatSettings(params).heatOrganic} min={0} max={1} step={.01} onChange={v => changeParam('heatOrganic', v)} /><Parameter label="纹理密度" value={heatSettings(params).heatScale} min={.5} max={8} step={.1} onChange={v => changeParam('heatScale', v)} /><Parameter label="颗粒强度" value={heatSettings(params).heatGrain} min={0} max={.3} step={.005} onChange={v => changeParam('heatGrain', v)} /></div>
                <div className="settings-section palette-settings"><h3>冷暖色带</h3>
                  <div className="heat-presets" role="group" aria-label="色带模板">{HEAT_PRESETS.map(preset => <button type="button" key={preset.name} className="heat-preset" aria-pressed={HEAT_COLORS.every((key,i) => heatSettings(params)[key].toLowerCase() === preset.colors[i])} onClick={() => setParams(previous => ({ ...previous, ...Object.fromEntries(HEAT_COLORS.map((key,i) => [key,preset.colors[i]])) }))}><span className="heat-preset-swatch" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${preset.colors.join(',')})` }} /><span>{preset.name}</span></button>)}</div>
                  <div className="heat-ramp" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${HEAT_COLORS.map(key => heatSettings(params)[key]).join(',')})` }} />{HEAT_COLORS.map((key,i) => <ColorField key={key} label={['低温颜色','偏冷颜色','中温颜色','偏暖颜色','高温颜色'][i]} value={heatSettings(params)[key]} onChange={v => changeParam(key,v)} />)}</div>
              </>}
              {shader === 'toon' && <><Parameter label="明暗色阶" value={params.levels} min={2} max={12} onChange={v => changeParam('levels', v)} /><Parameter label="明暗对比" value={params.contrast} min={0.2} max={3} step={0.05} onChange={v => changeParam('contrast', v)} /></>}
              {['halftone', 'pixelate', 'toon', 'ascii'].includes(shader) && <div className="settings-section palette-settings"><h3>色彩配置</h3><div className="colors-pair"><ColorField label="暗部颜色" value={params.shadowColor} onChange={v => changeParam('shadowColor', v)} /><ColorField label="亮部颜色" value={params.highlightColor} onChange={v => changeParam('highlightColor', v)} /></div><Parameter label="色彩饱和度" value={params.saturation} min={0} max={2} step={0.05} onChange={v => changeParam('saturation', v)} /></div>}
            </div>
            <div className="settings-section"><div className="section-heading"><h3>模型与镜头</h3><Focus size={14} /></div>
              {!isParticle && <><Toggle checked={view.autoRotate} onChange={v => changeView('autoRotate', v)}>自动旋转</Toggle>{view.autoRotate && <Parameter label="旋转速度" value={view.rotateSpeed} min={0.05} max={1.5} step={0.05} onChange={v => changeView('rotateSpeed', v)} />}</>}
              <Parameter label="模型缩放" value={view.scale} {...MODEL_SCALE_RANGE} suffix="×" onChange={scale => { stageRef.current?.syncScale(scale); onScaleChange(scale) }} />
              <details className="pose-settings"><summary>{isParticle ? '目标模型姿态' : '模型姿态'} <ChevronDown size={14} /></summary><Parameter label="X 轴旋转" value={view.rotationX} min={-180} max={180} suffix="°" onChange={v => changeView('rotationX', v)} /><Parameter label="Y 轴旋转" value={view.rotationY} min={-180} max={180} suffix="°" onChange={v => changeView('rotationY', v)} /><Parameter label="Z 轴旋转" value={view.rotationZ} min={-180} max={180} suffix="°" onChange={v => changeView('rotationZ', v)} /></details>
            </div>
          </section>
          </TabPane>
        </div>
        <div className="export-footer">
          <div className="export-summary"><FileJson size={14} /><span>提示词复制</span><PromptScopeSelect value={promptScope} onChange={setPromptScope} /></div>
          <ToolbarTooltip label="发送提示词至Agent复现当前效果"><button className="export-button" disabled={copying || (promptScope !== 'background' && (loading || !!stageError || uploading || (isParticle && (!particlePlayback.ready || particlePlaying))))} onClick={exportCurrent}><Copy size={16} />{copying ? '正在复制…' : '复制提示词'}</button></ToolbarTooltip>
        </div>
      </div>
      <div className="panel-trigger-wrap" inert={rightOpen} aria-hidden={rightOpen}>
        <button className="panel-expand" aria-label="展开参数面板" aria-describedby="settings-panel-tooltip" aria-expanded={rightOpen} aria-controls="settings-panel-content" onClick={() => togglePanel('right')}><SlidersHorizontal size={19} /></button>
        <span className="panel-tooltip" id="settings-panel-tooltip" role="tooltip">参数面板</span>
      </div>
    </aside>

    {(loading || stageError) && <div className={`stage-message ${stageError ? 'error-message' : ''}`} role={stageError ? 'alert' : 'status'}>{stageError ? <><Box size={26} /><strong>暂时无法显示模型</strong><p>{stageError}</p><button onClick={() => setRetryKey(v => v + 1)}>重新加载</button>{model.source === 'upload' && <button className="text-button" onClick={() => selectModel('claw')}>返回默认模型</button>}</> : <><LoaderCircle className="spin" size={25} /><span>正在准备 {model.name}…</span></>}</div>}
    {isParticle && !particlePlayback.ready && !loading && !stageError && <div className="stage-message" role="status"><LoaderCircle className="spin" size={25} /><span>正在生成粒子…</span></div>}
    <div className="canvas-caption" aria-live="polite"><span>{isParticle && particlePlayback.phase === 'logo' ? 'AMS 标志' : model.name}</span><span className="caption-separator">/</span><span>{layers?.map(layer=>SHADERS.find(item=>item.id===layer.shader)?.name).join(' → ') ?? currentShader.name}</span></div>
    <DockTooltipGroup><ToolbarTooltip label={!hoverIds.length ? '此效果不支持鼠标互动' : hoverEnabled ? '关闭鼠标互动' : '开启鼠标互动'}><button aria-label="鼠标互动" aria-pressed={hoverEnabled} disabled={!hoverIds.length} onClick={toggleHover}><HoverPointer size={16} /></button></ToolbarTooltip><span className="toolbar-divider" />{isParticle ? <ToolbarTooltip label={particleAction}><button className="animation-toolbar-button" aria-label="播放粒子动画" disabled={!particleCanPlay} onClick={() => stageRef.current?.playParticle()}>{particlePlaying ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}<span>{particleAction}</span></button></ToolbarTooltip> : <ToolbarTooltip label={view.autoRotate ? '暂停旋转' : '自动旋转'}><button aria-label={view.autoRotate ? '暂停自动旋转' : '开始自动旋转'} onClick={() => changeView('autoRotate', !view.autoRotate)}>{view.autoRotate ? <Pause size={16} /> : <Play size={16} />}</button></ToolbarTooltip>}<span className="toolbar-divider" /><ToolbarTooltip label="重置视角"><button aria-label="重置视角" onClick={() => { stageRef.current?.resetView(); setView(prev => ({ ...prev, scale: DEFAULT_VIEW.scale, rotationX: 0, rotationY: 0, rotationZ: 0 })); notify('视角已重置') }}><Focus size={18} /></button></ToolbarTooltip><ToolbarTooltip label="专注模式"><button aria-label="切换专注模式" aria-pressed={!leftOpen && !rightOpen} onClick={() => { if (leftOpen || rightOpen) { setLeftOpen(false); setRightOpen(false) } else { setLeftOpen(true); setRightOpen(window.innerWidth > 900) } }}>{leftOpen || rightOpen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></ToolbarTooltip></DockTooltipGroup>
    <footer className="workspace-footer"><span className="gesture-hint"><MousePointer2 size={13} />拖动旋转<span>·</span>滚轮缩放</span><span className="model-stats">{stats ? `${stats.meshes} 个网格 · ${new Intl.NumberFormat('zh-CN').format(stats.triangles)} 三角面` : 'Shader Room'}</span></footer>
    <div className="toast-region" role="status" aria-live="polite">{toast && <div className="toast"><Check size={15} />{toast}</div>}</div>
  </main>
}
