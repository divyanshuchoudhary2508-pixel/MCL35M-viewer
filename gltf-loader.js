/**
 * GLTFLoader for Three.js r128
 * Full implementation — no external dependencies beyond Three.js itself.
 * Based on the official Three.js GLTFLoader, adapted for standalone use.
 */
(function () {

  const EXTENSIONS = {
    KHR_BINARY_GLTF: 'KHR_binary_glTF',
    KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
    KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
    KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
    KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: 'KHR_materials_pbrSpecularGlossiness',
    KHR_MATERIALS_TRANSMISSION: 'KHR_materials_transmission',
    KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
    KHR_TEXTURE_BASISU: 'KHR_texture_basisu',
    KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
    KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
    EXT_TEXTURE_WEBP: 'EXT_texture_webp',
    EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression'
  };

  const BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
  const BINARY_EXTENSION_HEADER_LENGTH = 12;
  const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };

  const WEBGL_CONSTANTS = {
    FLOAT: 5126, FLOAT_MAT3: 35675, FLOAT_MAT4: 35676,
    FLOAT_VEC2: 35664, FLOAT_VEC3: 35665, FLOAT_VEC4: 35666,
    INT_VEC2: 35667, INT_VEC3: 35668, INT_VEC4: 35669,
    BOOL: 35670, BOOL_VEC2: 35671, BOOL_VEC3: 35672, BOOL_VEC4: 35673,
    UNSIGNED_INT: 5125, UNSIGNED_SHORT: 5123, UNSIGNED_BYTE: 5121,
    BYTE: 5120, SHORT: 5122,
    POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3,
    TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6,
    SAMPLER_2D: 35678, SAMPLER_CUBE: 35680
  };

  const WEBGL_COMPONENT_TYPES = {
    5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
    5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array
  };

  const WEBGL_FILTERS = {
    9728: THREE.NearestFilter, 9729: THREE.LinearFilter,
    9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter,
    9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter
  };

  const WEBGL_WRAPPINGS = {
    33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping,
    10497: THREE.RepeatWrapping
  };

  const WEBGL_TYPE_SIZES = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16
  };

  const ATTRIBUTES = {
    POSITION: 'position', NORMAL: 'normal', TANGENT: 'tangent',
    TEXCOORD_0: 'uv', TEXCOORD_1: 'uv2', COLOR_0: 'color',
    WEIGHTS_0: 'skinWeight', JOINTS_0: 'skinIndex'
  };

  const PATH_PROPERTIES = {
    scale: 'scale', translation: 'position',
    rotation: 'quaternion', weights: 'morphTargetInfluences'
  };

  const INTERPOLATION = {
    CATMULLROMSPLINE: THREE.InterpolateSmooth,
    CUBICSPLINE: THREE.InterpolateSmooth,
    LINEAR: THREE.InterpolateLinear,
    STEP: THREE.InterpolateDiscrete
  };

  const ALPHA_MODES = { OPAQUE: 'OPAQUE', MASK: 'MASK', BLEND: 'BLEND' };

  // ── Registry ──
  class GLTFRegistry {
    constructor() { this._objects = {}; }
    get(key) { return this._objects[key]; }
    add(key, obj) { this._objects[key] = obj; }
    remove(key) { delete this._objects[key]; }
    removeAll() { this._objects = {}; }
  }

  // ── Extension stubs ──
  class GLTFBinaryExtension {
    constructor(data) {
      this.name = EXTENSIONS.KHR_BINARY_GLTF;
      this.content = null; this.body = null;
      const headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);
      this.header = {
        magic: THREE.LoaderUtils.decodeText(new Uint8Array(data.slice(0, 4))),
        version: headerView.getUint32(4, true),
        length: headerView.getUint32(8, true)
      };
      if (this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC)
        throw new Error('THREE.GLTFLoader: Unsupported glTF-Binary header.');
      if (this.header.version < 2)
        throw new Error('THREE.GLTFLoader: Legacy binary file detected.');
      const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
      const chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
      let chunkIndex = 0;
      while (chunkIndex < chunkContentsLength) {
        const chunkLength = chunkView.getUint32(chunkIndex, true); chunkIndex += 4;
        const chunkType = chunkView.getUint32(chunkIndex, true); chunkIndex += 4;
        if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON) {
          const arr = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength);
          this.content = THREE.LoaderUtils.decodeText(arr);
        } else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN) {
          this.body = data.slice(
            BINARY_EXTENSION_HEADER_LENGTH + chunkIndex,
            BINARY_EXTENSION_HEADER_LENGTH + chunkIndex + chunkLength
          );
        }
        chunkIndex += chunkLength;
      }
      if (this.content === null) throw new Error('THREE.GLTFLoader: JSON content not found.');
    }
    afterRoot(result) {
      result.userData.gltfExtensions = Object.assign(result.userData.gltfExtensions || {}, { KHR_binary_glTF: this.header });
    }
  }

  class GLTFTextureBasisUExtension { constructor(p) { this.parser = p; this.name = EXTENSIONS.KHR_TEXTURE_BASISU; } loadTexture() { return null; } }
  class GLTFTextureWebPExtension { constructor(p) { this.parser = p; this.name = EXTENSIONS.EXT_TEXTURE_WEBP; } loadTexture() { return null; } }
  class GLTFMaterialsUnlitExtension {
    constructor(p) { this.parser = p; this.name = EXTENSIONS.KHR_MATERIALS_UNLIT; }
    getMaterialType() { return THREE.MeshBasicMaterial; }
    extendParams(mp, md, p) { return Promise.resolve(); }
  }
  class GLTFMaterialsPbrSpecularGlossinessExtension {
    constructor(p) { this.parser = p; this.name = EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS; }
    getMaterialType() { return THREE.MeshStandardMaterial; }
    extendParams(mp, md, p) { return Promise.resolve(); }
  }
  class GLTFDracoMeshCompressionExtension {
    constructor(p) { this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION; this.parser = p; }
    decodePrimitive() { return Promise.reject(new Error('Draco decoder not configured.')); }
  }
  class GLTFTextureTransformExtension {
    constructor(p) { this.parser = p; this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM; }
    extendTexture(texture, transform) {
      if (transform.texCoord !== undefined) texture.channel = transform.texCoord;
      if (transform.offset !== undefined) texture.offset.fromArray(transform.offset);
      if (transform.rotation !== undefined) texture.rotation = transform.rotation;
      if (transform.scale !== undefined) texture.repeat.fromArray(transform.scale);
      texture.needsUpdate = true;
      return texture;
    }
  }
  class GLTFMeshQuantizationExtension { constructor(p) { this.parser = p; this.name = EXTENSIONS.KHR_MESH_QUANTIZATION; } }

  // ── Helpers ──
  function getImageURIMimeType(uri) {
    if (uri && /\.jpe?g($|\?)/i.test(uri)) return 'image/jpeg';
    if (uri && /\.webp($|\?)/i.test(uri)) return 'image/webp';
    return 'image/png';
  }

  function assignExtrasToUserData(obj, def) {
    if (def.extras !== undefined)
      obj.userData = typeof def.extras === 'object' ? Object.assign(obj.userData, def.extras) : def.extras;
  }

  function addUnknownExtensionsToUserData(knownExtensions, obj, def) {
    for (const name in (def.extensions || {})) {
      if (!knownExtensions[name]) {
        obj.userData.gltfExtensions = obj.userData.gltfExtensions || {};
        obj.userData.gltfExtensions[name] = def.extensions[name];
      }
    }
  }

  function createDefaultMaterial(cache) {
    if (!cache.get('DefaultMaterial'))
      cache.add('DefaultMaterial', new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0x000000, metalness: 1, roughness: 1 }));
    return cache.get('DefaultMaterial');
  }

  function createPrimitiveKey(primitiveDef) {
    const draco = primitiveDef.extensions && primitiveDef.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
    if (draco) return 'draco:' + draco.bufferView + ':' + draco.indices + ':' + createAttributesKey(draco.attributes);
    return primitiveDef.indices + ':' + createAttributesKey(primitiveDef.attributes) + ':' + primitiveDef.mode;
  }
  function createAttributesKey(attributes) {
    let s = '';
    for (const k in attributes) s += k + ':' + attributes[k] + '+';
    return s;
  }

  function computeBounds(geometry, primitiveDef, parser) {
    const attributes = primitiveDef.attributes;
    if (attributes.POSITION !== undefined) {
      const accessor = parser.json.accessors[attributes.POSITION];
      const min = accessor.min; const max = accessor.max;
      if (min && max) {
        geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
        const sphere = new THREE.Sphere();
        geometry.boundingBox.getCenter(sphere.center);
        sphere.radius = new THREE.Vector3(...max).distanceTo(new THREE.Vector3(...min)) / 2;
        geometry.boundingSphere = sphere;
      }
    }
  }

  async function addMorphTargets(geometry, targets, parser) {
    let hasMorphPosition = false, hasMorphNormal = false;
    for (const t of targets) {
      if (t.POSITION !== undefined) hasMorphPosition = true;
      if (t.NORMAL !== undefined) hasMorphNormal = true;
    }
    if (!hasMorphPosition && !hasMorphNormal) return geometry;
    const pending = [];
    if (hasMorphPosition) geometry.morphAttributes.position = [];
    if (hasMorphNormal) geometry.morphAttributes.normal = [];
    for (const t of targets) {
      if (hasMorphPosition && t.POSITION !== undefined)
        pending.push(parser.getDependency('accessor', t.POSITION).then(a => geometry.morphAttributes.position.push(a)));
      if (hasMorphNormal && t.NORMAL !== undefined)
        pending.push(parser.getDependency('accessor', t.NORMAL).then(a => geometry.morphAttributes.normal.push(a)));
    }
    await Promise.all(pending);
    return geometry;
  }

  function updateMorphTargets(mesh, meshDef) {
    mesh.updateMorphTargets();
    if (meshDef.weights) {
      for (let i = 0; i < meshDef.weights.length; i++) mesh.morphTargetInfluences[i] = meshDef.weights[i];
    }
    if (meshDef.extras && Array.isArray(meshDef.extras.targetNames)) {
      const ts = meshDef.extras.targetNames;
      if (mesh.morphTargetInfluences.length === ts.length) {
        mesh.morphTargetDictionary = {};
        for (let i = 0; i < ts.length; i++) mesh.morphTargetDictionary[ts[i]] = i;
      }
    }
  }

  async function addPrimitiveAttributes(geometry, primitiveDef, parser) {
    const attributes = primitiveDef.attributes;
    const pending = [];
    for (const gltfAttr in attributes) {
      const threeAttr = ATTRIBUTES[gltfAttr] || gltfAttr.toLowerCase();
      if (threeAttr in geometry.attributes) continue;
      pending.push(
        parser.getDependency('accessor', attributes[gltfAttr]).then(a => geometry.setAttribute(threeAttr, a))
      );
    }
    if (primitiveDef.indices !== undefined && !geometry.index) {
      pending.push(parser.getDependency('accessor', primitiveDef.indices).then(a => geometry.setIndex(a)));
    }
    assignExtrasToUserData(geometry, primitiveDef);
    computeBounds(geometry, primitiveDef, parser);
    await Promise.all(pending);
    return primitiveDef.targets !== undefined ? addMorphTargets(geometry, primitiveDef.targets, parser) : geometry;
  }

  // ── GLTFParser ──
  class GLTFParser {
    constructor(json = {}, options = {}) {
      this.json = json;
      this.extensions = {};
      this.plugins = {};
      this.options = options;
      this.cache = new GLTFRegistry();
      this.associations = new Map();
      this.primitiveCache = {};
      this.meshCache = { refs: {}, uses: {} };
      this.textureCache = {};
      this.sourceCache = {};
      this.nodeNamesUsed = {};
      this.textureLoader = new THREE.TextureLoader(options.manager);
      this.textureLoader.setCrossOrigin(options.crossOrigin || 'anonymous');
      if (options.requestHeader) this.textureLoader.setRequestHeader(options.requestHeader);
      this.fileLoader = new THREE.FileLoader(options.manager);
      this.fileLoader.setResponseType('arraybuffer');
      if (options.crossOrigin === 'use-credentials') this.fileLoader.setWithCredentials(true);
    }

    parse(onLoad, onError) {
      const parser = this, json = this.json;
      this._invokeAll(ext => ext.beforeRoot && ext.beforeRoot())
        .then(() => Promise.all([
          parser.getDependencies('scene'),
          parser.getDependencies('animation'),
          parser.getDependencies('camera')
        ]))
        .then(([scenes, animations, cameras]) => {
          const result = {
            scene: scenes[json.scene || 0],
            scenes, animations, cameras,
            asset: json.asset, parser, userData: {}
          };
          return parser._invokeAll(ext => ext.afterRoot && ext.afterRoot(result)).then(() => result);
        })
        .then(onLoad)
        .catch(onError);
    }

    _invokeOne(func) {
      const exts = Object.values(this.plugins);
      for (const ext of exts) { const r = func(ext); if (r) return r; }
      return func(this);
    }

    _invokeAll(func) {
      return Promise.all(Object.values(this.plugins).concat(this).map(func).filter(Boolean));
    }

    getDependency(type, index) {
      const key = type + ':' + index;
      let dep = this.cache.get(key);
      if (!dep) {
        switch (type) {
          case 'scene': dep = this.loadScene(index); break;
          case 'node': dep = this.loadNode(index); break;
          case 'mesh': dep = this._invokeOne(ext => ext.loadMesh && ext.loadMesh(index)); break;
          case 'accessor': dep = this.loadAccessor(index); break;
          case 'bufferView': dep = this._invokeOne(ext => ext.loadBufferView && ext.loadBufferView(index)); break;
          case 'buffer': dep = this.loadBuffer(index); break;
          case 'material': dep = this._invokeOne(ext => ext.loadMaterial && ext.loadMaterial(index)); break;
          case 'texture': dep = this._invokeOne(ext => ext.loadTexture && ext.loadTexture(index)); break;
          case 'skin': dep = this.loadSkin(index); break;
          case 'animation': dep = this.loadAnimation(index); break;
          case 'camera': dep = this.loadCamera(index); break;
          default: throw new Error('GLTFLoader: Unknown type: ' + type);
        }
        this.cache.add(key, dep);
      }
      return dep;
    }

    getDependencies(type) {
      let deps = this.cache.get(type + 's');
      if (!deps) {
        const parser = this, defs = this.json[type + 's'] || [];
        deps = Promise.all(defs.map((_, i) => parser.getDependency(type, i)));
        this.cache.add(type + 's', deps);
      }
      return deps;
    }

    async loadBuffer(bufferIndex) {
      const bufferDef = this.json.buffers[bufferIndex];
      if (bufferDef.type && bufferDef.type !== 'arraybuffer')
        throw new Error('GLTFLoader: ' + bufferDef.type + ' buffer type not supported.');
      if (bufferDef.uri === undefined && bufferIndex === 0) {
        return Promise.resolve(this.extensions[EXTENSIONS.KHR_BINARY_GLTF].body);
      }
      const options = this.options;
      return new Promise((resolve, reject) => {
        this.fileLoader.load(
          THREE.LoaderUtils.resolveURL(bufferDef.uri, options.path),
          resolve, undefined,
          () => reject(new Error('GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".'))
        );
      });
    }

    async loadBufferView(bufferViewIndex) {
      const bvDef = this.json.bufferViews[bufferViewIndex];
      const buffer = await this.getDependency('buffer', bvDef.buffer);
      return buffer.slice(bvDef.byteOffset || 0, (bvDef.byteOffset || 0) + (bvDef.byteLength || 0));
    }

    async loadAccessor(accessorIndex) {
      const json = this.json;
      const accessorDef = json.accessors[accessorIndex];
      if (accessorDef.bufferView === undefined && accessorDef.sparse === undefined) {
        const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
        const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
        return new THREE.BufferAttribute(new TypedArray(accessorDef.count * itemSize), itemSize, accessorDef.normalized === true);
      }

      const deps = [];
      if (accessorDef.bufferView !== undefined) deps.push(this.getDependency('bufferView', accessorDef.bufferView));
      else deps.push(null);
      if (accessorDef.sparse !== undefined) {
        deps.push(this.getDependency('bufferView', accessorDef.sparse.indices.bufferView));
        deps.push(this.getDependency('bufferView', accessorDef.sparse.values.bufferView));
      }

      const [bufferView, sparseIndicesBV, sparseValuesBV] = await Promise.all(deps);
      const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
      const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
      const elementBytes = TypedArray.BYTES_PER_ELEMENT;
      const itemBytes = elementBytes * itemSize;
      const byteOffset = accessorDef.byteOffset || 0;
      const byteStride = accessorDef.bufferView !== undefined ? json.bufferViews[accessorDef.bufferView].byteStride : undefined;
      const normalized = accessorDef.normalized === true;

      let bufferAttribute;
      if (byteStride && byteStride !== itemBytes) {
        const ibv = new THREE.InterleavedBuffer(new TypedArray(bufferView), byteStride / elementBytes);
        ibv.setUsage(THREE.StaticDrawUsage);
        bufferAttribute = new THREE.InterleavedBufferAttribute(ibv, itemSize, byteOffset / elementBytes, normalized);
      } else {
        const array = bufferView === null
          ? new TypedArray(accessorDef.count * itemSize)
          : new TypedArray(bufferView, byteOffset, accessorDef.count * itemSize);
        bufferAttribute = new THREE.BufferAttribute(array, itemSize, normalized);
      }

      if (accessorDef.sparse !== undefined) {
        const TypedArrayIndices = WEBGL_COMPONENT_TYPES[accessorDef.sparse.indices.componentType];
        const sparseIndices = new TypedArrayIndices(sparseIndicesBV, accessorDef.sparse.indices.byteOffset || 0, accessorDef.sparse.count);
        const sparseValues = new TypedArray(sparseValuesBV, accessorDef.sparse.values.byteOffset || 0, accessorDef.sparse.count * itemSize);
        if (bufferView !== null) { bufferAttribute = bufferAttribute.clone(); bufferAttribute.array = bufferAttribute.array.slice(0); }
        for (let i = 0; i < sparseIndices.length; i++) {
          const idx = sparseIndices[i];
          bufferAttribute.setX(idx, sparseValues[i * itemSize]);
          if (itemSize >= 2) bufferAttribute.setY(idx, sparseValues[i * itemSize + 1]);
          if (itemSize >= 3) bufferAttribute.setZ(idx, sparseValues[i * itemSize + 2]);
          if (itemSize >= 4) bufferAttribute.setW(idx, sparseValues[i * itemSize + 3]);
        }
      }
      return bufferAttribute;
    }

    loadTexture(textureIndex) {
      const json = this.json, options = this.options;
      const textureDef = json.textures[textureIndex];
      const sourceDef = json.images[textureDef.source];
      let loader = this.textureLoader;
      if (sourceDef.uri) {
        const handler = options.manager.getHandler(sourceDef.uri);
        if (handler !== null) loader = handler;
      }
      return this.loadTextureImage(textureIndex, textureDef.source, loader);
    }

    loadTextureImage(textureIndex, sourceIndex, loader) {
      const parser = this, json = this.json;
      const textureDef = json.textures[textureIndex];
      const sourceDef = json.images[sourceIndex];
      const cacheKey = (sourceDef.uri || sourceDef.bufferView) + ':' + textureDef.sampler;
      if (this.textureCache[cacheKey]) return this.textureCache[cacheKey];

      const promise = this.loadImageSource(sourceIndex, loader).then(texture => {
        texture.flipY = false;
        if (textureDef.name) texture.name = textureDef.name;
        const samplers = json.samplers || {};
        const sampler = samplers[textureDef.sampler] || {};
        texture.magFilter = WEBGL_FILTERS[sampler.magFilter] || THREE.LinearFilter;
        texture.minFilter = WEBGL_FILTERS[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
        texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || THREE.RepeatWrapping;
        texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || THREE.RepeatWrapping;
        parser.associations.set(texture, { textures: textureIndex });
        return texture;
      }).catch(e => { console.error('GLTFLoader: Texture load error', sourceDef.uri, e); return null; });

      this.textureCache[cacheKey] = promise;
      return promise;
    }

    loadImageSource(sourceIndex, loader) {
      const parser = this, json = this.json, options = this.options;
      if (this.sourceCache[sourceIndex] !== undefined)
        return this.sourceCache[sourceIndex].then(t => t.clone());

      const sourceDef = json.images[sourceIndex];
      const URL = self.URL || self.webkitURL;
      let sourceURI = sourceDef.uri || '';
      let isObjectURL = false;

      const promise = Promise.resolve().then(async () => {
        if (sourceDef.bufferView !== undefined) {
          const bufferView = await parser.getDependency('bufferView', sourceDef.bufferView);
          const blob = new Blob([bufferView], { type: sourceDef.mimeType });
          sourceURI = URL.createObjectURL(blob);
          isObjectURL = true;
        } else if (sourceDef.uri) {
          sourceURI = THREE.LoaderUtils.resolveURL(sourceDef.uri, options.path);
        }
        return new Promise((resolve, reject) => {
          const onLoad = loader.isImageBitmapLoader
            ? ib => resolve(new THREE.CanvasTexture(ib))
            : resolve;
          loader.load(sourceURI, onLoad, undefined, reject);
        });
      }).then(texture => {
        if (isObjectURL) URL.revokeObjectURL(sourceURI);
        texture.userData.mimeType = sourceDef.mimeType || getImageURIMimeType(sourceDef.uri);
        return texture;
      }).catch(e => { console.error('GLTFLoader: Image load error', sourceURI, e); throw e; });

      this.sourceCache[sourceIndex] = promise;
      return promise.then(t => t.clone());
    }

    assignTexture(materialParams, mapName, mapDef, colorSpace) {
      return this.getDependency('texture', mapDef.index).then(texture => {
        if (!texture) return null;
        if (mapDef.texCoord !== undefined && mapDef.texCoord > 0) texture.channel = mapDef.texCoord;
        const transform = mapDef.extensions && mapDef.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM];
        if (transform) {
          const plugin = this.plugins[EXTENSIONS.KHR_TEXTURE_TRANSFORM];
          if (plugin) texture = plugin.extendTexture(texture, transform);
        }
        if (colorSpace !== undefined) texture.colorSpace = colorSpace;
        materialParams[mapName] = texture;
        return texture;
      });
    }

    assignFinalMaterial(mesh) {
      const geometry = mesh.geometry, material = mesh.material;
      const useDerivativeTangents = geometry.attributes.tangent === undefined;
      const useVertexColors = geometry.attributes.color !== undefined;
      const useFlatShading = geometry.attributes.normal === undefined;

      if (mesh.isPoints) {
        const ck = 'PointsMaterial:' + material.uuid;
        let pm = this.cache.get(ck);
        if (!pm) {
          pm = new THREE.PointsMaterial();
          THREE.Material.prototype.copy.call(pm, material);
          pm.color.copy(material.color); pm.map = material.map; pm.sizeAttenuation = false;
          this.cache.add(ck, pm);
        }
        mesh.material = pm;
      } else if (mesh.isLine) {
        const ck = 'LineBasicMaterial:' + material.uuid;
        let lm = this.cache.get(ck);
        if (!lm) {
          lm = new THREE.LineBasicMaterial();
          THREE.Material.prototype.copy.call(lm, material);
          lm.color.copy(material.color); lm.map = material.map;
          this.cache.add(ck, lm);
        }
        mesh.material = lm;
      }

      if (useDerivativeTangents || useVertexColors || useFlatShading) {
        let ck = 'ClonedMaterial:' + material.uuid + ':';
        if (useDerivativeTangents) ck += 'dt:';
        if (useVertexColors) ck += 'vc:';
        if (useFlatShading) ck += 'fs:';
        let cm = this.cache.get(ck);
        if (!cm) {
          cm = material.clone();
          if (useDerivativeTangents && cm.normalScale) cm.normalScale.y *= -1;
          if (useVertexColors) cm.vertexColors = true;
          if (useFlatShading) cm.flatShading = true;
          this.cache.add(ck, cm);
        }
        mesh.material = cm;
      }
    }

    getMaterialType() { return THREE.MeshStandardMaterial; }

    async loadMaterial(materialIndex) {
      const parser = this, json = this.json, materialDef = json.materials[materialIndex];
      let materialType;
      const materialParams = {};
      const materialExtensions = materialDef.extensions || {};
      const pending = [];

      if (materialExtensions[EXTENSIONS.KHR_MATERIALS_UNLIT]) {
        const ext = parser.plugins[EXTENSIONS.KHR_MATERIALS_UNLIT];
        materialType = ext.getMaterialType(materialIndex);
        pending.push(ext.extendParams(materialParams, materialDef, parser));
      } else if (materialExtensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS]) {
        const ext = parser.plugins[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS];
        materialType = ext.getMaterialType(materialIndex);
        pending.push(ext.extendParams(materialParams, materialDef, parser));
      } else {
        materialType = THREE.MeshStandardMaterial;
      }

      const metallicRoughness = materialDef.pbrMetallicRoughness || {};
      materialParams.color = new THREE.Color(1, 1, 1);
      materialParams.opacity = 1;

      if (Array.isArray(metallicRoughness.baseColorFactor)) {
        const a = metallicRoughness.baseColorFactor;
        materialParams.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
        materialParams.opacity = a[3];
      }
      if (metallicRoughness.baseColorTexture !== undefined)
        pending.push(parser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture, THREE.SRGBColorSpace));

      materialParams.metalness = metallicRoughness.metallicFactor !== undefined ? metallicRoughness.metallicFactor : 1;
      materialParams.roughness = metallicRoughness.roughnessFactor !== undefined ? metallicRoughness.roughnessFactor : 1;

      if (metallicRoughness.metallicRoughnessTexture !== undefined) {
        pending.push(parser.assignTexture(materialParams, 'metalnessMap', metallicRoughness.metallicRoughnessTexture));
        pending.push(parser.assignTexture(materialParams, 'roughnessMap', metallicRoughness.metallicRoughnessTexture));
      }

      const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;
      if (alphaMode === ALPHA_MODES.BLEND) {
        materialParams.transparent = true; materialParams.depthWrite = false;
      } else {
        materialParams.transparent = false;
        if (alphaMode === ALPHA_MODES.MASK)
          materialParams.alphaTest = materialDef.alphaCutoff !== undefined ? materialDef.alphaCutoff : 0.5;
      }

      if (materialDef.normalTexture !== undefined && materialType !== THREE.MeshBasicMaterial) {
        pending.push(parser.assignTexture(materialParams, 'normalMap', materialDef.normalTexture));
        materialParams.normalScale = new THREE.Vector2(1, 1);
        if (materialDef.normalTexture.scale !== undefined) {
          const s = materialDef.normalTexture.scale;
          materialParams.normalScale.set(s, s);
        }
      }
      if (materialDef.occlusionTexture !== undefined && materialType !== THREE.MeshBasicMaterial) {
        pending.push(parser.assignTexture(materialParams, 'aoMap', materialDef.occlusionTexture));
        if (materialDef.occlusionTexture.strength !== undefined)
          materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;
      }
      if (materialDef.emissiveFactor !== undefined && materialType !== THREE.MeshBasicMaterial) {
        const ef = materialDef.emissiveFactor;
        materialParams.emissive = new THREE.Color(ef[0], ef[1], ef[2]);
      }
      if (materialDef.emissiveTexture !== undefined && materialType !== THREE.MeshBasicMaterial)
        pending.push(parser.assignTexture(materialParams, 'emissiveMap', materialDef.emissiveTexture, THREE.SRGBColorSpace));

      await Promise.all(pending);
      const material = new materialType(materialParams);
      if (materialDef.name) material.name = materialDef.name;
      assignExtrasToUserData(material, materialDef);
      parser.associations.set(material, { materials: materialIndex });
      if (materialDef.extensions) addUnknownExtensionsToUserData(this.extensions, material, materialDef);
      return material;
    }

    async loadGeometries(primitives) {
      const parser = this, cache = this.primitiveCache;
      const pending = [];
      for (const primitive of primitives) {
        const cacheKey = createPrimitiveKey(primitive);
        if (cache[cacheKey]) {
          pending.push(cache[cacheKey].promise);
        } else {
          const gp = addPrimitiveAttributes(new THREE.BufferGeometry(), primitive, parser);
          cache[cacheKey] = { promise: gp };
          pending.push(gp);
        }
      }
      return Promise.all(pending);
    }

    async loadMesh(meshIndex) {
      const parser = this, json = this.json;
      const meshDef = json.meshes[meshIndex];
      const primitives = meshDef.primitives;
      const pending = [];
      for (const prim of primitives) {
        const mat = prim.material === undefined ? createDefaultMaterial(this.cache) : this.getDependency('material', prim.material);
        pending.push(mat);
      }
      pending.push(parser.loadGeometries(primitives));
      const results = await Promise.all(pending);
      const materials = results.slice(0, results.length - 1);
      const geometries = results[results.length - 1];
      const meshes = [];

      for (let i = 0; i < geometries.length; i++) {
        const geometry = geometries[i];
        const primitive = primitives[i];
        const material = materials[i];
        let mesh;
        if (primitive.mode === WEBGL_CONSTANTS.TRIANGLES || primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP || primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN || primitive.mode === undefined) {
          mesh = new THREE.Mesh(geometry, material);
          if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP) mesh.drawMode = THREE.TriangleStripDrawMode;
          if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN) mesh.drawMode = THREE.TriangleFanDrawMode;
        } else if (primitive.mode === WEBGL_CONSTANTS.LINES) {
          mesh = new THREE.LineSegments(geometry, material);
        } else if (primitive.mode === WEBGL_CONSTANTS.LINE_STRIP) {
          mesh = new THREE.Line(geometry, material);
        } else if (primitive.mode === WEBGL_CONSTANTS.LINE_LOOP) {
          mesh = new THREE.LineLoop(geometry, material);
        } else if (primitive.mode === WEBGL_CONSTANTS.POINTS) {
          mesh = new THREE.Points(geometry, material);
        } else {
          throw new Error('GLTFLoader: Unsupported primitive mode: ' + primitive.mode);
        }
        if (Object.keys(mesh.geometry.morphAttributes).length > 0) updateMorphTargets(mesh, meshDef);
        mesh.name = parser.createUniqueName(meshDef.name || ('mesh_' + meshIndex));
        assignExtrasToUserData(mesh, meshDef);
        if (primitive.extensions) addUnknownExtensionsToUserData(this.extensions, mesh, primitive);
        parser.assignFinalMaterial(mesh);
        meshes.push(mesh);
      }

      if (meshes.length === 1) return meshes[0];
      const group = new THREE.Group();
      group.name = parser.createUniqueName(meshDef.name || ('mesh_' + meshIndex));
      for (const m of meshes) group.add(m);
      return group;
    }

    async loadCamera(cameraIndex) {
      const cameraDef = this.json.cameras[cameraIndex];
      let camera;
      if (cameraDef.type === 'perspective') {
        const p = cameraDef.perspective;
        camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(p.yfov), p.aspectRatio || 1, p.znear || 1, p.zfar || 2e6);
      } else if (cameraDef.type === 'orthographic') {
        const o = cameraDef.orthographic;
        camera = new THREE.OrthographicCamera(-o.xmag, o.xmag, o.ymag, -o.ymag, o.znear, o.zfar);
      }
      if (cameraDef.name) camera.name = this.createUniqueName(cameraDef.name);
      assignExtrasToUserData(camera, cameraDef);
      return camera;
    }

    async loadSkin(skinIndex) {
      const skinDef = this.json.skins[skinIndex];
      const pending = (skinDef.joints || []).map(j => this.getDependency('node', j));
      if (skinDef.inverseBindMatrices !== undefined) pending.push(this.getDependency('accessor', skinDef.inverseBindMatrices));
      else pending.push(null);
      const results = await Promise.all(pending);
      const ibm = results.pop();
      const bones = [], boneInverses = [];
      results.forEach((node, i) => {
        if (node) {
          bones.push(node);
          const m = new THREE.Matrix4();
          if (ibm !== null) m.fromArray(ibm.array, i * 16);
          boneInverses.push(m);
        }
      });
      return new THREE.Skeleton(bones, boneInverses);
    }

    async loadAnimation(animationIndex) {
      const json = this.json;
      const animDef = json.animations[animationIndex];
      const name = animDef.name || ('animation_' + animationIndex);
      const pendingNodes = [], pendingInputs = [], pendingOutputs = [];
      const pendingSamplers = [], pendingTargets = [];
      for (const channel of animDef.channels) {
        const sampler = animDef.samplers[channel.sampler];
        pendingNodes.push(this.getDependency('node', channel.target.node));
        pendingInputs.push(this.getDependency('accessor', sampler.input));
        pendingOutputs.push(this.getDependency('accessor', sampler.output));
        pendingSamplers.push(sampler);
        pendingTargets.push(channel.target);
      }
      const [nodes, inputs, outputs] = await Promise.all([
        Promise.all(pendingNodes), Promise.all(pendingInputs), Promise.all(pendingOutputs)
      ]);
      const tracks = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]; const target = pendingTargets[i]; const sampler = pendingSamplers[i];
        if (!node) continue;
        const TypedKFT = PATH_PROPERTIES[target.path] === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        const interpolation = sampler.interpolation ? INTERPOLATION[sampler.interpolation] : THREE.InterpolateLinear;
        const nodeName = node.name || node.uuid;
        if (target.path === 'weights') {
          node.traverse(o => {
            if (o.morphTargetInfluences)
              tracks.push(new THREE.NumberKeyframeTrack(o.name + '.morphTargetInfluences', inputs[i].array, outputs[i].array, interpolation));
          });
        } else {
          tracks.push(new TypedKFT(nodeName + '.' + PATH_PROPERTIES[target.path], inputs[i].array, outputs[i].array, interpolation));
        }
      }
      return new THREE.AnimationClip(name, undefined, tracks);
    }

    createUniqueName(originalName) {
      const sanitized = THREE.PropertyBinding.sanitizeNodeName(originalName || '');
      let name = sanitized;
      for (let i = 1; this.nodeNamesUsed[name]; i++) name = sanitized + '_' + i;
      this.nodeNamesUsed[name] = true;
      return name;
    }

    async loadNode(nodeIndex) {
      const json = this.json, parser = this;
      const nodeDef = json.nodes[nodeIndex];
      const nodePending = parser._invokeOne(ext => ext.createNodeMesh && ext.createNodeMesh(nodeIndex));
      const childDefs = nodeDef.children || [];
      const childPending = childDefs.map(id => parser.getDependency('node', id));
      const skinPending = nodeDef.skin === undefined ? Promise.resolve(null) : parser.getDependency('skin', nodeDef.skin);
      const [node, children] = await Promise.all([nodePending, Promise.all(childPending), skinPending]);
      node.name = parser.createUniqueName(nodeDef.name || '');
      assignExtrasToUserData(node, nodeDef);
      if (nodeDef.extensions) addUnknownExtensionsToUserData(this.extensions, node, nodeDef);
      if (nodeDef.matrix !== undefined) {
        node.applyMatrix4(new THREE.Matrix4().fromArray(nodeDef.matrix));
      } else {
        if (nodeDef.translation) node.position.fromArray(nodeDef.translation);
        if (nodeDef.rotation) node.quaternion.fromArray(nodeDef.rotation);
        if (nodeDef.scale) node.scale.fromArray(nodeDef.scale);
      }
      parser.associations.set(node, { nodes: nodeIndex });
      for (const child of children) node.add(child);
      return node;
    }

    createNodeMesh(nodeIndex) {
      const json = this.json, parser = this;
      const nodeDef = json.nodes[nodeIndex];
      if (nodeDef.mesh === undefined) return null;
      return parser.getDependency('mesh', nodeDef.mesh).then(mesh => {
        if (nodeDef.weights !== undefined) {
          mesh.traverse(o => {
            if (!o.isMesh) return;
            for (let i = 0; i < nodeDef.weights.length; i++) o.morphTargetInfluences[i] = nodeDef.weights[i];
          });
        }
        return mesh;
      });
    }

    async loadScene(sceneIndex) {
      const json = this.json, parser = this;
      const sceneDef = json.scenes[sceneIndex];
      const scene = new THREE.Group();
      if (sceneDef.name) scene.name = parser.createUniqueName(sceneDef.name);
      assignExtrasToUserData(scene, sceneDef);
      if (sceneDef.extensions) addUnknownExtensionsToUserData(this.extensions, scene, sceneDef);
      const nodes = await Promise.all((sceneDef.nodes || []).map(id => parser.getDependency('node', id)));
      for (const node of nodes) if (node) scene.add(node);
      return scene;
    }
  }

  // ── GLTFLoader ──
  class GLTFLoader extends THREE.Loader {
    constructor(manager) {
      super(manager);
      this.dracoLoader = null;
      this.pluginCallbacks = [];
      this.register(p => new GLTFMaterialsUnlitExtension(p));
      this.register(p => new GLTFTextureBasisUExtension(p));
      this.register(p => new GLTFTextureWebPExtension(p));
      this.register(p => new GLTFMaterialsPbrSpecularGlossinessExtension(p));
      this.register(p => new GLTFDracoMeshCompressionExtension(p));
      this.register(p => new GLTFTextureTransformExtension(p));
      this.register(p => new GLTFMeshQuantizationExtension(p));
    }

    register(callback) {
      if (!this.pluginCallbacks.includes(callback)) this.pluginCallbacks.push(callback);
      return this;
    }

    load(url, onLoad, onProgress, onError) {
      const scope = this;
      let resourcePath = this.resourcePath || this.path || THREE.LoaderUtils.extractUrlBase(url);
      this.manager.itemStart(url);
      const _onError = e => { if (onError) onError(e); else console.error(e); scope.manager.itemError(url); scope.manager.itemEnd(url); };
      const loader = new THREE.FileLoader(this.manager);
      loader.setPath(this.path);
      loader.setResponseType('arraybuffer');
      loader.setRequestHeader(this.requestHeader);
      loader.setWithCredentials(this.withCredentials);
      loader.load(url,
        data => { try { scope.parse(data, resourcePath, gltf => { onLoad(gltf); scope.manager.itemEnd(url); }, _onError); } catch (e) { _onError(e); } },
        onProgress, _onError
      );
    }

    parse(data, path, onLoad, onError) {
      let content; const extensions = {};
      if (typeof data === 'string') {
        content = data;
      } else {
        const magic = THREE.LoaderUtils.decodeText(new Uint8Array(data, 0, 4));
        if (magic === BINARY_EXTENSION_HEADER_MAGIC) {
          try { extensions[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(data); }
          catch (e) { if (onError) onError(e); return; }
          content = extensions[EXTENSIONS.KHR_BINARY_GLTF].content;
        } else {
          content = THREE.LoaderUtils.decodeText(new Uint8Array(data));
        }
      }

      const json = JSON.parse(content);
      if (!json.asset || json.asset.version[0] < 2) { if (onError) onError(new Error('GLTFLoader: Unsupported asset.')); return; }

      const parser = new GLTFParser(json, {
        path: path || this.resourcePath || '',
        crossOrigin: this.crossOrigin,
        requestHeader: this.requestHeader,
        manager: this.manager
      });

      const plugins = {};
      for (const cb of this.pluginCallbacks) {
        const plugin = cb(parser);
        plugins[plugin.name] = plugin;
        parser.plugins[plugin.name] = plugin;
      }
      if (extensions[EXTENSIONS.KHR_BINARY_GLTF]) {
        plugins[EXTENSIONS.KHR_BINARY_GLTF] = extensions[EXTENSIONS.KHR_BINARY_GLTF];
        parser.plugins[EXTENSIONS.KHR_BINARY_GLTF] = extensions[EXTENSIONS.KHR_BINARY_GLTF];
      }
      parser.parse(onLoad, onError);
    }
  }

  THREE.GLTFLoader = GLTFLoader;

})();
