import { REFERENCE_INPUT_MATERIAL, createReferenceMaterial, getReferenceAtlasDataUrl, updateReferenceMaterial, disposeReferenceMaterial, isReferenceShader } from './referenceEffects'
import { advanceInteraction, isNewInteractive, supportsInteraction, interactionUniforms, updateInteractionUniforms, type InteractionSnapshot } from './interaction'
import { createInteractiveMaterial, updateInteractiveMaterial, usesInteractiveMesh } from './interactiveEffects'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { registerColorCapture } from './colorSampling'
import { advanceDissolve, buildSurfaceUniforms, createDissolve, createSurfaceMaterial, isSurfaceShader, playDissolve, updateSurfaceMaterial } from './surfaceEffects'
import { parseStaticFbx } from './fbx'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createBuiltinGeometry, createThumbnailRenderer } from './modelThumbnail'
import type { ModelEntry, ModelStats, SceneSnapshot, StageHandle, StageProps } from '../types'
import { SCENE_RECIPE, SHADER_FRAGMENT, SHADER_MODES, SHADER_VERTEX } from './shaders'
import { comicHatchLights } from './comicHatching'
import { HEAT_COLORS, HEAT_NUMBERS, HEAT_DEFAULTS, heatSettings } from './heatmap'
import { buildViewLightRecipe, displaySrgbVector } from './lighting'
import { attachModelZoom } from './modelZoom'
import { AMS_LOGO_SVG } from './particleLogo'
import { PARTICLE_SAMPLE_SEED, sampleLogo, sampleModel } from './particleSampling'
import { advanceParticleTimeline, buildParticleUniformValues, createParticlePoints, createParticleTimeline, particleSnapshot, playParticleTimeline, updateParticleUniforms } from './particleMorph'

type MaterialSet = THREE.Material | THREE.Material[]
type LoadedModel = { root: THREE.Object3D; materials: Map<THREE.Mesh, MaterialSet>; radius: number; stats: ModelStats }
type StageRuntime = StageHandle & { load(entry: ModelEntry): void }

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const skeletons = new Set<THREE.Skeleton>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((object as THREE.SkinnedMesh).skeleton)
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) {
    texture.dispose()
    const bitmap = texture.source?.data
    if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close()
  }
  for (const geometry of geometries) geometry.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}

function restoreMaterials(model: LoadedModel) {
  for (const [mesh, material] of model.materials) mesh.material = material
}

function setDisplayColor(color: THREE.Color, hex: string) {
  // These are output-sRGB channel values, deliberately stored without conversion.
  color.setRGB(...displaySrgbVector(hex))
}

function emptySnapshot(): SceneSnapshot {
  return {
    camera: { position: [0, 0, 12], target: [0, 0, 0], fov: 45, near: 0.1, far: 100 },
    model: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    viewport: { width: 1, height: 1, pixelRatio: 1 },
  }
}

