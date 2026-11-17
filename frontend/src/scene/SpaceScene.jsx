import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import StarField from './StarField'
import SolarSystem from './SolarSystem'
import DeepSpace from './DeepSpace'
import CameraRig from './CameraRig'
import { useStore } from '../store'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { toRender, view } from './universe'

/** The Sun's light. In the true view the scene is drawn round the focus, so the light follows the Sun. */
function SunLight() {
  const light = useRef()
  useFrame(() => {
    if (view.active) toRender([0, 0, 0], light.current.position)
    else light.current.position.set(0, 0, 0)
  })
  return <pointLight ref={light} position={[0, 0, 0]} intensity={2.6} decay={0} />
}
import { CAMERA_FAR, HOME_VIEWS } from './scale'

const home = HOME_VIEWS.solar_system

/** The full-screen 3D canvas: stars, Solar System, deep-space objects, controls and the camera rig. */
export default function SpaceScene() {
  const entered = useStore((s) => s.entered)
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: home.position, fov: 50, near: 0.1, far: CAMERA_FAR }} dpr={[1, 2]}>
        <color attach="background" args={['#000004']} />
        <ambientLight intensity={0.12} />
        <SunLight />
        <Suspense fallback={null}>
          <StarField />
          <SolarSystem />
          <DeepSpace />
        </Suspense>
        <OrbitControls
          makeDefault
          target={home.target}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minDistance={0.8}
          maxDistance={6000} // room for the "True distances" overview
          autoRotate={!entered} // the sky turns slowly behind the landing page
          autoRotateSpeed={0.35}
        />
        <CameraRig />
      </Canvas>
    </div>
  )
}
