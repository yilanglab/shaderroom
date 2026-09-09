import { PUBLIC_BASE, publicPath } from './lib/publicPath'
import { DEFAULT_REFERENCE, isReferenceShader, type ReferenceSettings } from './render/referenceEffects'
import { ColorPicker } from './components/ColorPicker'
import { TabPane } from './components/TabPane'
import { DEFAULT_SURFACE, createDissolve, isSurfaceShader, type SurfaceSettings } from './render/surfaceEffects'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpRight, Box, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, FileJson, Focus, Grid2X2, LoaderCircle, Maximize2, MousePointer2, Palette, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-react'
import ShaderStage from './render/ShaderStage'
import { MODEL_SCALE_RANGE } from './render/modelZoom'
import { buildExportDocument } from './lib/export'
import { prepareModelFile } from './lib/upload'
import { BACKGROUND_COLORS, EFFECT_BACKGROUNDS, DEFAULT_LIGHTING, DEFAULT_MODELS, DEFAULT_PARAMS, DEFAULT_PARTICLE, DEFAULT_VIEW, SHADERS } from './defaults'
import type { BackgroundSettings, DirectionalLightSettings, ExportFormat, LightingSettings, LightSettings, ModelEntry, ModelStats, ParticlePlayback, ParticleSettings, ShaderId, ShaderParams, StageHandle, ViewSettings } from './types'

