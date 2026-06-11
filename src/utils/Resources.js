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

    const onLoad = (file) => {
      this.items[name] = file
      this.itemLoaded(name, file)
    }
    const onError = (err) => {
      console.error(`[Resources] Failed to load ${type} "${name}":`, err)
      this.errors[name] = err
      this.items[name] = null
      this.itemLoaded(name, null)
    }

    if (type === 'video') {
      const video = document.createElement('video')
      video.src = path
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      video.loop = true
      video.oncanplay = () => {
        const texture = new THREE.VideoTexture(video)
        this.items[name] = texture
        this.itemLoaded(name, texture)
      }
      video.onerror = onError
      return
    }

    if (type === 'cubeTexture' || type === 'hdrTexture' || type === 'exrTexture' || type === 'ktx2Texture') {
      loader.load(path, onLoad, undefined, onError)
    } else {
      loader.load(path, onLoad, undefined, onError)
    }
  }

  itemLoaded(name, file) {
    this.items[name] = file
    this.loaded++
    this.progress = this.loaded / this.toLoad
    if (this.loaded === this.toLoad) {
      this.progress = 1
      this._resolveReady(this)
    }
  }
}
