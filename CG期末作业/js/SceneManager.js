import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor(rayTracer = null) {
        // 1. 初始化场景
        this.scene = new THREE.Scene();
        this.rayTracer = rayTracer;
        
        // 核心属性：控制背景贴图的整体亮度
        // 这是实现从白天到黑夜平滑过渡的关键
        this.scene.backgroundIntensity = 1.0;

        // 雾效初始化 (默认白天蓝色)
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);
        
        // 状态记录变量
        this.isNight = false;        
        this.currentWeatherType = 0; 

        // 初始化天空盒
        this.skyboxTextures = {};
        this.loadSkyboxTextures();

        // 2. 初始化相机
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 20);

        // 3. 初始化渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // 开启物理正确的灯光衰减，会让渐变更柔和
        this.renderer.useLegacyLights = false; 
        document.body.appendChild(this.renderer.domElement);

        // 4. 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        // 5. === 灯光系统 ===
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // 稍微调暗环境光，交由平行光主导
        this.scene.add(ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.dirLight.position.set(-50, 100, -50);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.camera.left = -100;
        this.dirLight.shadow.camera.right = 100;
        this.dirLight.shadow.camera.top = 100;
        this.dirLight.shadow.camera.bottom = -100;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.scene.add(this.dirLight);

        // 6. 太阳模型
        const sunGeo = new THREE.SphereGeometry(5, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(this.sunMesh);

        // 7. 月亮模型
        const moonGeo = new THREE.SphereGeometry(3, 32, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.scene.add(this.moonMesh);

        this.moonLightIntensity = 0.3;
        this.rotationAngle = 0;
        this.rotationSpeed = 0.001;

        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    // 🔥 优化点 1：高清、细腻的星空生成逻辑
    createStarTexture() {
        // 1. 提高分辨率到 2048，让像素点显得更小
        const size = 2048; 
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 2. 绘制深邃背景 (添加微弱的蓝紫色渐变，不再是死黑)
        const gradient = ctx.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, "#000000"); 
        gradient.addColorStop(1, "#0a0a1a"); // 底部微蓝
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        // 3. 绘制细腻的星星
        // 增加星星数量，但减小体积
        const starCount = 1500; 
        ctx.fillStyle = "#ffffff";
        
        for (let i = 0; i < starCount; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            
            // 关键：半径极小化，模拟真实星空
            // 大部分星星是 0.3-0.8 像素，只有极少数亮星是 1.5 像素
            const baseSize = Math.random();
            const radius = baseSize > 0.98 ? 1.5 : (0.3 + Math.random() * 0.5);
            
            // 透明度变化，制造远近感
            const alpha = 0.2 + Math.random() * 0.8;
            
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // 为少数大星星增加一点点光晕
            if (baseSize > 0.99) {
                ctx.globalAlpha = 0.1;
                ctx.beginPath();
                ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        // 避免纹理生成 mipmaps 导致模糊，保持锐利
        texture.minFilter = THREE.LinearFilter; 
        return texture;
    }

    loadSkyboxTextures() {
        const loader = new THREE.CubeTextureLoader();
        const load6 = (path) => [path, path, path, path, path, path];

        const starTexture = this.createStarTexture();

        this.skyboxTextures = {
            clear: loader.load(load6('sky_picture/day-clear.png')),
            rain:  loader.load(load6('sky_picture/day-rain.png')),
            snow:  loader.load(load6('sky_picture/day-snow.png')),
            night: starTexture 
        };
        
        Object.values(this.skyboxTextures).forEach(texture => {
            if (texture.isCubeTexture) {
                texture.mapping = THREE.CubeRefractionMapping;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
        });
        
        this.scene.background = this.skyboxTextures.clear;
    }

    setSkyByWeatherType(weatherType) {
        this.currentWeatherType = weatherType;
        if (this.isNight) {
             this.updateFogForNight(weatherType);
             return; 
        }
        this.applyDaySky(weatherType);
    }

    applyDaySky(weatherType) {
        if (!this.skyboxTextures) return;

        switch (weatherType) {
            case 0: // Clear
                this.scene.background = this.skyboxTextures.clear;
                this.scene.fog.color.set(0x87CEEB);
                this.dirLight.intensity = 2.0;
                break;
            case 1: // Rain
                this.scene.background = this.skyboxTextures.rain;
                this.scene.fog.color.set(0x666677);
                this.dirLight.intensity = 0.8;
                break;
            case 2: // Snow
                this.scene.background = this.skyboxTextures.snow;
                this.scene.fog.color.set(0xddddff);
                this.dirLight.intensity = 1.0;
                break;
        }
    }

    updateFogForNight(weatherType) {
        this.scene.background = this.skyboxTextures.night;
        this.scene.background.mapping = THREE.EquirectangularReflectionMapping; 

        if (weatherType === 0) this.scene.fog.color.set(0x050510);
        else if (weatherType === 1) this.scene.fog.color.set(0x020205);
        else this.scene.fog.color.set(0x101020);
    }

    updateSun(targetPos) {
        this.rotationAngle += this.rotationSpeed;
    
        const radius = 100;
        const x = targetPos.x + radius * Math.cos(this.rotationAngle);
        const y = targetPos.y + radius * Math.sin(this.rotationAngle);
        const z = targetPos.z;
    
        this.sunMesh.position.set(x, y, z);
        
        const moonAngle = this.rotationAngle + Math.PI;
        const moonX = targetPos.x + radius * Math.cos(moonAngle);
        const moonY = targetPos.y + radius * Math.sin(moonAngle);
        this.moonMesh.position.set(moonX, moonY, z);
    
        // 计算太阳相对于地平线的高度 (y差值)
        const sunHeight = y - targetPos.y;
        
        // 🔥 优化点 2：根据太阳高度计算“黄昏渐变因子”
        // 当太阳高度在 50 到 -10 之间时，进行亮度渐变
        // blendFactor: 1.0 (白天/亮) -> 0.0 (切换瞬间/黑) -> 1.0 (深夜/亮)
        let blendFactor = 1.0;
        const transitionRange = 50.0; // 过渡区域的高度范围

        if (sunHeight > 0) {
            // 白天 -> 黄昏：随着太阳降低，亮度从 1 降到 0.2
            blendFactor = Math.min(1.0, Math.max(0.1, sunHeight / transitionRange));
        } else {
            // 黄昏 -> 深夜：随着太阳潜入地下，亮度从 0.2 恢复到 1.0 (显示星星)
            blendFactor = Math.min(1.0, Math.max(0.1, Math.abs(sunHeight) / transitionRange));
        }

        // 应用渐变到背景强度 (这是平滑过渡的关键!)
        this.scene.backgroundIntensity = blendFactor;

        // 昼夜判断
        const isDayTime = sunHeight > 0; 

        if (isDayTime) {
            if (this.isNight) {
                this.isNight = false; 
                this.applyDaySky(this.currentWeatherType); 
            }

            const lightPos = new THREE.Vector3(x, y, z);
            this.dirLight.position.copy(lightPos);
            
            // 太阳光强度也跟随渐变，避免突然变黑
            this.dirLight.intensity = 1.0 + blendFactor; 

        } else {
            if (!this.isNight) {
                this.isNight = true; 
                this.updateFogForNight(this.currentWeatherType); 
            }

            const moonLightPos = new THREE.Vector3(moonX, moonY, z);
            this.dirLight.position.copy(moonLightPos);
            // 月光也稍微做一点渐入
            this.dirLight.intensity = this.moonLightIntensity * blendFactor;
        }
    
        this.dirLight.target.position.copy(targetPos);
        this.dirLight.target.updateMatrixWorld();
    }

    setSunAngle(angle) {
        this.rotationAngle = (angle % 2) * Math.PI;
    }

    stopSunAnimation() { this.rotationSpeed = 0; }
    startSunAnimation() { this.rotationSpeed = 0.001; }

    setBackground(colorHex) {
        if (!this.scene.background || !(this.scene.background instanceof THREE.CubeTexture)) {
            this.scene.background = new THREE.Color(colorHex);
        }
        this.scene.fog.color.set(colorHex);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}