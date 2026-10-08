import sources from '../assets/sources.js'

import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

export default class Resources {
  constructor(sourceList = sources) {
    this.items = {}
    this.errors = {}
    this.sources = sourceList
    this.toLoad = sourceList.length
    this.loaded = 0
    this.progress = 0
    this.disposed = false
    this._disposedObjects = new WeakSet()
    this._videos = new Set()

    this.ready = new Promise(resolve => {
      this._resolveReady = resolve
    })

    if (this.toLoad === 0) {
      this._resolveReady(this)
      return
    }
    this.startLoading()
  }

  startLoading() {
    // Create loaders once
    this.loaders = {
      gltfModel: new GLTFLoader(),
      texture: new THREE.TextureLoader(),
      cubeTexture: new THREE.CubeTextureLoader(),
      font: new FontLoader(),
      fbxModel: new FBXLoader(),
      audio: new THREE.AudioLoader(),
      objModel: new OBJLoader(),
      hdrTexture: new HDRLoader(),
      svg: new SVGLoader(),
      exrTexture: new EXRLoader(),
      video: null, // special handling
      ktx2Texture: new KTX2Loader()
    }

    // TODO: user may need to set decoder paths for GLTF/Draco/KTX2
    // this.loaders.gltfModel.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'))
    // this.loaders.ktx2Texture.setTranscoderPath('/ktx2/')

    for (const source of this.sources) {
      this.loadResource(source)
    }
  }

  loadResource(source) {
    const { name, type, path } = source
    const loader = this.loaders[type]

    if (!loader && type !== 'video') {
      const err = new Error(`[Resources] Unknown type "${type}" for "${name}"`)
      console.error(err.message)
      this.errors[name] = err
      this.items[name] = null
      this.itemLoaded(name, null)
      return
    }

    let settled = false
    const onLoad = (file) => {
      if (settled) {
        return
      }
      settled = true
      this.itemLoaded(name, file)
    }
    const onError = (err) => {
      if (settled) {
        return
      }
      settled = true
      if (!this.disposed) {
        console.error(`[Resources] Failed to load ${type} "${name}":`, err)
        this.errors[name] = err
      }
      this.itemLoaded(name, null)
    }

    if (type === 'video') {
      const video = document.createElement('video')
      this._videos.add(video)
      video.src = path
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      video.loop = true
      video.oncanplay = () => {
        video.oncanplay = null
        video.onerror = null
        onLoad(new THREE.VideoTexture(video))
      }
      video.onerror = onError
      return
    }

    try {
      loader.load(path, onLoad, undefined, onError)
    } catch (err) {
      onError(err)
    }
  }

  itemLoaded(name, file) {
    if (this.disposed) {
      this.disposeItem(file)
    } else {
      this.items[name] = file
    }
    this.loaded++
    this.progress = this.loaded / this.toLoad
    if (this.loaded === this.toLoad) {
      this.progress = 1
      this._resolveReady(this)
    }
  }

  assertRequired() {
    if (this.disposed) {
      throw new Error('[Resources] Resources have been disposed')
    }
    const failed = this.sources.filter((source) => source.required && !this.items[source.name])
    if (failed.length > 0) {
      throw new Error(`[Resources] Required resources failed to load: ${failed.map((source) => source.name).join(', ')}`, {
        cause: this.errors[failed[0].name]
      })
    }
  }

  // Only release an item after its last consumer has finished (e.g. the HDR after PMREM).
  release(name) {
    this.disposeItem(this.items[name])
    delete this.items[name]
  }

  disposeItem(item) {
    if (!item) {
      return
    }
    const disposeOnce = (resource) => {
      if (resource && !this._disposedObjects.has(resource)) {
        this._disposedObjects.add(resource)
        resource.dispose?.()
      }
    }
    const disposeTexture = (texture) => {
      if (!texture?.isTexture || this._disposedObjects.has(texture)) {
        return
      }
      disposeOnce(texture)
      const images = Array.isArray(texture.image) ? texture.image : [texture.image]
      for (const image of images) {
        if (image?.close && !this._disposedObjects.has(image)) {
          this._disposedObjects.add(image)
          image.close()
        }
      }
    }

    disposeTexture(item)
    const scenes = item.scenes ?? (item.scene ? [item.scene] : item.isObject3D ? [item] : [])
    for (const scene of scenes) {
      scene.traverse((node) => {
        disposeOnce(node.geometry)
        if (node.skeleton) {
          disposeTexture(node.skeleton.boneTexture)
          // Skeleton.dispose() would dispose the same texture a second time.
          node.skeleton.boneTexture = null
          disposeOnce(node.skeleton)
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        for (const material of materials) {
          if (!material) {
            continue
          }
          for (const value of Object.values(material)) {
            disposeTexture(value)
          }
          disposeOnce(material)
        }
      })
    }
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    for (const name of Object.keys(this.items)) {
      this.release(name)
    }
    for (const video of this._videos) {
      video.oncanplay = null
      video.onerror = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    this._videos.clear()
    this.loaders?.ktx2Texture?.dispose()
    // Unblock callers if disposal cancels a video or happens during startup.
    this._resolveReady(this)
  }
}
