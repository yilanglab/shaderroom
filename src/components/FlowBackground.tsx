import { registerBackgroundCapture } from '../render/colorSampling'
import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { FlowSettings } from '../types'
import { FLOW_FRAGMENT, FLOW_VERTEX, backgroundUniformSettings } from '../render/flowBackground'

export function FlowBackground({ settings, clock }: { settings: FlowSettings; clock: MutableRefObject<number> }) {
  const host = useRef<HTMLDivElement>(null)
  const current = useRef(settings); current.current = settings
  useEffect(() => {
    const node = host.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false }) } catch { return }
    renderer.setPixelRatio(1)
    node.append(renderer.domElement)
    const uniforms = { mode: { value: 0 }, scale: { value: 1 }, intensity: { value: 1 }, grain: { value: 0 }, colorA: { value: new THREE.Color() }, colorB: { value: new THREE.Color() }, colorC: { value: new THREE.Color() }, colorD: { value: new THREE.Color() }, time: { value: 0 }, speed: { value: 1 }, distortion: { value: .5 }, seed: { value: 0 }, aspect: { value: 1 } }
    const material = new THREE.ShaderMaterial({ vertexShader: FLOW_VERTEX, fragmentShader: FLOW_FRAGMENT, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false })
    const geometry = new THREE.PlaneGeometry(2,2), scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geometry,material))
    const camera = new THREE.Camera(), reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const resize = () => { const { width, height } = node.getBoundingClientRect(); renderer.setSize(width,height,false); uniforms.aspect.value = width/Math.max(height,1) }
    const observer = new ResizeObserver(resize); observer.observe(node); resize()
    let frame = 0, previous = 0; clock.current = 0
    const render = (now: number) => {
      const delta = previous ? Math.min((now-previous)/1000,.05) : 0; previous=now
      const s=current.current
      if(!document.hidden && !reduced.matches && s.speed !== 0) clock.current += delta*s.speed
      if (reduced.matches) clock.current = 0
      uniforms.time.value = clock.current
      for(const [key,value] of Object.entries(backgroundUniformSettings(s))) uniforms[key as 'mode' | 'scale' | 'intensity' | 'grain'].value = value
      uniforms.speed.value=1; uniforms.distortion.value=s.distortion; uniforms.seed.value=s.seed
      for(const [i,key] of (['colorA','colorB','colorC','colorD'] as const).entries()) { const color=s.colors[i]; uniforms[key].value.setRGB(parseInt(color.slice(1,3),16)/255,parseInt(color.slice(3,5),16)/255,parseInt(color.slice(5,7),16)/255) }
      if(!document.hidden) renderer.render(scene,camera)
      frame=requestAnimationFrame(render)
    }
    const unregister = registerBackgroundCapture(() => { renderer.render(scene,camera); return renderer.domElement })
    frame=requestAnimationFrame(render)
    return () => { unregister(); cancelAnimationFrame(frame); observer.disconnect(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove() }
  }, [clock])
  return <div ref={host} className="flow-background" aria-hidden="true" />
}
