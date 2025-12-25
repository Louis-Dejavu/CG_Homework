import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor() {
        // 1. 初始化场景 (⚠️ 必须加 new)
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

        // 2. 初始化相机
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 20);

        // 3. 初始化渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true; // 开启阴影
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // 4. 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        // 5. === 灯光系统 ===
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        // 平行光 (模拟太阳)
        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.dirLight.position.set(-50, 100, -50);
        this.dirLight.castShadow = true;
        
        // 优化阴影范围
        this.dirLight.shadow.camera.left = -100;
        this.dirLight.shadow.camera.right = 100;
        this.dirLight.shadow.camera.top = 100;
        this.dirLight.shadow.camera.bottom = -100;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.scene.add(this.dirLight);

        // 6. 可视化太阳
        const sunGeo = new THREE.SphereGeometry(20, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(this.sunMesh);

        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    // 更新太阳和光的位置
    updateSun(targetPos) {
        const offset = new THREE.Vector3(-80, 60, -80); 
        this.sunMesh.position.copy(targetPos).add(offset);
        
        // 让光跟随太阳
        this.dirLight.position.copy(this.sunMesh.position);
        
        // 让光照向车
        this.dirLight.target.position.copy(targetPos);
        this.dirLight.target.updateMatrixWorld();
    }

    setBackground(colorHex) {
        this.scene.background.set(colorHex);
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