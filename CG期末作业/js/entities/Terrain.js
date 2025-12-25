import * as THREE from 'three';
import { TerrainShader } from '../shaders/TerrainShader.js';

export class Terrain {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.textures = {};
        
        this.params = {
            scale: 1.0,
            amplitude: 1.0,
            textureScale: 0.1
        };

        // 在constructor中添加
        this.heightMap = this.generateHeightMapTexture(); 

        // 添加光线追踪相关属性
        this.shadowMap = null;
        this.sunDirection = new THREE.Vector3(-1, 1, -1).normalize();
        this.enableRaytracing = true; // 启用光线追踪

        this.initTexturesAndMesh();
    }

    // 新增方法（添加在类内部）
    generateHeightMapTexture() {
        const size = 512;
        const data = new Float32Array(size * size);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const x = (i / size) * 200 - 100;
                const z = (j / size) * 200 - 100;
                data[i * size + j] = this.calculateHeight(x, z, this.params.scale, this.params.amplitude) / 20.0;
            }
        }
        const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
        texture.needsUpdate = true;
        return texture;
    }

    // 获取世界坐标（用于光线追踪）
    getWorldPosition(u, v) {
        if (!this.mesh) return null;
        
        // 根据UV坐标计算世界坐标
        const size = 200; // 地形大小
        const x = (u - 0.5) * size;
        const z = (v - 0.5) * size;
        
        // 计算高度
        const y = this.getHeightAtPosition(x, z);
        
        return new THREE.Vector3(x, y, z);
    }

    // 获取指定位置的高度
    getHeightAtPosition(x, z) {
        // 使用与着色器相同的高度函数
        return this.calculateHeight(x, z, this.params.scale, this.params.amplitude);
    }

    // 计算高度（与WorldMath.getHeight保持一致）
    calculateHeight(x, z, scale, amplitude) {
        let h = 0.0;
        h += Math.sin(x * 0.02 * scale) * 5.0 * amplitude;
        h += Math.cos(z * 0.02 * scale) * 5.0 * amplitude;
        h += Math.sin(x * 0.1 * scale) * 1.0 * amplitude;
        h += Math.cos(z * 0.15 * scale) * 1.0 * amplitude;
        
        // 道路挖空效果
        const roadHalfWidth = 6.0;
        const blendWidth = 4.0;
        const dist = Math.abs(x);
        
        let roadMask = (dist - roadHalfWidth) / blendWidth;
        roadMask = Math.max(0, Math.min(1, roadMask));
        roadMask = roadMask * roadMask * (3 - 2 * roadMask);

        return h * roadMask;
    }

    // 设置阴影贴图
    setShadowMap(shadowMap) {
        this.shadowMap = shadowMap;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.uniforms.shadowMap.value = shadowMap;
            this.mesh.material.needsUpdate = true;
        }
    }

    // 设置太阳方向
    setSunDirection(direction) {
        this.sunDirection.copy(direction).normalize();
        if (this.mesh && this.mesh.material) {
            this.mesh.material.uniforms.sunDirection.value = this.sunDirection;
        }
    }

    // 启用/禁用光线追踪
    setRaytracingEnabled(enabled) {
        this.enableRaytracing = enabled;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.uniforms.enableRaytracing.value = enabled;
        }
    }

    initTexturesAndMesh() {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');

        // 辅助加载函数：失败了就用噪点图顶替
        const loadWithFallback = (url, fallbackColor) => {
            return loader.load(url, 
                (tex) => {
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                },
                undefined,
                () => {
                    console.warn(`贴图加载失败: ${url}，已切换为备用纹理`);
                    const fallback = this.createNoiseTexture(fallbackColor);
                    if(this.mesh) {
                        this.setType(this.currentType || 'Grass');
                    }
                    return fallback;
                }
            );
        };

        // 加载三种贴图
        this.textures = {
            'Grass': loadWithFallback(
                'https://threejs.org/examples/textures/terrain/grasslight-big.jpg', 
                '#2d5a27'
            ),
            'Mountain': loadWithFallback(
                'https://threejs.org/examples/textures/planets/moon_1024.jpg', 
                '#555555'
            ),
            'Lake': loadWithFallback(
                'https://threejs.org/examples/textures/water.jpg', 
                '#004488'
            )
        };
        
        // 预设如果图片还没加载完，先用备用图占位
        if (!this.textures['Grass'].image) this.textures['Grass'] = this.createNoiseTexture('#2d5a27');
        if (!this.textures['Mountain'].image) this.textures['Mountain'] = this.createNoiseTexture('#555555');
        if (!this.textures['Lake'].image) this.textures['Lake'] = this.createNoiseTexture('#004488');

        this.init();
    }

    // 备用方案：生成噪点纹理
    createNoiseTexture(colorHex) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = colorHex;
        ctx.fillRect(0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 20;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    init() {
        const geometry = new THREE.PlaneGeometry(200, 200, 150, 150);
        geometry.rotateX(-Math.PI / 2);

        // 创建默认的阴影贴图（全白，表示无阴影）
        const shadowData = new Float32Array(256 * 256 * 4);
        for (let i = 0; i < shadowData.length; i += 4) {
            shadowData[i] = 1.0;     // R
            shadowData[i + 1] = 1.0; // G
            shadowData[i + 2] = 1.0; // B
            shadowData[i + 3] = 1.0; // A
        }
        
        const defaultShadowMap = new THREE.DataTexture(
            shadowData,
            256,
            256,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        defaultShadowMap.needsUpdate = true;

        const material = new THREE.ShaderMaterial({
            vertexShader: TerrainShader.vertex,
            fragmentShader: TerrainShader.fragment,
            uniforms: {
                uTime: { value: 0 },
                uScale: { value: this.params.scale },
                uAmplitude: { value: this.params.amplitude },
                uTexture: { value: this.textures['Grass'] },
                uTextureScale: { value: 0.1 },
                shadowMap: { value: defaultShadowMap }, // 使用默认阴影贴图初始化
                sunDirection: { value: this.sunDirection }, // 太阳方向
                enableRaytracing: { value: this.enableRaytracing }, // 是否启用光线追踪
                shadowIntensity: { value: 0.7 }, // 阴影强度
                fogColor: { value: new THREE.Color(0x87CEEB) },
                fogDensity: { value: 0.015 },
                uHeightMap: { value: this.heightMap },           // 新增
                uHeightMapScale: { value: 20.0 },                // 新增
                uHeightMapOffset: { value: 0.0 },                // 新增
                sunMatrix: { value: new THREE.Matrix4() }        // 新增
            },
            fog: true
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
        
        this.currentType = 'Grass';
    }

    setType(type) {
        if (!this.mesh) return;
        this.currentType = type;
        const mat = this.mesh.material;

        if (type === 'Grass') {
            this.params.scale = 1.0;
            this.params.amplitude = 1.0;
            mat.uniforms.uTexture.value = this.textures['Grass'];
            mat.uniforms.uTextureScale.value = 0.1;
        } else if (type === 'Mountain') {
            this.params.scale = 1.5;
            this.params.amplitude = 4.0;
            mat.uniforms.uTexture.value = this.textures['Mountain'];
            mat.uniforms.uTextureScale.value = 0.05;
        } else if (type === 'Lake') {
            this.params.scale = 0.5;
            this.params.amplitude = 0.2;
            mat.uniforms.uTexture.value = this.textures['Lake'];
            mat.uniforms.uTextureScale.value = 0.2;
        }

        mat.uniforms.uScale.value = this.params.scale;
        mat.uniforms.uAmplitude.value = this.params.amplitude;
        mat.needsUpdate = true; // 确保材质更新
    }

    update(carPos, time) {
        if (this.mesh) {
            this.mesh.position.set(carPos.x, 0, carPos.z);
            this.mesh.material.uniforms.uTime.value = time;
            if(this.scene.fog) {
                 this.mesh.material.uniforms.fogColor.value.copy(this.scene.fog.color);
                 this.mesh.material.uniforms.fogDensity.value = this.scene.fog.density;
            }
        }
    }

    // 添加raycast方法以支持光线追踪器的检测
    raycast(raycaster, intersects) {
        if (!this.mesh) return;
        
        // 使用平面的raycast方法
        this.mesh.raycast(raycaster, intersects);
    }
}