type LeftTab = 'models' | 'effects'
type RightTab = 'background' | 'shader'

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
    pill.style.top = `${tab.offsetTop}px`
    pill.style.height = `${tab.offsetHeight}px`
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
    <summary><span>{label}</span><span className="light-summary"><i style={{ backgroundColor: value.color }} />{value.enabled ? `强度 ${Number(value.intensity.toFixed(2))}` : '已关闭'}<ChevronDown size={13} /></span></summary>
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
  const [selectedId, setSelectedId] = useState('claw')
  const [selectedShader, setShader] = useState<ShaderId>('cross-stitch')
  const shader = SHADERS.some(item => item.id === selectedShader) ? selectedShader : 'original'
  const [params, setParams] = useState<ShaderParams>(DEFAULT_PARAMS)
  const [reference,setReference] = useState(DEFAULT_REFERENCE)
  const changeReference = <K extends keyof ReferenceSettings>(key:K,value:ReferenceSettings[K])=>setReference(prev=>({...prev,[key]:value}))
  const [surface, setSurface] = useState(DEFAULT_SURFACE)
  const [dissolvePlayback, setDissolvePlayback] = useState(createDissolve)
  const changeSurface = <K extends keyof SurfaceSettings>(key: K, value: SurfaceSettings[K]) => setSurface(prev => ({ ...prev, [key]: value }))
  const [particle, setParticle] = useState<ParticleSettings>(DEFAULT_PARTICLE)
  const [particlePlayback, setParticlePlayback] = useState<ParticlePlayback>({ phase: 'logo', progress: 0, ready: false })
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [background, setBackground] = useState<BackgroundSettings>(() => ({ ...EFFECT_BACKGROUNDS['cross-stitch'] }))
  const [lighting, setLighting] = useState<LightingSettings>(DEFAULT_LIGHTING)
  const [view, setView] = useState<ViewSettings>(() => ({ ...DEFAULT_VIEW, autoRotate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches }))
  const [leftTab, setLeftTab] = useState<LeftTab>('models')
  const [rightTab, setRightTab] = useState<RightTab>('shader')
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 640)
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 900)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [stageError, setStageError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const onThumbnail = useCallback((id: string, url: string) => setThumbnails(previous => ({ ...previous, [id]: url })), [])
  const [stats, setStats] = useState<ModelStats | null>(null)
  const [format, setFormat] = useState<ExportFormat>('json')
  const [copying, setCopying] = useState(false)
  const [toast, setToast] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const model = models.find(item => item.id === selectedId) ?? DEFAULT_MODELS[0]
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
    if (id !== selectedId) { setSelectedId(id); setView(prev => ({ ...prev, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 })) }
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
    try {
      const document = buildExportDocument({ scope: rightTab, format, model, shader, params, background, lighting, view, particle, surface, reference, snapshot: stageRef.current.getSnapshot(), stats })
      if (format === 'md') {
        setCopying(true)
        try {
          await navigator.clipboard.writeText(document.content)
          notify(`已复制${rightTab === 'background' ? '背景' : 'Shader 效果'} Markdown`)
        } catch {
          notify('复制失败，请允许浏览器访问剪贴板后重试')
        } finally { setCopying(false) }
        return
      }
      const url = URL.createObjectURL(new Blob([document.content], { type: document.mimeType }))
      const link = window.document.createElement('a'); link.href = url; link.download = document.fileName
      window.document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify(`已导出${rightTab === 'background' ? '背景' : 'Shader 效果'} JSON`)
    } catch (error) { notify(error instanceof Error ? error.message : '导出失败，请再试一次') }
  }
  const backgroundStyle = { backgroundColor: background.color, backgroundImage: background.grid ? `linear-gradient(rgba(255,255,255,${background.gridOpacity}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,${background.gridOpacity}) 1px, transparent 1px)` : 'none', backgroundSize: `${background.gridSize}px ${background.gridSize}px`, backgroundPosition: '0 0' }
  const luminance = [1, 3, 5].map((index) => parseInt(background.color.slice(index, index + 2), 16)).reduce((a, v, i) => a + v * [0.299, 0.587, 0.114][i], 0)

  return <main className={`workspace ${luminance > 165 ? 'light-canvas' : ''}`} style={backgroundStyle}>
    <div className="stage-layer" aria-label="3D 模型预览区"><ShaderStage key={retryKey} ref={stageRef} model={model} shader={shader} params={params} lighting={lighting} view={view} particle={particle} surface={surface} reference={reference} onDissolveState={setDissolvePlayback} onParticleState={setParticlePlayback} onScaleChange={onScaleChange} onThumbnail={onThumbnail} onReady={onReady} onError={onError} onLoading={onLoading} /></div>
    <header className="workspace-header">
      <a className="brand" href={PUBLIC_BASE} aria-label="Shader Room 首页"><span className="brand-mark" aria-hidden="true">✳</span><span>shader<span className="brand-room">room</span><span className="brand-dot">.</span></span></a>
      <div className="header-caption">3D 模型 × 材质实验</div>
      <button className="header-help" aria-label="操作说明" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}><CircleHelp size={17} /><span>使用帮助</span></button>
      {helpOpen && <div className="help-popover"><strong>在这里，试一点新效果。</strong><p>拖动模型旋转，滚轮或双指缩放。左右面板可以收起，给模型留出更多空间。</p><p>上传的 GLB / FBX 只在浏览器中处理，刷新页面后需重新选择。导出效果文档时，请把对应模型一起交给 Agent。</p><button onClick={() => setHelpOpen(false)}>知道了 <Check size={13} /></button></div>}
    </header>

    <aside className="floating-panel left-panel morph-panel" data-open={leftOpen} aria-label="模型与效果面板">
      <div className="panel-surface" aria-hidden="true" />
      <div id="model-panel-content" className="panel-body" inert={!leftOpen} aria-hidden={!leftOpen}>
        <div className="panel-top"><span className="panel-eyebrow">素材与效果</span><button className="icon-button" onClick={() => togglePanel('left')} aria-label="收起模型面板"><ChevronLeft size={17} /></button></div>
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
                {entry.source === 'upload' && <button className="remove-model" aria-label={`移除${entry.name}`} onClick={() => removeModel(entry)}><X size={11} /></button>}
              </div>)}
            </div>
            <div className="upload-section">
              <div id="upload-area">
                <button className={`upload-area ${isDragging ? 'dragging' : ''}`} disabled={uploading} onClick={() => fileInput.current?.click()} onDragEnter={e => { e.preventDefault(); dragDepth.current++; setIsDragging(true) }} onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (!dragDepth.current) setIsDragging(false) }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setIsDragging(false); void uploadFiles(Array.from(e.dataTransfer.files)) }}>
                  {uploading ? <LoaderCircle className="spin" size={23} /> : <Upload size={23} strokeWidth={1.5} />}<strong>{uploading ? '正在读取模型…' : isDragging ? '松开，添加模型' : '点击或拖拽上传'}</strong><span>GLB / FBX · 最大 50 MB</span>
                </button>
                <p className="upload-note">文件只在本地处理。FBX 展示静态姿态，外部贴图不加载。刷新后需重新上传。</p>
              </div>
              <input type="file" accept=".glb,.fbx" multiple ref={fileInput} className="sr-only" aria-label="上传 GLB / FBX 模型" onChange={e => { void uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              {uploadError && <div className="inline-error" role="alert">{uploadError}<button aria-label="关闭上传错误" onClick={() => setUploadError('')}><X size={13} /></button></div>}
            </div>
          </section>
          </TabPane>
          <TabPane active={leftTab === 'effects'} side="right" className="left-scroll">
          <section id="effects-panel" role="tabpanel" aria-labelledby="effects-tab">
            <div className="section-heading"><h2>效果库</h2><span>{SHADERS.length} 种效果</span></div>
            <div className="effects-list">{SHADERS.map(effect => <button className={`effect-card ${shader === effect.id ? 'selected' : ''}`} aria-pressed={shader === effect.id} key={effect.id} onClick={() => { if (effect.id !== shader) { setShader(effect.id); setBackground({ ...EFFECT_BACKGROUNDS[effect.id] }) } setRightTab('shader') }}>
              <EffectPreview effect={effect.id} /><span className="effect-info"><span className="effect-title">{effect.name}{shader === effect.id && <Check size={13} />}</span><span className="effect-tag">{effect.tag}</span></span>
            </button>)}</div>
          </section>
          </TabPane>
        </div>
      </div>
      <div className="panel-trigger-wrap" inert={leftOpen} aria-hidden={leftOpen}>
        <button className="panel-expand" aria-label="展开模型面板" aria-describedby="model-panel-tooltip" aria-expanded={leftOpen} aria-controls="model-panel-content" onClick={() => togglePanel('left')}><Grid2X2 size={19} /></button>
        <span className="panel-tooltip" id="model-panel-tooltip" role="tooltip">素材与效果</span>
      </div>
    </aside>

    <aside className="floating-panel right-panel morph-panel" data-open={rightOpen} aria-label="参数面板">
      <div className="panel-surface" aria-hidden="true" />
      <div id="settings-panel-content" className="panel-body" inert={!rightOpen} aria-hidden={!rightOpen}>
        <div className="panel-top"><span className="panel-eyebrow">调整与导出</span><button className="icon-button" onClick={() => togglePanel('right')} aria-label="收起参数面板"><ChevronRight size={17} /></button></div>
        <SlidingTabs active={rightTab} label="参数类型">
          <TabButton active={rightTab === 'background'} id="background-tab" controls="background-panel" onClick={() => setRightTab('background')}><Palette size={15} />背景</TabButton>
          <TabButton active={rightTab === 'shader'} id="shader-tab" controls="shader-panel" onClick={() => setRightTab('shader')}><SlidersHorizontal size={15} />Shader</TabButton>
        </SlidingTabs>
        <div className="tab-content-viewport">
          <TabPane active={rightTab === 'background'} side="left" className="right-scroll">
          <section id="background-panel" role="tabpanel" aria-labelledby="background-tab">
            <div className="section-heading"><h2>背景颜色</h2><span>纯色</span></div>
            <div className="color-grid">{BACKGROUND_COLORS.map(item => <button key={item.color} className={`color-swatch ${background.color === item.color ? 'selected' : ''}`} aria-label={`背景设为${item.name}`} aria-pressed={background.color === item.color} style={{ background: item.color }} title={item.name} onClick={() => setBackground(prev => ({ ...prev, color: item.color }))}>{background.color === item.color && <Check size={17} color={item.color === '#222631' || item.color === '#4e70ef' ? '#fff' : '#293346'} />}</button>)}</div>
            <ColorPicker label="自定义颜色" value={background.color} className="custom-background-picker" onChange={color=>setBackground(prev=>({...prev,color}))} />
            <div className="settings-section lighting-section">
              <div className="section-heading"><h3>场景光照</h3><button className="icon-button" aria-label="重置光照" title="重置光照" onClick={() => { setLighting(DEFAULT_LIGHTING); notify('光照已恢复默认') }}><RotateCcw size={13} /></button></div>
              <p className="lighting-note">控制模型的明暗与光线方向。</p>
              <LightControls label="环境光" value={lighting.ambient} defaultOpen onChange={patch => changeLight('ambient', patch)} />
              <LightControls label="主光" value={lighting.key} defaultOpen onChange={patch => changeLight('key', patch)} />
              <LightControls label="补光" value={lighting.fill} onChange={patch => changeLight('fill', patch)} />
              <p className="lighting-note angle-note">方位角绕模型水平旋转，高度角正值从上方照射。</p>
            </div>
            <div className="settings-section"><h3>参考网格</h3><Toggle checked={background.grid} onChange={grid => setBackground(prev => ({ ...prev, grid }))}>显示网格</Toggle>
              {background.grid && <><Parameter label="网格间距" value={background.gridSize} min={24} max={120} suffix="px" onChange={gridSize => setBackground(prev => ({ ...prev, gridSize }))} /><Parameter label="网格透明度" value={background.gridOpacity} min={0.02} max={0.3} step={0.01} onChange={gridOpacity => setBackground(prev => ({ ...prev, gridOpacity }))} /></>}
            </div>
            <div className="context-note"><Palette size={17} /><p>导出文档包含背景颜色、参考网格和当前光照，可交给 Agent 还原场景。</p></div>
            <button className="text-button reset-background" onClick={() => { setBackground({ ...EFFECT_BACKGROUNDS[shader] }); notify('已恢复当前效果的默认背景') }}><RotateCcw size={13} />重置背景</button>
          </section>
          </TabPane>
          <TabPane active={rightTab === 'shader'} side="right" className="right-scroll" resetKey={shader}>
          <section id="shader-panel" role="tabpanel" aria-labelledby="shader-tab">
            <div className="effect-heading"><div><span className="small-label">当前效果</span><h2>{currentShader.name}</h2></div><button className="icon-button subtle" aria-label="重置 Shader 参数" title="重置效果参数" onClick={() => { if (isParticle) { setParticle(DEFAULT_PARTICLE); stageRef.current?.resetParticle() } else if (isSurfaceShader(shader)) { setSurface(DEFAULT_SURFACE); stageRef.current?.setDissolveProgress(0) } else if(isReferenceShader(shader)) setReference(DEFAULT_REFERENCE); else setParams(DEFAULT_PARAMS); notify('Shader 参数已恢复默认') }}><RotateCcw size={15} /></button></div>
            <div className="shader-parameters">
              {isParticle && <>
                <div className="particle-playback">
                  <div className="particle-route"><span className="particle-logo"><img src={publicPath('assets/ams-logo.svg')} alt="AMS 标志" /></span><span className="particle-route-arrow">↔</span><span className="particle-target"><Box size={15} /><span title={model.name}>{model.name}</span></span></div>
                  <div className="particle-status"><span aria-live="polite">{particleStatus}</span><span>{particlePlaying ? `${Math.round(particlePlayback.progress * 100)}%` : particlePlayback.phase === 'logo' ? 'SVG' : '3D'}</span></div>
                  <div className="particle-progress" role="progressbar" aria-label="粒子变形进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(particlePlayback.progress * 100)}><span style={{ transform: `scaleX(${particlePlayback.progress})` }} /></div>
                  <div className="particle-actions"><button className="particle-play-button" disabled={!particleCanPlay} onClick={() => stageRef.current?.playParticle()}>{particlePlaying ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}{particleAction}</button><button className="icon-button" title="还原标志" aria-label="重置粒子动画" disabled={!particlePlayback.ready || !!stageError} onClick={() => stageRef.current?.resetParticle()}><RotateCcw size={14} /></button></div>
                </div>
                <p className="particle-note">旋转一周，从设定角度开始变为目标模型。再次播放，沿原路径还原标志。</p>
                {reducedMotion && <p className="particle-note motion-note">系统已开启减少动态效果，播放将直接切换形态。</p>}
                <fieldset className="particle-parameters" disabled={particlePlaying}>
                  <Parameter label="粒子数量" value={particle.count} min={2000} max={40000} step={1000} onChange={v => changeParticle('count', v)} />
                  <Parameter label="粒子大小" value={particle.size} min={0.5} max={6} step={0.1} suffix="px" onChange={v => changeParticle('size', v)} />
                  <ColorField label="粒子颜色" value={particle.color} onChange={v => changeParticle('color', v)} /><ColorField label="粒子高光" value={particle.highlightColor} onChange={v => changeParticle('highlightColor', v)} />
                  <div className="settings-section"><h3>变形动画</h3><Parameter label="动画时长" value={particle.duration} min={1} max={12} step={0.1} suffix="s" onChange={v => changeParticle('duration', v)} /><Parameter label="变形起点" value={particle.morphStartAngle ?? DEFAULT_PARTICLE.morphStartAngle} min={0} max={300} step={5} suffix="°" onChange={v => changeParticle('morphStartAngle', v)} /><label className="parameter-select"><span>旋转轴</span><select aria-label="粒子动画旋转轴" value={particle.rotationAxis} onChange={e => changeParticle('rotationAxis', e.target.value as ParticleSettings['rotationAxis'])}><option value="y">Y 轴 · 左右转动</option><option value="x">X 轴 · 上下翻转</option><option value="z">Z 轴 · 平面转动</option></select></label><Parameter label="散开幅度" value={particle.scatter} min={0} max={1} step={0.05} onChange={v => changeParticle('scatter', v)} /></div>
                  <details className="pose-settings particle-idle"><summary>标志浮动 <ChevronDown size={13} /></summary><Parameter label="浮动幅度" value={particle.floatAmplitude} min={0} max={0.3} step={0.01} onChange={v => changeParticle('floatAmplitude', v)} /><Parameter label="浮动速度" value={particle.floatSpeed} min={0.1} max={2} step={0.05} onChange={v => changeParticle('floatSpeed', v)} /><Parameter label="粒子游动幅度" value={particle.driftAmplitude ?? 0.055} min={0} max={0.15} step={0.005} onChange={v => changeParticle('driftAmplitude', v)} /></details>
                  <div className="settings-section"><h3>模型完成态</h3><Toggle checked={particle.modelRotate} onChange={v => changeParticle('modelRotate', v)}>完成后旋转</Toggle>{particle.modelRotate && <Parameter label="模型旋转速度" value={particle.modelRotateSpeed} min={0.05} max={1.5} step={0.05} onChange={v => changeParticle('modelRotateSpeed', v)} />}<p className="particle-note">到达模型形态后停止上下浮动。</p></div>
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
              {shader === 'original' && <p className="original-note">保留模型自带的材质与贴图。基础几何使用默认的灰白材质。</p>}
              {shader === 'halftone' && <><Parameter label="网格大小" value={params.gridSize} min={4} max={48} suffix="px" onChange={v => changeParam('gridSize', v)} /><Parameter label="网点大小" value={params.dotSize} min={0.1} max={0.7} step={0.01} onChange={v => changeParam('dotSize', v)} /><Parameter label="明暗对比" value={params.contrast} min={0.2} max={3} step={0.05} onChange={v => changeParam('contrast', v)} /></>}
              {shader === 'pixelate' && <><Parameter label="像素大小" value={params.gridSize} min={4} max={48} suffix="px" onChange={v => changeParam('gridSize', v)} /><Parameter label="颜色层级" value={params.levels} min={2} max={12} onChange={v => changeParam('levels', v)} /></>}
              {shader === 'ascii' && <><Parameter label="字符大小" value={params.asciiSize ?? 24} min={12} max={64} suffix="px" onChange={v => changeParam('asciiSize', v)} /><Parameter label="明暗对比" value={params.contrast} min={0.2} max={3} step={0.05} onChange={v => changeParam('contrast', v)} /><Toggle checked={params.asciiRandomize ?? false} onChange={v => changeParam('asciiRandomize', v)}>字符随机变动</Toggle>{params.asciiRandomize && <Parameter label="变动速度" value={params.asciiSpeed ?? 3} min={0.5} max={10} step={0.5} suffix="次/s" onChange={v => changeParam('asciiSpeed', v)} />}<p className="panel-note">8 个明暗层级，每层 3 种字符。关闭随机变动时保留当前字符分布。</p></>}
              {shader === 'toon' && <><Parameter label="明暗色阶" value={params.levels} min={2} max={12} onChange={v => changeParam('levels', v)} /><Parameter label="明暗对比" value={params.contrast} min={0.2} max={3} step={0.05} onChange={v => changeParam('contrast', v)} /></>}
              {['halftone', 'pixelate', 'toon', 'ascii'].includes(shader) && <div className="settings-section palette-settings"><h3>色彩配置</h3><div className="colors-pair"><ColorField label="暗部颜色" value={params.shadowColor} onChange={v => changeParam('shadowColor', v)} /><ColorField label="亮部颜色" value={params.highlightColor} onChange={v => changeParam('highlightColor', v)} /></div><Parameter label="色彩饱和度" value={params.saturation} min={0} max={2} step={0.05} onChange={v => changeParam('saturation', v)} /></div>}
            </div>
            <div className="settings-section"><div className="section-heading"><h3>模型与镜头</h3><Focus size={13} /></div>
              {!isParticle && <><Toggle checked={view.autoRotate} onChange={v => changeView('autoRotate', v)}>自动旋转</Toggle>{view.autoRotate && <Parameter label="旋转速度" value={view.rotateSpeed} min={0.05} max={1.5} step={0.05} onChange={v => changeView('rotateSpeed', v)} />}</>}
              <Parameter label="模型缩放" value={view.scale} {...MODEL_SCALE_RANGE} suffix="×" onChange={scale => { stageRef.current?.syncScale(scale); onScaleChange(scale) }} />
              <details className="pose-settings"><summary>{isParticle ? '目标模型姿态' : '模型姿态'} <ChevronDown size={13} /></summary><Parameter label="X 轴旋转" value={view.rotationX} min={-180} max={180} suffix="°" onChange={v => changeView('rotationX', v)} /><Parameter label="Y 轴旋转" value={view.rotationY} min={-180} max={180} suffix="°" onChange={v => changeView('rotationY', v)} /><Parameter label="Z 轴旋转" value={view.rotationZ} min={-180} max={180} suffix="°" onChange={v => changeView('rotationZ', v)} /></details>
            </div>
          </section>
          </TabPane>
        </div>
        <div className="export-footer"><div className="export-summary"><FileJson size={14} /><span>{rightTab === 'background' ? '背景与光照配置' : isParticle ? 'SVG、粒子源码与动画配置' : '源码、参数与场景配置'}</span><label className="format-select"><span className="sr-only">导出格式</span><select value={format} onChange={e => setFormat(e.target.value as ExportFormat)}><option value="json">JSON</option><option value="md">Markdown</option></select><ChevronDown size={11} /></label></div><button className="export-button" disabled={copying || (rightTab === 'shader' && (loading || !!stageError || uploading || (isParticle && (!particlePlayback.ready || particlePlaying))))} onClick={exportCurrent}>{format === 'md' ? <Copy size={16} /> : <ArrowDownToLine size={16} />}{copying ? '正在复制…' : format === 'md' ? '复制到剪贴板' : rightTab === 'background' ? '导出背景' : '导出效果'}<ArrowUpRight size={15} /></button><span className="export-hint">{isParticle && particlePlaying && rightTab === 'shader' ? '动画完成后可导出完整效果' : '把文档与模型交给 Agent，复现你的效果'}</span></div>
      </div>
      <div className="panel-trigger-wrap" inert={rightOpen} aria-hidden={rightOpen}>
        <button className="panel-expand" aria-label="展开参数面板" aria-describedby="settings-panel-tooltip" aria-expanded={rightOpen} aria-controls="settings-panel-content" onClick={() => togglePanel('right')}><SlidersHorizontal size={19} /></button>
        <span className="panel-tooltip" id="settings-panel-tooltip" role="tooltip">调整与导出</span>
      </div>
    </aside>

    {(loading || stageError) && <div className={`stage-message ${stageError ? 'error-message' : ''}`} role={stageError ? 'alert' : 'status'}>{stageError ? <><Box size={26} /><strong>暂时无法显示模型</strong><p>{stageError}</p><button onClick={() => setRetryKey(v => v + 1)}>重新加载</button>{model.source === 'upload' && <button className="text-button" onClick={() => selectModel('claw')}>返回默认模型</button>}</> : <><LoaderCircle className="spin" size={25} /><span>正在准备 {model.name}…</span></>}</div>}
    {isParticle && !particlePlayback.ready && !loading && !stageError && <div className="stage-message" role="status"><LoaderCircle className="spin" size={25} /><span>正在生成粒子…</span></div>}
    <div className="canvas-caption" aria-live="polite"><span>{isParticle && particlePlayback.phase === 'logo' ? 'AMS 标志' : model.name}</span><span className="caption-separator">/</span><span>{currentShader.name}</span></div>
    <div className="view-toolbar" aria-label="视图控制">{isParticle ? <button className="animation-toolbar-button" aria-label="播放粒子动画" disabled={!particleCanPlay} onClick={() => stageRef.current?.playParticle()}>{particlePlaying ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}<span>{particleAction}</span></button> : <button aria-label={view.autoRotate ? '暂停自动旋转' : '开始自动旋转'} title={view.autoRotate ? '暂停旋转' : '自动旋转'} onClick={() => changeView('autoRotate', !view.autoRotate)}>{view.autoRotate ? <Pause size={16} /> : <Play size={16} />}</button>}<span className="toolbar-divider" /><button aria-label="重置视角" title="重置视角" onClick={() => { stageRef.current?.resetView(); setView(prev => ({ ...prev, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 })); notify('视角已重置') }}><Focus size={18} /></button><button aria-label="切换专注模式" title="专注模式" aria-pressed={!leftOpen && !rightOpen} onClick={() => { if (leftOpen || rightOpen) { setLeftOpen(false); setRightOpen(false) } else { setLeftOpen(true); setRightOpen(window.innerWidth > 900) } }}><Maximize2 size={16} /></button></div>
    <footer className="workspace-footer"><span className="gesture-hint"><MousePointer2 size={12} />拖动旋转<span>·</span>滚轮缩放</span><span className="model-stats">{stats ? `${stats.meshes} 个网格 · ${new Intl.NumberFormat('zh-CN').format(stats.triangles)} 三角面` : 'Shader Room'}</span></footer>
    <div className="toast-region" role="status" aria-live="polite">{toast && <div className="toast"><Check size={15} />{toast}</div>}</div>
  </main>
}