const ShaderStage = forwardRef<StageHandle, StageProps>(function ShaderStage(props, forwardedRef) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  const runtimeRef = useRef<StageRuntime | null>(null)
  propsRef.current = props

  useImperativeHandle(forwardedRef, () => ({
    resetView: () => runtimeRef.current?.resetView(),
    syncScale: (scale) => runtimeRef.current?.syncScale(scale),
    playParticle: () => runtimeRef.current?.playParticle(),
    playDissolve: () => runtimeRef.current?.playDissolve(),
    setDissolveProgress: (v) => runtimeRef.current?.setDissolveProgress(v),
    resetParticle: () => runtimeRef.current?.resetParticle(),
    getSnapshot: () => runtimeRef.current?.getSnapshot() ?? emptySnapshot(),
  }), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let alive = true
    let frameId = 0
    let loadRevision = 0
    let loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
    let active: LoadedModel | null = null
    let width = Math.max(1, host.clientWidth)
    let height = Math.max(1, host.clientHeight)
    let fitDistance = 12
    let autoRotation = 0
    let appliedShader: StageProps['shader'] | null = null
    let referenceTime = 0
    let surfaceTime = 0
    let dissolveState = createDissolve()
    let dissolveNotice = 0
    let asciiElapsed = 0
    let previousTime = 0
    let pointerInside = false
    let pointerDown = false
    const pointerTarget = new THREE.Vector2(.5,.5)
    const interactionState: InteractionSnapshot = { pointer: [.5,.5], velocity: [0,0], amount: 0, time: 0 }
    let interactionKey = ''
    const refinedGeometries = new Map<THREE.Mesh, { original: THREE.BufferGeometry; refined: THREE.BufferGeometry }>()
    let fpsStart = 0
    let fpsFrames = 0
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let particleTimeline = createParticleTimeline(reducedMotionQuery.matches)
    particleTimeline.ready = false
    let particlePoints: ReturnType<typeof createParticlePoints> | null = null
    let particleModel: LoadedModel | null = null
    let particleCount = 0
    let particleFailedModel: LoadedModel | null = null
    let particleFailedCount = 0
    let lastParticleNotification = 0
    let lastParticleState = ''

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false })
    } catch {
      propsRef.current.onError('无法启动 WebGL。请启用浏览器硬件加速，或换用支持 WebGL 2 的浏览器。')
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      const details=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n')
      console.error('Shader Room shader compilation failed',details)
      if(import.meta.env.DEV)host.dataset.shaderError=details
      propsRef.current.onError('当前效果无法编译，请切换其他效果或重新加载。')
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height)
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;background:transparent;touch-action:none;'
    renderer.domElement.setAttribute('aria-label', '3D 模型预览，拖动旋转，滚轮缩放')
    renderer.domElement.setAttribute('data-testid', 'model-canvas')
    host.appendChild(renderer.domElement)

    const thumbnails = createThumbnailRenderer()
    for (const [id, kind] of [['knot', 'torus-knot'], ['sphere', 'sphere'], ['cube', 'rounded-cube']] as const) {
      const geometry = createBuiltinGeometry(kind)
      const material = new THREE.MeshStandardMaterial()
      propsRef.current.onThumbnail(id, thumbnails.render(new THREE.Mesh(geometry, material)))
      geometry.dispose(); material.dispose()
    }
    const scene = new THREE.Scene()
    const pose = new THREE.Group()
    scene.add(pose)
    const camera = new THREE.PerspectiveCamera(SCENE_RECIPE.camera.fov, width / height, SCENE_RECIPE.camera.near, SCENE_RECIPE.camera.far)
    camera.position.set(0, 0, fitDistance)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = SCENE_RECIPE.controls.enableDamping
    controls.dampingFactor = SCENE_RECIPE.controls.dampingFactor
    controls.enablePan = SCENE_RECIPE.controls.enablePan
    controls.rotateSpeed = SCENE_RECIPE.controls.rotateSpeed
    controls.enableZoom = SCENE_RECIPE.controls.enableZoom
    controls.touches.TWO = null
    const detachModelZoom = attachModelZoom(renderer.domElement, {
      getScale: () => propsRef.current.view.scale,
      onScaleChange: (scale) => propsRef.current.onScaleChange(scale),
      isEnabled: () => alive && loadState === 'ready',
    })
    const pointerMove = (event: PointerEvent) => {
      pointerInside = event.pointerType !== 'touch' && event.buttons === 0 && !pointerDown
      if (!pointerInside) return
      const rect=renderer.domElement.getBoundingClientRect()
      pointerTarget.set((event.clientX-rect.left)/rect.width,1-(event.clientY-rect.top)/rect.height)
    }
    const pointerLeave = () => { pointerInside=false }
    const pointerPress = () => { pointerDown=true;pointerInside=false }
    const pointerRelease = () => { pointerDown=false;pointerInside=false }
    renderer.domElement.addEventListener('pointermove',pointerMove)
    renderer.domElement.addEventListener('pointerleave',pointerLeave)
    renderer.domElement.addEventListener('pointerdown',pointerPress)
    window.addEventListener('pointerup',pointerRelease)
    window.addEventListener('pointercancel',pointerRelease)
    window.addEventListener('blur',pointerRelease)

    const lights = [new THREE.AmbientLight(), new THREE.DirectionalLight(), new THREE.DirectionalLight()] as const
    scene.add(...lights, lights[1].target, lights[2].target)
    const surfaceMaterial = createSurfaceMaterial()
    const referenceBaseMaterial = new THREE.MeshStandardMaterial({...REFERENCE_INPUT_MATERIAL,side:THREE.DoubleSide})
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide })
    const dracoLoader = new DRACOLoader().setDecoderPath(SCENE_RECIPE.loaders.draco.decoderPath).setWorkerLimit(SCENE_RECIPE.loaders.draco.workerLimit)
    const ktx2Loader = new KTX2Loader().setTranscoderPath(SCENE_RECIPE.loaders.ktx2.transcoderPath).setWorkerLimit(SCENE_RECIPE.loaders.ktx2.workerLimit).detectSupport(renderer)
    const gltfLoader = new GLTFLoader().setDRACOLoader(dracoLoader).setKTX2Loader(ktx2Loader).setMeshoptDecoder(MeshoptDecoder)
    let pendingGLBLoads = 0
    let decodersDisposed = false

    function disposeDecodersWhenIdle() {
      if (alive || pendingGLBLoads > 0 || decodersDisposed) return
      decodersDisposed = true
      dracoLoader.dispose()
      // Three's active-transcoder counter starts at init(), so only call its
      // dispose() counterpart if it was initialized by an actual KTX2 texture.
      if (ktx2Loader.transcoderPending) ktx2Loader.dispose()
      else ktx2Loader.workerPool.dispose()
    }
    const resolution = renderer.getDrawingBufferSize(new THREE.Vector2())
    const renderTarget = new THREE.WebGLRenderTarget(resolution.x, resolution.y, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    })
    renderTarget.texture.colorSpace = THREE.LinearSRGBColorSpace
    renderTarget.depthTexture = new THREE.DepthTexture(resolution.x, resolution.y)
    const comicNormal = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    const postScene = new THREE.Scene()
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...interactionUniforms(),
        comicHatching: { value: 0 }, comicHatchGroups: { value: 3 }, comicHatchAngle: { value: 35 }, comicPixelRatio: { value: 1 },
        ...Object.fromEntries(Object.keys(comicHatchLights(propsRef.current.lighting)).map(key => [key, { value: new THREE.Vector3() }])),
        ...Object.fromEntries(HEAT_COLORS.map(key => [key, { value: new THREE.Color() }])),
        ...Object.fromEntries(HEAT_NUMBERS.map(key => [key, { value: HEAT_DEFAULTS[key] }])),
        tDepth: { value: renderTarget.depthTexture }, cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
        comicWidth: { value: 1.2 }, comicDetail: { value: .3 }, comicInk: { value: new THREE.Color() }, comicPaper: { value: new THREE.Color() },
        tDiffuse: { value: renderTarget.texture }, resolution: { value: resolution }, mode: { value: 1 },
        asciiSize: { value: 24 }, asciiTick: { value: 0 }, gridSize: { value: 14 }, thickness: { value: 0.25 }, threshold1: { value: 0.64 }, threshold2: { value: 0.97 },
        lightColor: { value: new THREE.Color() }, shadowColor: { value: new THREE.Color() }, highlightColor: { value: new THREE.Color() },
        dotSize: { value: 0.46 }, contrast: { value: 1 }, levels: { value: 4 }, saturation: { value: 1 },
      },
      vertexShader: SHADER_VERTEX, fragmentShader: SHADER_FRAGMENT,
      transparent: false, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    })
    const referenceMaterial = createReferenceMaterial(renderTarget.texture)
    const interactivePost = createInteractiveMaterial(false)
    interactivePost.uniforms.tDiffuse.value=renderTarget.texture
    const interactiveMesh = createInteractiveMaterial(true)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial)
    postScene.add(quad)

    function restoreRefinement() {
      for(const [mesh, item] of refinedGeometries){mesh.geometry=item.original;item.refined.dispose()}
      refinedGeometries.clear()
    }
    function refineForInteraction() {
      if(!active || !['magnetic-pull','elastic-indent'].includes(propsRef.current.shader))return
      let budget=240000
      for(const mesh of active.materials.keys()){
        const geometry=mesh.geometry
        if((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Object.keys(geometry.morphAttributes).length)continue
        const triangles=(geometry.index?.count??geometry.attributes.position.count)/3
        const iterations=Math.min(7,Math.floor(Math.log2(Math.min(80000,budget)/Math.max(triangles,1))))
        if(iterations<1)continue
        geometry.computeBoundingBox()
        const edge=geometry.boundingBox!.getSize(new THREE.Vector3()).length()/24
        if(edge<=0)continue
        // GLB quantization/interleaving must be decoded before TessellateModifier,
        // whose implementation reads raw attribute arrays rather than getX/getY.
        const decoded=geometry.clone()
        for(const name of ['position','normal','color','uv','uv1']) {
          const attribute=geometry.getAttribute(name)
          if(!attribute)continue
          const values=new Float32Array(attribute.count*attribute.itemSize)
          for(let vertex=0;vertex<attribute.count;vertex++)for(let component=0;component<attribute.itemSize;component++)values[vertex*attribute.itemSize+component]=attribute.getComponent(vertex,component)
          decoded.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize))
        }
        const refined=new TessellateModifier(edge,iterations).modify(decoded)
        decoded.dispose()
        refinedGeometries.set(mesh,{original:geometry,refined});mesh.geometry=refined
        budget-=refined.attributes.position.count/3
      }
    }

    function updatePose() {
      const { view, shader } = propsRef.current
      if (shader === 'particle-morph') pose.rotation.set(0, 0, 0)
      else pose.rotation.set(THREE.MathUtils.degToRad(view.rotationX), THREE.MathUtils.degToRad(view.rotationY) + autoRotation, THREE.MathUtils.degToRad(view.rotationZ), 'XYZ')
      pose.scale.setScalar(view.scale)
      pose.updateMatrixWorld(true)
    }

    function notifyParticle(force = false) {
      const { phase, progress, ready } = particleTimeline
      const stateKey = `${phase}:${progress.toFixed(4)}:${ready}`
      if (stateKey === lastParticleState) return
      const now = performance.now()
      const important = !lastParticleState.startsWith(`${phase}:`) || lastParticleState.endsWith(`:${!ready}`)
      if (!force && !important && now - lastParticleNotification < 100) return
      lastParticleNotification = now
      lastParticleState = stateKey
      propsRef.current.onParticleState({ phase, progress, ready })
    }

    function disposeParticles(notify = true) {
      if (particlePoints) {
        pose.remove(particlePoints)
        particlePoints.geometry.dispose()
        particlePoints.material.dispose()
        particlePoints = null
      }
      if (active) active.root.visible = true
      particleModel = null
      particleTimeline = createParticleTimeline(reducedMotionQuery.matches)
      particleTimeline.ready = false
      if (notify) notifyParticle(true)
    }

    function ensureParticles() {
      if (propsRef.current.shader !== 'particle-morph') {
        const recoveredFromFailure = particleFailedModel !== null
        if (particlePoints || particleModel) disposeParticles()
        particleFailedModel = null
        if (recoveredFromFailure && active && loadState === 'ready') propsRef.current.onReady(active.stats)
        return
      }
      if (!active || loadState !== 'ready') return
      const count = propsRef.current.particle.count
      if (particlePoints && particleModel === active && particleCount === count) return
      if (particleFailedModel === active && particleFailedCount === count) return
      disposeParticles()
      try {
        active.root.visible = true
        pose.updateMatrixWorld(true)
        const logo = sampleLogo(AMS_LOGO_SVG, count, PARTICLE_SAMPLE_SEED)
        const target = sampleModel(active.root, count, PARTICLE_SAMPLE_SEED)
        particlePoints = createParticlePoints(logo, target.positions, target.normals, PARTICLE_SAMPLE_SEED)
        pose.add(particlePoints)
        active.root.visible = false
        particleModel = active
        particleCount = count
        particleFailedModel = null
        particleTimeline = createParticleTimeline(reducedMotionQuery.matches)
        fitCamera(true)
        notifyParticle(true)
      } catch (error) {
        particleFailedModel = active
        particleFailedCount = count
        disposeParticles()
        propsRef.current.onError(error instanceof Error ? `粒子效果初始化失败：${error.message}` : '粒子效果初始化失败，请换一个模型或切换其他效果。')
      }
    }

    function updateUniforms() {
      const { shader, params } = propsRef.current
      const uniforms = postMaterial.uniforms
      uniforms.mode.value = SHADER_MODES[shader]
      const heat = heatSettings(params)
      for (const key of HEAT_COLORS) setDisplayColor(uniforms[key].value, heat[key])
      for (const key of HEAT_NUMBERS) uniforms[key].value = heat[key]
      uniforms.cameraNear.value = camera.near; uniforms.cameraFar.value = camera.far
      uniforms.comicWidth.value = (params.comicWidth ?? 1.2) * renderer.getPixelRatio()
      uniforms.comicDetail.value = params.comicDetail ?? .3
      uniforms.comicHatching.value = params.comicHatching ? 1 : 0
      uniforms.comicHatchGroups.value = params.comicHatchGroups ?? 3
      uniforms.comicHatchAngle.value = params.comicHatchAngle ?? 35
      uniforms.comicPixelRatio.value = renderer.getPixelRatio()
      if (shader === 'comic-line' && params.comicHatching) for (const [key,value] of Object.entries(comicHatchLights(propsRef.current.lighting))) uniforms[key].value.fromArray(value)
      setDisplayColor(uniforms.comicInk.value, params.comicInk ?? '#292b2c')
      setDisplayColor(uniforms.comicPaper.value, params.comicPaper ?? '#ffffff')
      uniforms.asciiTick.value = Math.floor(asciiElapsed * (params.asciiSpeed ?? 3))
      for (const key of ['asciiSize', 'gridSize', 'thickness', 'threshold1', 'threshold2', 'dotSize', 'contrast', 'levels', 'saturation'] as const) uniforms[key].value = params[key] ?? (key === 'asciiSize' ? 24 : 0)
      setDisplayColor(uniforms.lightColor.value as THREE.Color, params.lightColor)
      setDisplayColor(uniforms.shadowColor.value as THREE.Color, params.shadowColor)
      setDisplayColor(uniforms.highlightColor.value as THREE.Color, params.highlightColor)
      if (active && appliedShader !== shader) {
        restoreRefinement()
        refineForInteraction()
        for (const [mesh, material] of active.materials) mesh.material = usesInteractiveMesh(shader) ? interactiveMesh : isNewInteractive(shader) || shader === 'original' || shader === 'particle-morph' ? material : isSurfaceShader(shader) ? surfaceMaterial : isReferenceShader(shader) ? referenceBaseMaterial : whiteMaterial
        dissolveState = createDissolve()
        propsRef.current.onDissolveState(dissolveState)
        appliedShader = shader
      }
    }

    function updateLighting() {
      const { lighting } = propsRef.current
      const recipe = buildViewLightRecipe(lighting, { position: camera.position.toArray(), target: controls.target.toArray() })
      for (let index = 0; index < lights.length; index += 1) {
        const light = lights[index]
        const settings = recipe[index]
        light.color.set(settings.color)
        light.intensity = settings.intensity
        if (light instanceof THREE.DirectionalLight && settings.type === 'DirectionalLight') {
          light.position.fromArray(settings.position)
          light.target.position.fromArray(settings.target)
        }
      }
    }

    function renderNow() {
      if (!alive) return
      updatePose()
      updateUniforms()
      updateLighting()
      ensureParticles()
      for(const material of [postMaterial,referenceMaterial,surfaceMaterial,interactivePost,interactiveMesh]) updateInteractionUniforms(material,propsRef.current.interaction,interactionState,width,height)
      if(particlePoints)updateInteractionUniforms(particlePoints.material,propsRef.current.interaction,interactionState,width,height)
      if(isNewInteractive(propsRef.current.shader)) {
        updateInteractiveMaterial(interactivePost,propsRef.current.shader,propsRef.current.interaction,propsRef.current.lighting)
        updateInteractiveMaterial(interactiveMesh,propsRef.current.shader,propsRef.current.interaction,propsRef.current.lighting)
      }
      if (particlePoints && propsRef.current.shader === 'particle-morph') {
        updateParticleUniforms(particlePoints, buildParticleUniformValues({ settings: propsRef.current.particle, view: propsRef.current.view, snapshot: particleSnapshot(particleTimeline), lighting: propsRef.current.lighting, pixelRatio: renderer.getPixelRatio(), camera: { position: camera.position.toArray(), target: controls.target.toArray() } }))
      }
      const surfaceId = propsRef.current.shader
      if (isSurfaceShader(surfaceId)) {
        updateSurfaceMaterial(surfaceMaterial, buildSurfaceUniforms(surfaceId, propsRef.current.surface, { time: surfaceTime, dissolve: dissolveState }, propsRef.current.lighting, runtime.getSnapshot()), surfaceId)
      }
      if (propsRef.current.shader === 'original' || propsRef.current.shader === 'particle-morph' || isSurfaceShader(surfaceId) || usesInteractiveMesh(surfaceId)) {
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
      } else {
        renderer.setRenderTarget(renderTarget)
        if (surfaceId === 'comic-line' || surfaceId === 'heatmap') scene.overrideMaterial = comicNormal
        renderer.render(scene, camera)
        scene.overrideMaterial = null
        renderer.setRenderTarget(null)
        if(isReferenceShader(surfaceId)) {
          updateReferenceMaterial(referenceMaterial,propsRef.current.reference,surfaceId,{time:referenceTime,viewport:{width,height,pixelRatio:renderer.getPixelRatio()}})
          quad.material=referenceMaterial
        } else quad.material=isNewInteractive(surfaceId)?interactivePost:postMaterial
        renderer.render(postScene, postCamera)
      }
    }

    function availableSize() {
      const desktop = width > SCENE_RECIPE.framing.desktopBreakpoint
      return {
        width: Math.max(160, width - (desktop ? SCENE_RECIPE.framing.desktopReservedWidth : SCENE_RECIPE.framing.mobileReservedWidth)),
        height: Math.max(180, height - (desktop ? SCENE_RECIPE.framing.desktopReservedHeight : SCENE_RECIPE.framing.mobileReservedHeight)),
      }
    }

    function fitCamera(reset: boolean) {
      if (!active) return
      const available = availableSize()
      const halfAngle = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(available.width / height, available.height / height) * SCENE_RECIPE.framing.safety)
      const nextFit = active.radius / Math.sin(halfAngle)
      const offset = camera.position.clone().sub(controls.target)
      fitDistance = nextFit
      controls.minDistance = fitDistance
      controls.maxDistance = fitDistance
      camera.far = Math.max(SCENE_RECIPE.camera.far, fitDistance * 5)
      camera.updateProjectionMatrix()
      if (reset) {
        // Clear any pending damping so an earlier drag cannot move the reset view.
        controls.enableDamping = false
        controls.update()
        controls.target.set(0, 0, 0)
        camera.position.set(0, 0, fitDistance)
        controls.enableDamping = true
      } else {
        camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(fitDistance))
      }
      controls.update()
      controls.saveState()
    }

    function acceptModel(root: THREE.Object3D, animations: number, revision: number) {
      if (!alive || revision !== loadRevision) {
        disposeObject(root)
        return
      }
      root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const largest = Math.max(size.x, size.y, size.z)
      const materials = new Map<THREE.Mesh, MaterialSet>()
      const stats: ModelStats = { meshes: 0, triangles: 0, animations }
      root.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        materials.set(mesh, mesh.material)
        stats.meshes += 1
        stats.triangles += Math.floor((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3)
      })
      if (!Number.isFinite(largest) || largest <= 0 || stats.meshes === 0) {
        disposeObject(root)
        failLoad('这个文件没有可显示的 3D 网格，请选择其他模型文件。', revision)
        return
      }
      const normalizationScale = SCENE_RECIPE.normalization.normalizedLargestDimension / largest
      const normalized = new THREE.Group()
      normalized.scale.setScalar(normalizationScale)
      normalized.position.copy(center).multiplyScalar(-normalizationScale)
      normalized.add(root)
      if (active) {
        disposeParticles(false)
        restoreRefinement()
        restoreMaterials(active)
        pose.remove(active.root)
        disposeObject(active.root)
      }
      propsRef.current.onThumbnail(propsRef.current.model.id, thumbnails.render(normalized))
      active = { root: normalized, materials, radius: size.length() * normalizationScale / 2, stats }
      pose.add(normalized)
      autoRotation = 0
      appliedShader = null
      fitCamera(true)
      loadState = 'ready'
      renderNow()
      host!.dataset.modelReady = 'true'
      if (particleFailedModel !== active || propsRef.current.shader !== 'particle-morph') propsRef.current.onReady(stats)
    }

    function failLoad(message: string, revision: number) {
      if (!alive || revision !== loadRevision) return
      loadState = 'error'
      propsRef.current.onError(message)
    }

    const runtime: StageRuntime = {
      load(entry) {
        pointerInside=false;interactionState.amount=0;interactionState.velocity=[0,0]
        disposeParticles()
        particleFailedModel = null
        if (active && propsRef.current.shader === 'particle-morph') active.root.visible = false
        detachModelZoom.syncScale(propsRef.current.view.scale)
        const revision = ++loadRevision
        host.dataset.modelReady = 'false'
        if (loadState !== 'loading') {
          loadState = 'loading'
          propsRef.current.onLoading()
        }
        try {
          if (entry.kind === 'fbx') {
            if (!entry.url) { failLoad('缺少 FBX 文件地址，请重新上传。', revision); return }
            void fetch(entry.url).then(response => {
              if (!response.ok) throw new Error('FBX 文件读取失败')
              return response.arrayBuffer()
            }).then(buffer => {
              if (!alive || revision !== loadRevision) return
              const root = parseStaticFbx(buffer)
              try { acceptModel(root, root.animations.length, revision) }
              catch (error) { disposeObject(root); throw error }
            }).catch(() => failLoad('FBX 加载失败。请确认文件完整，使用 FBX 7.0 或更新版本导出网格模型。', revision))
          } else if (entry.kind === 'glb') {
            if (!entry.url) { failLoad('缺少模型文件地址，请重新选择 GLB。', revision); return }
            pendingGLBLoads += 1
            let finished = false
            const finishLoad = () => {
              if (finished) return
              finished = true
              pendingGLBLoads -= 1
              disposeDecodersWhenIdle()
            }
            try {
              gltfLoader.load(entry.url,
                (gltf) => {
                  try { acceptModel(gltf.scene, gltf.animations.length, revision) }
                  catch (error) {
                    disposeObject(gltf.scene)
                    failLoad(error instanceof Error ? `模型读取失败：${error.message}` : '模型读取失败，请选择其他 GLB。', revision)
                  } finally { finishLoad() }
                },
                undefined,
                () => {
                  try { failLoad('模型加载失败。请确认 GLB 文件完整、纹理已嵌入；Draco、Meshopt 和 KTX2 压缩均由本地解码器支持。', revision) }
                  finally { finishLoad() }
                },
              )
            } catch (error) {
              finishLoad()
              throw error
            }
          } else {
            const geometry = createBuiltinGeometry(entry.kind)
            const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide })
            acceptModel(new THREE.Mesh(geometry, material), 0, revision)
          }
        } catch (error) {
          failLoad(error instanceof Error ? error.message : '模型加载失败，请重试。', revision)
        }
      },
      resetView() {
        detachModelZoom.syncScale(1)
        autoRotation = 0
        fitCamera(true)
        renderNow()
      },
      syncScale: (scale) => detachModelZoom.syncScale(scale),
      playParticle() {
        if (propsRef.current.shader !== 'particle-morph' || !particlePoints) return
        particleTimeline = playParticleTimeline(particleTimeline, propsRef.current.particle)
        renderNow()
        notifyParticle(true)
      },
      resetParticle() {
        if (propsRef.current.shader !== 'particle-morph' || !particlePoints) return
        particleTimeline = createParticleTimeline(reducedMotionQuery.matches)
        fitCamera(true)
        renderNow()
        notifyParticle(true)
      },
      playDissolve() {
        if (propsRef.current.shader !== 'dissolve' || !active) return
        dissolveState = playDissolve(dissolveState, propsRef.current.surface.dissolveDuration, reducedMotionQuery.matches)
        propsRef.current.onDissolveState(dissolveState)
      },
      setDissolveProgress(value) {
        dissolveState = createDissolve(THREE.MathUtils.clamp(value, 0, 1))
        propsRef.current.onDissolveState(dissolveState)
        renderNow()
      },
      getSnapshot() {
        updatePose()
        if(isReferenceShader(propsRef.current.shader)) updateReferenceMaterial(referenceMaterial,propsRef.current.reference,propsRef.current.shader,{time:referenceTime,viewport:{width,height,pixelRatio:renderer.getPixelRatio()}})
        return {
          interaction: { ...interactionState, pointer: [...interactionState.pointer], velocity: [...interactionState.velocity] },
          reducedMotion: reducedMotionQuery.matches,
          camera: { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov, near: camera.near, far: camera.far },
          model: { position: pose.position.toArray(), rotation: [pose.rotation.x, pose.rotation.y, pose.rotation.z], scale: pose.scale.toArray() },
          viewport: { width, height, pixelRatio: renderer.getPixelRatio() },
          ...(isReferenceShader(propsRef.current.shader)?{reference:{time:referenceTime,...(propsRef.current.shader==='word-mosaic'?{atlasDataUrl:getReferenceAtlasDataUrl(referenceMaterial)}:{})}}:{}),
          ...(isSurfaceShader(propsRef.current.shader) ? { surface: { time: surfaceTime, dissolve: { ...dissolveState } } } : {}),
          ...(propsRef.current.shader === 'ascii' ? { ascii: { elapsed: asciiElapsed, tick: Math.floor(asciiElapsed * (propsRef.current.params.asciiSpeed ?? 3)), randomize: !!propsRef.current.params.asciiRandomize && !reducedMotionQuery.matches } } : {}),
          ...(propsRef.current.shader === 'particle-morph' ? { particle: particleSnapshot(particleTimeline) } : {}),
        }
      },
    }
    runtimeRef.current = runtime

    const resize = () => {
      if (!alive) return
      width = Math.max(1, host.clientWidth)
      height = Math.max(1, host.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height)
      renderer.getDrawingBufferSize(resolution)
      renderTarget.setSize(resolution.x, resolution.y)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      fitCamera(false)
      renderNow()
    }
    const unregisterCapture = registerColorCapture(() => {
      renderNow()
      const copy=document.createElement('canvas')
      copy.width=renderer.domElement.width;copy.height=renderer.domElement.height
      const context=copy.getContext('2d')
      if(!context) throw new Error('无法创建取色画布')
      context.drawImage(renderer.domElement,0,0)
      return {canvas:copy,rect:renderer.domElement.getBoundingClientRect()}
    })
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    window.addEventListener('resize', resize)

    const contextLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(frameId)
      propsRef.current.onError('WebGL 上下文已中断。请刷新页面以恢复模型预览。')
    }
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    const reducedMotionChanged = () => {
      particleTimeline = advanceParticleTimeline(particleTimeline, 0, propsRef.current.particle, reducedMotionQuery.matches)
      renderNow()
      notifyParticle(true)
    }
    reducedMotionQuery.addEventListener('change', reducedMotionChanged)

    function animate(time: number) {
      if (!alive) return
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0
      previousTime = time
      const { shader, surface } = propsRef.current
      const key=propsRef.current.model.id+':'+shader
      if(interactionKey!==key){interactionKey=key;interactionState.amount=0;interactionState.velocity=[0,0];pointerInside=false;interactionState.time=0}
      const interaction=propsRef.current.interaction
      const eligible=pointerInside&&!pointerDown&&interaction.enabled&&supportsInteraction(shader)&&loadState==='ready'
      const reduced=reducedMotionQuery.matches
      advanceInteraction(interactionState,[pointerTarget.x,pointerTarget.y],delta,interaction.follow,eligible,reduced)
      if(isReferenceShader(shader) && propsRef.current.reference.animate && !reducedMotionQuery.matches) referenceTime+=delta
      if (!reducedMotionQuery.matches && ((shader === 'hologram' && surface.hologramAnimate) || (shader === 'iridescent' && surface.metalAnimate))) surfaceTime += delta
      if (shader === 'dissolve' && dissolveState.playing) {
        dissolveState = advanceDissolve(dissolveState, delta, reducedMotionQuery.matches)
        if (!dissolveState.playing || time - dissolveNotice > 100) {
          dissolveNotice = time
          propsRef.current.onDissolveState(dissolveState)
        }
      }
      if (propsRef.current.shader === 'ascii' && propsRef.current.params.asciiRandomize && !reducedMotionQuery.matches) asciiElapsed += delta
      if (active && propsRef.current.shader !== 'particle-morph' && propsRef.current.view.autoRotate) autoRotation += propsRef.current.view.rotateSpeed * delta
      if (particlePoints && propsRef.current.shader === 'particle-morph') {
        particleTimeline = advanceParticleTimeline(particleTimeline, delta, propsRef.current.particle, reducedMotionQuery.matches)
        notifyParticle()
      }
      controls.update()
      renderNow()
      fpsFrames += 1
      if (time - fpsStart >= 750) {
        host!.dataset.fps = String(Math.round(fpsFrames * 1000 / Math.max(1, time - fpsStart)))
        fpsStart = time
        fpsFrames = 0
      }
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)

    return () => {
      alive = false
      loadRevision += 1
      runtimeRef.current = null
      cancelAnimationFrame(frameId)
      unregisterCapture()
      renderer.domElement.removeEventListener('pointermove',pointerMove)
      renderer.domElement.removeEventListener('pointerleave',pointerLeave)
      renderer.domElement.removeEventListener('pointerdown',pointerPress)
      window.removeEventListener('pointerup',pointerRelease)
      window.removeEventListener('pointercancel',pointerRelease)
      window.removeEventListener('blur',pointerRelease)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      reducedMotionQuery.removeEventListener('change', reducedMotionChanged)
      detachModelZoom()
      controls.dispose()
      disposeDecodersWhenIdle()
      disposeParticles(false)
      restoreRefinement()
      if (active) { restoreMaterials(active); disposeObject(active.root) }
      referenceBaseMaterial.dispose()
      disposeReferenceMaterial(referenceMaterial)
      surfaceMaterial.dispose()
      whiteMaterial.dispose()
      quad.geometry.dispose()
      postMaterial.dispose()
      comicNormal.dispose()
      interactivePost.dispose();interactiveMesh.dispose()
      renderTarget.dispose()
      thumbnails.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    runtimeRef.current?.load(props.model)
  }, [props.model.id, props.model.kind, props.model.url])

  return <div className="shader-stage" ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
})

export default ShaderStage
