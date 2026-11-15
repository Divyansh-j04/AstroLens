import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import StarField from './StarField'
import SolarSystem from './SolarSystem'
import DeepSpace from './DeepSpace'
import CameraRig from './CameraRig'
import { CAMERA_FAR, HOME_VIEWS } from './scale'

const home = HOME_VIEWS.solar_system

/** The full-screen 3D canvas: stars, Solar System, deep-space objects, controls and the camera rig. */
export default function SpaceScene() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: home.position, fov: 50, near: 0.1, far: CAMERA_FAR }} dpr={[1, 2]}>
        <color attach="background" args={['#000004']} />
        <ambientLight intensity={0.12} />
        <pointLight position={[0, 0, 0]} intensity={2.6} decay={0} />
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
          maxDistance={2500}
        />
        <CameraRig />
      </Canvas>
    </div>
  )
}
