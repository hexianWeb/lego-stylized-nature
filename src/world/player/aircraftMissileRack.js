import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three/webgpu'

export const MISSILE_MOUNT_SCALE = 0.4

const SIDES = [-1, 1]
const NOSE_AXIS = new Vector3(0, 1, 0)
const STUD_AXIS = new Vector3(0, 0, 1)
const MOUNT_ROTATION = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
))

export function createAircraftMissileRack(missileArt, parent) {
  const rack = new Group()
  rack.name = 'AircraftMissileRack'
  const paint = new MeshStandardMaterial({ color: 0x41444b, roughness: 0.66 })
  const strutGeometry = new BoxGeometry(0.046, 0.014, 0.025)
  const railGeometry = new BoxGeometry(0.062, 0.008, 0.032)
  const worldRotation = new Quaternion()
  const mounts = {}

  for (const side of SIDES) {
    const mount = new Group()
    mount.name = side < 0 ? 'MissileRailLeft' : 'MissileRailRight'
    // Place the tall tail fins behind the wing's trailing edge.
    mount.position.set(-0.045, -0.060, side * 0.275)
    const strut = new Mesh(strutGeometry, paint)
    strut.position.set(-0.03, 0.053, 0)
    const rail = new Mesh(railGeometry, paint)
    rail.position.set(-0.03, 0.044, 0)

    const missile = new Group()
    missile.name = 'MountedMissile'
    missile.quaternion.copy(MOUNT_ROTATION)
    missile.scale.setScalar(MISSILE_MOUNT_SCALE)
    for (const { shape, paint } of missileArt)
      missile.add(new Mesh(shape, paint))
    mount.add(strut, rail, missile)
    rack.add(mount)
    mounts[side] = missile
  }
  parent.add(rack)

  function update(rails) {
    for (const side of SIDES)
      mounts[side].visible = Boolean(rails[side])
  }

  function getWorldMount(side, outPosition, outDirection, outUp) {
    const mount = mounts[side]
    mount.getWorldPosition(outPosition)
    if (outDirection || outUp) {
      mount.getWorldQuaternion(worldRotation)
      outDirection?.copy(NOSE_AXIS).applyQuaternion(worldRotation)
      outUp?.copy(STUD_AXIS).applyQuaternion(worldRotation)
    }
    return outPosition
  }

  function dispose() {
    rack.removeFromParent()
    rack.clear()
    strutGeometry.dispose()
    railGeometry.dispose()
    paint.dispose()
  }

  return { update, getWorldMount, dispose }
}
