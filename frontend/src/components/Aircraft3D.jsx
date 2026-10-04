import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Grid, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

const GOOD = '#0ca30c', WARN = '#fab219', SERIOUS = '#ec835a', CRIT = '#d03b3b', IDLE = '#3b4556', ACCENT = '#3987e5'
export const moduleColor = (v, cls) => (cls === 'failed' ? CRIT : cls === 'maintenance' ? IDLE : v > 0.75 ? SERIOUS : v > 0.5 ? WARN : GOOD)

// Engine modules along the X axis (nose = +X): [name, x-front, x-rear, radius]
const SEGMENTS = [['Fan', 0.7, -0.5, 0.52], ['Compressor', -0.5, -2.0, 0.47], ['Combustor', -2.0, -3.3, 0.45], ['Turbine', -3.3, -4.8, 0.43]]
const BODY = { color: '#3b4657', metalness: 0.15, roughness: 0.55 }

function Edged({ geometry, material, edge = '#9fb0cc', opacity = 0.42, threshold = 28, ...props }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, threshold), [geometry, threshold])
  return (
    <group {...props}>
      <mesh geometry={geometry}>{material}</mesh>
      <lineSegments geometry={edges}><lineBasicMaterial color={edge} transparent opacity={opacity} /></lineSegments>
    </group>
  )
}

