import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export const MASCOT_URL = '/models/lavender-guide.glb'
const DRACO_PATH = '/draco/'

const BODY_HEIGHT = 0.95

/**
 * The guide's idle animation.
 *
 * The mesh has no skeleton, so this is driven procedurally rather than by a
 * clip. Three overlapping motions at unrelated periods — a breath, a sway and a
 * slow turn — never line up into an obvious loop, which is what makes a rigid
 * model read as alive. `speaking` deepens the breath and adds a small nod, so
 * the figure looks like it is addressing you rather than idling beside the text.
 */
function GuideModel({ speaking }: { speaking: boolean }) {
  const { scene } = useGLTF(MASCOT_URL, DRACO_PATH)
  const group = useRef<THREE.Group>(null)

  const { cloned, scale, offset } = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    // Models arrive at arbitrary scale and origin, so measure and normalise.
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    const centre = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(centre)
    const s = BODY_HEIGHT / Math.max(size.y, 0.0001)
    return {
      cloned: root,
      scale: s,
      offset: new THREE.Vector3(-centre.x * s, -box.min.y * s - BODY_HEIGHT / 2, -centre.z * s),
    }
  }, [scene])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.getElapsedTime()
    const depth = speaking ? 1.7 : 1

    // Breath: a small rise and fall.
    g.position.y = offset.y + Math.sin(t * 1.4) * 0.018 * depth
    // Sway: weight shifting, at a period unrelated to the breath.
    g.rotation.z = Math.sin(t * 0.9) * 0.022
    // Turn: a slow look around the room, so it never sits perfectly still.
    g.rotation.y = Math.sin(t * 0.35) * 0.28
    // Nod: only while talking, and fast enough to read as emphasis.
    g.rotation.x = speaking ? Math.sin(t * 3.1) * 0.035 : 0
  })

  return (
    <group ref={group} position={[offset.x, offset.y, offset.z]} scale={scale}>
      <primitive object={cloned} />
    </group>
  )
}

/**
 * The AI guide's face.
 *
 * Deliberately not the player's avatar component: this one never takes a rank
 * accent, never shows a level badge and is not interactive — it is a character
 * that talks to you, not a thing you own and dress.
 */
export default function Mascot3D({
  size = 132,
  speaking = false,
}: {
  size?: number
  speaking?: boolean
}) {
  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <Canvas
        camera={{ position: [0, 0.06, 2.1], fov: 34 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 3, 2]} intensity={1.5} castShadow />
        {/* Cool rim from behind so the figure separates from a dark panel. */}
        <directionalLight position={[-2, 1.5, -2]} intensity={0.6} color="#b9a7ff" />
        <Suspense fallback={null}>
          <GuideModel speaking={speaking} />
          <ContactShadows position={[0, -BODY_HEIGHT / 2, 0]} opacity={0.32} scale={2.4} blur={2.6} far={1.2} />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MASCOT_URL, DRACO_PATH)
