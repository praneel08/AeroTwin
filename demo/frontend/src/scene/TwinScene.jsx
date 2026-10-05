import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { MODS, wearAt } from '../lib'

const SEGMENTS = [['Fan', 0.7, -0.5, 0.52], ['Compressor', -0.5, -2.0, 0.47], ['Combustor', -2.0, -3.3, 0.45], ['Turbine', -3.3, -4.8, 0.43]]
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'
const PAL = {
  light: { body: '#56637a', fin: '#2a3446', glass: '#a9c8ff', disc: '#eceff4', rim: '#d4dae4', edge: '#aab6ca', neutral: '#cbd2dd' },
  dark: { body: '#8493ab', fin: '#4a566e', glass: '#7aa0e0', disc: '#171d27', rim: '#283242', edge: '#b3bfd3', neutral: '#3a4556' },
}

// ---- geometry, built once -----------------------------------------------------------------------------------------
let GEO = null
function geo() {
  if (GEO) return GEO
  const prof = [[0.001, 7.4], [0.07, 7.1], [0.2, 6.5], [0.36, 5.5], [0.52, 4.3], [0.66, 3.0], [0.75, 1.6], [0.78, 0.2], [0.76, -1.6], [0.7, -3.4], [0.58, -4.8], [0.46, -5.4], [0.001, -5.5]]
  const ext = (build, depth) => { const s = new THREE.Shape(); build(s); return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2 }) }
  const wing = (k) => (s) => { s.moveTo(2.4, 0.3 * k); s.lineTo(-0.9, 5.9 * k); s.lineTo(-2.1, 5.9 * k); s.lineTo(-3.7, 0.3 * k); s.closePath() }
  const tailp = (k) => (s) => { s.moveTo(-3.4, 0.4 * k); s.lineTo(-5.1, 2.7 * k); s.lineTo(-5.9, 2.7 * k); s.lineTo(-5.5, 0.4 * k); s.closePath() }
  const fin = (s) => { s.moveTo(-3.1, 0); s.lineTo(-4.9, 2.7); s.lineTo(-5.8, 2.7); s.lineTo(-5.5, 0); s.closePath() }
  GEO = {
    fuselage: new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64),
    wings: [ext(wing(1), 0.12), ext(wing(-1), 0.12)], tails: [ext(tailp(1), 0.09), ext(tailp(-1), 0.09)], fin: ext(fin, 0.08),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 40), sphere: new THREE.SphereGeometry(1, 32, 20), torus: new THREE.TorusGeometry(1, 0.06, 12, 48),
  }
  GEO.edges = new Map([[GEO.fuselage, new THREE.EdgesGeometry(GEO.fuselage, 40)], ...[...GEO.wings, ...GEO.tails, GEO.fin].map((g) => [g, new THREE.EdgesGeometry(g, 30)])])
  return GEO
}

function Airframe({ pal, xray, open }) {
  const g = geo()
  const body = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.25 }), [])
  const fin = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.4, transparent: true }), [])
  const edge = useMemo(() => new THREE.LineBasicMaterial({ transparent: true }), [])
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, dt), o = xray ? 0.12 : open ? 0.26 : 1
    for (const m of [body, fin]) { m.opacity += (o - m.opacity) * k; const t = m.opacity < 0.99; if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true } m.depthWrite = !t || m.opacity > 0.6 }
    body.color.set(pal.body); fin.color.set(pal.fin); glass.color.set(pal.glass); glass.opacity += ((xray ? 0.15 : 0.7) - glass.opacity) * k
    edge.color.set(pal.edge); edge.opacity += ((xray ? 0.55 : 0.2) - edge.opacity) * k
  })
  const rot = [Math.PI / 2, 0, 0]
  const part = (geometry, material, props, key) => (
    <group key={key} {...props}>
      <mesh geometry={geometry} material={material} castShadow />
      <lineSegments geometry={g.edges.get(geometry)} material={edge} />
    </group>
  )
  return (
    <group>
      <group rotation={[0, 0, -Math.PI / 2]} scale={[0.84, 1, 1.16]}>
        <mesh geometry={g.fuselage} material={body} castShadow />
        <lineSegments geometry={g.edges.get(g.fuselage)} material={edge} />
      </group>
      {g.wings.map((w, i) => part(w, body, { rotation: rot, position: [0, 0.02, 0] }, `w${i}`))}
      {g.tails.map((w, i) => part(w, body, { rotation: rot, position: [0, 0.02, 0] }, `t${i}`))}
      {part(g.fin, fin, { position: [0, 0.5, 0.95], rotation: [0.2, 0, 0] }, 'f1')}
      {part(g.fin, fin, { position: [0, 0.5, -1.03], rotation: [-0.2, 0, 0] }, 'f2')}
      <mesh geometry={g.sphere} material={glass} position={[3.4, 0.62, 0]} scale={[1.9, 0.5, 0.55]} />
      <mesh geometry={g.cyl} material={fin} position={[7.7, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.04, 1.0, 0.04]} />
    </group>
  )
}

