import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, ContactShadows, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

interface Props {
  /** Resolved GLB url for whatever the player is currently wearing. */
  modelUrl: string
  /** Rank accent colour, used for the ground ring and rim light. */
  accent: string
  level: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  /** Hides the level badge — useful in pickers where it would be noise. */
  hideBadge?: boolean
}

const SIZES: Record<NonNullable<Props['size']>, number> = { sm: 56, md: 100, lg: 260 }

const BODY_HEIGHT = 0.88
const GROUND_Y = -BODY_HEIGHT / 2

/**
 * Models come from different sources at wildly different scales and origins,
 * so each one is measured at load and normalised to a fixed height centred on
 * the origin. That keeps the camera, shadow and ground ring valid for any model
 * without per-model tuning.
 */
/**
 * Where the Draco decoder is served from.
 *
 * Every model is Draco-compressed, and drei defaults to fetching the decoder
 * from a Google CDN. That was always wrong for this app — an installed PWA that
 * needs a third-party host to draw its own avatars is not really offline — and
 * it became fatal once the Content-Security-Policy restricted scripts to this
 * origin. Serving it ourselves fixes both, and the service worker can cache it
 * like any other asset.
 */
const DRACO_PATH = '/draco/'

function CharacterModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, DRACO_PATH)

  const { cloned, scale, offset } = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })

    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const fit = BODY_HEIGHT / (size.y || 1)

    return {
      cloned: root,
      scale: fit,
      offset: [-center.x * fit, -center.y * fit, -center.z * fit] as [number, number, number],
    }
  }, [scene])

  return (
    <group position={offset} scale={scale}>
      <primitive object={cloned} />
    </group>
  )
}

function ModelFallback({ accent }: { accent: string }) {
  return (
    <mesh position={[0, 0, 0]}>
      <capsuleGeometry args={[0.16, 0.4, 4, 12]} />
      <meshStandardMaterial color={accent} roughness={0.7} transparent opacity={0.35} />
    </mesh>
  )
}

function Scene({ modelUrl, accent, interactive }: Omit<Props, 'size' | 'level' | 'hideBadge'>) {
  const spinRef = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
    if (!spinRef.current) return
    if (!interactive) spinRef.current.rotation.y += delta * 0.35
    spinRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.02
  })

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[2, 3, 2]} intensity={1.4} castShadow shadow-mapSize={[512, 512]} />
      <directionalLight position={[-2, 1.5, -2]} intensity={0.5} color={accent} />
      <pointLight position={[0, 0.4, 1.6]} intensity={0.5} />

      <group ref={spinRef}>
        <Suspense fallback={<ModelFallback accent={accent} />}>
          <CharacterModel url={modelUrl} />
        </Suspense>
      </group>

      <mesh position={[0, GROUND_Y + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.42, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>

      <ContactShadows position={[0, GROUND_Y, 0]} opacity={0.5} scale={1.5} blur={2.2} far={1} />

      {interactive && (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 2.6}
          maxPolarAngle={Math.PI / 1.7}
          autoRotate
          autoRotateSpeed={1.2}
        />
      )}
    </>
  )
}

export default function Avatar3D({
  modelUrl,
  accent,
  level,
  size = 'lg',
  interactive = false,
  hideBadge = false,
}: Props) {
  const dim = SIZES[size]

  // Remounting on url change avoids a frame of the previous model at the new
  // model's scale while the GLB loads.
  return (
    <div className="relative shrink-0" style={{ width: dim, height: dim }}>
      <Canvas
        key={modelUrl}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.05, 2.1], fov: 28 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene modelUrl={modelUrl} accent={accent} interactive={interactive} />
      </Canvas>

      {!hideBadge && (
        <div
          className="pointer-events-none absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border bg-ink-900 font-display font-bold"
          style={{
            width: dim * 0.32,
            height: dim * 0.32,
            fontSize: dim * 0.15,
            borderColor: accent,
            color: accent,
          }}
        >
          {level}
        </div>
      )}
    </div>
  )
}

export function preloadModel(url: string) {
  // Same decoder path as the loader. Preloading without it would prime the
  // cache through the CDN route and fail exactly like the original bug.
  useGLTF.preload(url, DRACO_PATH)
}