function useShape(build, depth, bevel = 0) {
  return useMemo(() => {
    const s = new THREE.Shape()
    build(s)
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

function Airframe() {
  const fuselage = useMemo(() => {
    const prof = [[0.001, 7.2], [0.1, 6.8], [0.28, 6.0], [0.46, 4.8], [0.62, 3.4], [0.74, 1.8], [0.78, 0.2], [0.76, -1.6], [0.7, -3.4], [0.58, -4.8], [0.46, -5.4], [0.001, -5.5]]
    return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 56)
  }, [])
  const wing = (sign) => (s) => { s.moveTo(2.4, 0.3 * sign); s.lineTo(-0.9, 5.9 * sign); s.lineTo(-2.1, 5.9 * sign); s.lineTo(-3.7, 0.3 * sign); s.closePath() }
  const tailplane = (sign) => (s) => { s.moveTo(-3.4, 0.4 * sign); s.lineTo(-5.1, 2.7 * sign); s.lineTo(-5.9, 2.7 * sign); s.lineTo(-5.5, 0.4 * sign); s.closePath() }
  const fin = (s) => { s.moveTo(-3.1, 0); s.lineTo(-4.9, 2.7); s.lineTo(-5.8, 2.7); s.lineTo(-5.5, 0); s.closePath() }
  const wingR = useShape(wing(1), 0.12), wingL = useShape(wing(-1), 0.12)
  const tailR = useShape(tailplane(1), 0.09), tailL = useShape(tailplane(-1), 0.09)
  const finG = useShape(fin, 0.08)
  const mat = <meshStandardMaterial {...BODY} />
  const rot = [Math.PI / 2, 0, 0]
  return (
    <group>
      <Edged geometry={fuselage} material={mat} rotation={[0, 0, -Math.PI / 2]} scale={[0.84, 1, 1.16]} threshold={40} opacity={0.2} />
      <Edged geometry={wingR} material={mat} rotation={rot} position={[0, 0.02, 0]} />
      <Edged geometry={wingL} material={mat} rotation={rot} position={[0, 0.02, 0]} />
      <Edged geometry={tailR} material={mat} rotation={rot} position={[0, 0.02, 0]} />
      <Edged geometry={tailL} material={mat} rotation={rot} position={[0, 0.02, 0]} />
      <Edged geometry={finG} material={mat} position={[0, 0.5, 0.95]} rotation={[0.2, 0, 0]} />
      <Edged geometry={finG} material={mat} position={[0, 0.5, -1.03]} rotation={[-0.2, 0, 0]} />
      <mesh position={[3.4, 0.62, 0]} scale={[1.9, 0.5, 0.55]}>
        <sphereGeometry args={[1, 32, 20]} />
        <meshPhysicalMaterial color="#7fb4ff" transparent opacity={0.28} metalness={0.9} roughness={0.08} />
      </mesh>
    </group>
  )
}

function Engine({ side, info, selected, onSelect }) {
  const z = side === 0 ? 0.82 : -0.82
  const [hover, setHover] = useState(false)
  const cls = info?.health ?? 'healthy'
  const mods = info?.modules ?? {}
  const glow = selected ? 0.5 : hover ? 0.32 : 0.16
  const parts = useRef([])
  const ex = useRef(0)
  // exploded view: modules slide rearward and open a gap when this engine is selected
  useFrame((_, dt) => {
    ex.current += ((selected ? 1 : 0) - ex.current) * (1 - Math.pow(0.0015, dt))
    parts.current.forEach((m, i) => { if (m) m.position.x = m.userData.x - i * 0.55 * ex.current })
  })
  return (
    <group position={[0, -0.22, z]}
      onClick={(e) => { e.stopPropagation(); onSelect(side) }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}>
      {SEGMENTS.map(([name, x0, x1, r], i) => {
        const c = moduleColor(mods[name] ?? 0, cls)
        const xc = (x0 + x1) / 2
        return (
          <group key={name} ref={(g) => { if (g) { g.userData.x = xc; parts.current[i] = g } }} position={[xc, 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r, r, Math.abs(x0 - x1) * 0.93, 44]} />
              <meshStandardMaterial color={new THREE.Color('#252d3a').lerp(new THREE.Color(c), 0.4)} emissive={c} emissiveIntensity={glow + (cls === 'failed' ? 0.25 : 0)} metalness={0.3} roughness={0.42} />
            </mesh>
            {selected && (
              <Html position={[0, -0.95, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <div className="tag3d" style={{ flexDirection: 'column', gap: 1, padding: '4px 9px' }}>
                  <span>{name}</span>
                  <span className="tnum" style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>drift {(mods[name] ?? 0).toFixed(2)}</span>
                </div>
              </Html>
            )}
          </group>
        )
      })}
      <mesh position={[-5.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.34, 0.43, 1.05, 40, 1, true]} />
        <meshStandardMaterial color="#10141b" metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.74, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.53, 0.035, 12, 48]} /><meshStandardMaterial color="#5b6678" metalness={0.8} roughness={0.3} /></mesh>
      {!selected && (
        <Html position={[-2.2, -0.95, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag3d"><span className="dot" style={{ '--c': cls === 'maintenance' ? IDLE : cls === 'failed' || cls === 'critical' ? CRIT : cls === 'watch' ? WARN : GOOD }} />
            {side === 0 ? 'Port' : 'Starboard'}{info ? ` · ${Math.round(info.rul_mean)} cyc` : ''}</div>
        </Html>
      )}
    </group>
  )
}

function Rig({ focus, interacted, setInteracted }) {
  const ref = useRef()
  const anim = useRef(0)
  const target = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => { anim.current = 1.4 }, [focus])
  useFrame(({ camera }, dt) => {
    const c = ref.current
    if (!c) return
    target.set(focus == null ? 0 : -2.4, -0.1, focus === 0 ? 0.6 : focus === 1 ? -0.6 : 0)
    c.target.lerp(target, 1 - Math.pow(0.002, dt))
    if (anim.current > 0) { // glide the camera in/out only right after a selection change, so manual zoom is never fought
      anim.current -= dt
      const off = camera.position.clone().sub(c.target)
      off.setLength(THREE.MathUtils.lerp(off.length(), focus == null ? 21 : 16, 1 - Math.pow(0.02, dt)))
      camera.position.copy(c.target).add(off)
    }
    c.update()
  })
  return <OrbitControls ref={ref} enablePan={false} minDistance={7} maxDistance={30} maxPolarAngle={Math.PI * 0.51} autoRotate={!interacted && focus == null} autoRotateSpeed={0.45}
    enableDamping dampingFactor={0.08} onStart={() => setInteracted(true)} />
}

export default function Aircraft3D({ engines, selected, onSelect }) {
  const [interacted, setInteracted] = useState(false)
  return (
    <Canvas camera={{ position: [15, 6.5, 14], fov: 30 }} dpr={[1, 2]} gl={{ antialias: true }} onPointerMissed={() => onSelect(null)}>
      <hemisphereLight args={['#d6deee', '#161b24', 0.9]} />
      <directionalLight position={[6, 10, 6]} intensity={1.7} />
      <directionalLight position={[-8, 4, -7]} intensity={0.55} color="#aebfe0" />
      <group rotation={[0, -0.3, 0]} position={[0.4, 0.4, 0]}>
        <Airframe />
        {[0, 1].map((s) => <Engine key={s} side={s} info={engines?.[s]} selected={selected === s} onSelect={onSelect} />)}
      </group>
      <Grid position={[0, -1.7, 0]} args={[1, 1]} cellSize={1} cellThickness={0.5} cellColor="#161c27" sectionSize={5} sectionThickness={0.9} sectionColor="#232c3d"
        fadeDistance={34} fadeStrength={1.6} infiniteGrid />
      <ContactShadows position={[0, -1.69, 0]} opacity={0.55} scale={30} blur={2.6} far={4} />
      <Rig focus={selected} interacted={interacted} setInteracted={setInteracted} />
    </Canvas>
  )
}
