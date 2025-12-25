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

        this.initTexturesAndMesh();
    }

    // 备用方案：生成噪点纹理 (模拟泥土/沙砾质感)
    createNoiseTexture(colorHex) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 填充底色
        ctx.fillStyle = colorHex;
        ctx.fillRect(0, 0, size, size);

        // 添加随机噪点
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 20; // 噪点强度
            data[i] = Math.min(255, Math.max(0, data[i] + noise));     // R
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise)); // G
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise)); // B
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
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
                    // 如果失败，替换为生成的噪点图
                    const fallback = this.createNoiseTexture(fallbackColor);
                    // 重新更新材质
                    if(this.mesh) {
                        this.setType(this.currentType || 'Grass');
                    }
                    return fallback;
                }
            );
        };

        // 加载三种贴图 (使用 Three.js 官方示例图片)
        this.textures = {
            // 草地 (备用色：深绿)
            'Grass': loadWithFallback(
                'https://threejs.org/examples/textures/terrain/grasslight-big.jpg', 
                '#2d5a27'
            ),
            // 岩石 (备用色：深灰)
            'Mountain': loadWithFallback(
                'https://threejs.org/examples/textures/planets/moon_1024.jpg', 
                '#555555'
            ),
            // 湖泊 (备用色：深蓝)
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

    init() {
        const geometry = new THREE.PlaneGeometry(200, 200, 150, 150);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.ShaderMaterial({
            vertexShader: TerrainShader.vertex,
            fragmentShader: TerrainShader.fragment,
            uniforms: {
                uTime: { value: 0 },
                uScale: { value: this.params.scale },
                uAmplitude: { value: this.params.amplitude },
                uTexture: { value: this.textures['Grass'] },
                uTextureScale: { value: 0.1 },
                fogColor: { value: new THREE.Color(0x87CEEB) },
                fogDensity: { value: 0.015 }
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
    }

    update(carPos, time) {
        if (this.mesh) {
            this.mesh.position.set(carPos.x, 0, carPos.z);
            this.mesh.material.uniforms.uTime.value = time;
            if(this.scene.fog) {
                 this.mesh.material.uniforms.fogColor.value.copy(this.scene.fog.color);
            }
        }
    }
}