function Engine({ side, info, wear, selected, hovered, explode, layers, pal, C, onSelect, onHover }) {
  const g = geo()
  const z = side === 0 ? 0.82 : -0.82
  const parts = useRef([]), glowMat = useRef()
  const health = info?.health ?? 'healthy'
  const exhaust = { healthy: C.good, watch: C.warn, critical: C.crit, maintenance: C.idle, failed: C.crit }[health]
  useFrame((_, dt) => {
    parts.current.forEach((m, i) => { if (m) m.position.x = m.userData.x - i * 0.75 * explode.current[side] })
    if (glowMat.current) glowMat.current.emissiveIntensity = 0.7 + (health === 'critical' ? 0.5 * Math.sin(performance.now() / 260) : 0)
  })
  return (
    <group position={[0, -0.22, z]}
      onClick={(e) => { e.stopPropagation(); onSelect(side) }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(side); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}>
      {SEGMENTS.map(([name, x0, x1, r], i) => {
        const xc = (x0 + x1) / 2, w = wear?.[name] ?? 0
        const wc = w > 0.8 ? C.crit : w > 0.5 ? C.warn : C.good
        const col = layers.condition ? new THREE.Color(pal.neutral).lerp(new THREE.Color(wc), 0.5) : new THREE.Color(pal.neutral)
        return (
          <group key={name} ref={(o) => { if (o) { o.userData.x = xc; parts.current[i] = o } }} position={[xc, 0, 0]}>
            <mesh geometry={g.cyl} rotation={[0, 0, Math.PI / 2]} scale={[r, Math.abs(x0 - x1) * 0.95, r]} castShadow>
              <meshStandardMaterial color={col} emissive={layers.condition ? wc : '#000'} emissiveIntensity={hovered || selected ? 0.22 : 0.08} roughness={0.5} metalness={0.2} />
            </mesh>
            {selected && (
              <>
                <Line points={[[0, -r, 0], [0, -1.35, 0]]} color={css('--ink-3')} lineWidth={1} />
                <Html position={[0, -1.6, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                  <div className="mod3d">{name}<small>wear {Math.round(w * 100)}%</small></div>
                </Html>
              </>
            )}
          </group>
        )
      })}
      <mesh geometry={g.torus} position={[0.76, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.55}><meshStandardMaterial color={pal.fin} metalness={0.5} roughness={0.4} /></mesh>
      <mesh geometry={g.cyl} position={[-5.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.36, 0.7, 0.36]}>
        <meshStandardMaterial ref={glowMat} color={pal.fin} emissive={exhaust} emissiveIntensity={0.8} />
      </mesh>
      {hovered && !selected && (
        <Html position={[-2.2, 0.9, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag3d">{info?.position} engine<small>{info?.state === 'operational' ? `about ${Math.max(0, Math.round(info.rul_mean))} flights left · click to open` : 'not in service'}</small></div>
        </Html>
      )}
    </group>
  )
}

function Pins({ engines, anomaly, C }) {
  const pin = (key, pos, color, text) => (
    <Html key={key} position={pos} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
      <div className="pin" style={{ '--c': color }}><i />{text}</div>
    </Html>
  )
  const out = []
  if (anomaly?.flagged_days > 0) out.push(pin('an', [4.6, 1.9, 0], C.warn, `Unusual reading: ${anomaly.latest_top_parameter}`))
  engines.forEach((e, s) => {
    const z = s === 0 ? 0.82 : -0.82
    const pos = s === 0 ? [-0.8, 1.7, z] : [-3.8, 2.6, z]
    if (e.scheduled_day != null) out.push(pin(`p${s}`, pos, C.accent, `${e.position}: swap booked`))
    else if (e.health === 'critical' && e.state === 'operational') out.push(pin(`p${s}`, pos, C.crit, `${e.position}: at risk`))
  })
  return out
}

const HOME = [15, 6.5, 14], HOME_T = [-0.6, 0, 0]
const tgt = new THREE.Vector3(), cam = new THREE.Vector3()
function Rig({ selected, interacted, setInteracted, resetKey }) {
  const ctrl = useRef(), anim = useRef(0)
  const { camera } = useThree()
  useEffect(() => { anim.current = 2 }, [selected, resetKey])
  useFrame((_, dt0) => {
    const c = ctrl.current
    if (!c) return
    const dt = Math.min(dt0, 0.05), k = 1 - Math.pow(0.0008, dt)
    if (selected != null) tgt.set(-2.4, -0.2, selected === 0 ? 0.6 : -0.6); else tgt.set(...HOME_T)
    c.target.lerp(tgt, k)
    if (anim.current > 0) {
      anim.current -= dt
      if (selected != null) cam.set(-10.5, 4.4, selected === 0 ? 6.4 : -6.4).add(tgt); else cam.set(...HOME)
      camera.position.lerp(cam, k)
    }
    c.update()
  })
  return <OrbitControls ref={ctrl} makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={5} maxDistance={32} maxPolarAngle={Math.PI * 0.52}
    autoRotate={!interacted && selected == null} autoRotateSpeed={0.5} onStart={() => setInteracted(true)} />
}

export default function TwinScene({ engines, anomaly, selected, onSelect, layers, age, theme, resetKey }) {
  const [hover, setHover] = useState(null)
  const [interacted, setInteracted] = useState(false)
  const explode = useRef([0, 0])
  const pal = PAL[theme]
  const C = useMemo(() => ({ good: css('--good'), warn: css('--warn'), crit: css('--crit'), accent: css('--accent'), idle: css('--idle') }), [theme]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setInteracted(false) }, [resetKey])
  return (
    <Canvas shadows camera={{ position: HOME, fov: 30, near: 0.5, far: 200 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} onPointerMissed={() => onSelect(null)}>
      <Ticker explode={explode} selected={selected} />
      <hemisphereLight args={[theme === 'light' ? '#ffffff' : '#9fb0cc', theme === 'light' ? '#b8c2d3' : '#0a0d12', theme === 'light' ? 1.05 : 0.8]} />
      <directionalLight position={[8, 12, 7]} intensity={theme === 'light' ? 1.9 : 1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <directionalLight position={[-9, 5, -8]} intensity={0.45} color={theme === 'light' ? '#dbe6ff' : '#6e93ff'} />
      <group position={[0, 0.2, 0]}>
        <Airframe pal={pal} xray={layers.xray} open={selected != null} />
        {engines.map((e, s) => (
          <Engine key={s} side={s} info={e} wear={wearAt(e, selected === s ? age : null)} selected={selected === s} hovered={hover === s} explode={explode}
            layers={layers} pal={pal} C={C} onSelect={onSelect} onHover={setHover} />
        ))}
        {layers.alerts && <Pins engines={engines} anomaly={anomaly} C={C} />}
      </group>
      <mesh position={[0, -1.45, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}><circleGeometry args={[11, 96]} /><meshStandardMaterial color={pal.disc} roughness={1} /></mesh>
      <mesh position={[0, -1.44, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><ringGeometry args={[10.7, 10.8, 96]} /><meshBasicMaterial color={pal.rim} /></mesh>
      <mesh position={[0, -1.44, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><ringGeometry args={[6.6, 6.64, 96]} /><meshBasicMaterial color={pal.rim} transparent opacity={0.7} /></mesh>
      <ContactShadows position={[0, -1.43, 0]} opacity={theme === 'light' ? 0.4 : 0.6} scale={26} blur={2.4} far={5} />
      <Rig selected={selected} interacted={interacted} setInteracted={setInteracted} resetKey={resetKey} />
    </Canvas>
  )
}

/** Eases each engine's "explode" amount toward 1 while it is the open engine, 0 otherwise. */
function Ticker({ explode, selected }) {
  useFrame((_, dt) => { for (const s of [0, 1]) explode.current[s] += ((selected === s ? 1 : 0) - explode.current[s]) * (1 - Math.pow(0.002, Math.min(dt, 0.05))) })
  return null
}
