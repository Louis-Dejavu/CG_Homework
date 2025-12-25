import * as THREE from 'three';
// 引入 GLTF 模型加载器
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 引入 Draco 解码器 (用于解压压缩过的模型)
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { WorldMath } from '../MathUtils.js';

export class Car {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        // 🔥 测试代码：加一个巨大的红球标记车的位置
    // const debugGeo = new THREE.SphereGeometry(2, 16, 16);
    // const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    // const debugMesh = new THREE.Mesh(debugGeo, debugMat);
    // debugMesh.position.y = 2; // 举高点
    // this.mesh.add(debugMesh);

        
        // --- 车辆动力学参数 ---
        this.velocity = 0;
        this.speed = 0.0;
        this.turnSpeed = 0.03;
        this.maxSpeed = 1.8;       // 最大速度
        this.friction = 0.97;      // 摩擦力
        this.acceleration = 0.03;  // 加速度

        // 键盘状态
        this.keys = { w: false, a: false, s: false, d: false };

        // 存储四个轮子的引用 (用于旋转动画)
        this.wheels = { fl: null, fr: null, rl: null, rr: null };

        this.initModel();
        this.initInput();
        this.addLights();
    }

    initModel() {
        // 1. 初始化加载器
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();

        // 2. 设置 Draco 解码路径 (必不可少，否则会报 No DRACOLoader 错误)
        // 使用 CDN 链接确保可以在线加载
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        
        // 3. 绑定解码器
        loader.setDRACOLoader(dracoLoader);

        // 4. 加载法拉利模型
        loader.load('./assets/ferrari.glb', (gltf) => {
            const model = gltf.scene;
            
            // --- 模型调整 ---
            // 缩小尺寸 (根据模型实际大小调整)
            model.scale.set(1.15, 1.15, 1.15); 
            // 旋转180度，让车头朝前
            model.rotation.y = Math.PI; 
            
            // 遍历子物体，寻找轮子并开启阴影
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // 根据名字寻找轮子 (法拉利模型的特定命名)
                    if (child.name.includes('wheel_FL')) this.wheels.fl = child;
                    if (child.name.includes('wheel_FR')) this.wheels.fr = child;
                    if (child.name.includes('wheel_RL')) this.wheels.rl = child;
                    if (child.name.includes('wheel_RR')) this.wheels.rr = child;
                }
            });

            this.mesh.add(model);
        }, 
        undefined, 
        (error) => {
            console.error('模型加载失败:', error);
            // 失败兜底方案：显示一个红色方块车，保证程序不崩
            this.createFallbackCar();
        });

        this.scene.add(this.mesh);
    }

    // 兜底用的方块车 (万一模型加载失败)
    createFallbackCar() {
        const bodyGeo = new THREE.BoxGeometry(2, 1, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.7;
        body.castShadow = true;
        this.mesh.add(body);
    }

    addLights() {
        // 车头灯 (聚光灯)
        const spotLight = new THREE.SpotLight(0xffffff, 100, 80, 0.6, 0.5);
        spotLight.position.set(0, 2, 0);       // 灯在车顶位置
        spotLight.target.position.set(0, 1, 20); // 照向前方远处
        
        this.mesh.add(spotLight);
        this.mesh.add(spotLight.target);
    }

    initInput() {
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
    }

    update(terrainParams) {
        // 1. --- 物理运动逻辑 ---
        if (this.keys.w) this.speed += this.acceleration;
        if (this.keys.s) this.speed -= this.acceleration;
        
        // 摩擦力与速度限制
        this.speed = Math.min(Math.max(this.speed, -this.maxSpeed), this.maxSpeed);
        this.speed *= this.friction;

        // 应用位移
        this.mesh.translateZ(this.speed);

        // 转向 (只有车动的时候才能转)
        if (Math.abs(this.speed) > 0.1) {
            const turnDirection = this.speed > 0 ? 1 : -1;
            if (this.keys.a) this.mesh.rotation.y += this.turnSpeed * turnDirection;
            if (this.keys.d) this.mesh.rotation.y -= this.turnSpeed * turnDirection;
        }

        // 2. --- 轮子动画 ---
        // 轮子转速跟车速挂钩
        const wheelRotation = this.speed * 0.3; 
        if (this.wheels.fl) this.wheels.fl.rotation.x -= wheelRotation;
        if (this.wheels.fr) this.wheels.fr.rotation.x -= wheelRotation;
        if (this.wheels.rl) this.wheels.rl.rotation.x -= wheelRotation;
        if (this.wheels.rr) this.wheels.rr.rotation.x -= wheelRotation;

        // 3. --- 地形贴合 (关键修正) ---
        const x = this.mesh.position.x;
        const z = this.mesh.position.z;
        
        // 计算当前坐标下的地形高度 (包含道路平整逻辑)
        const terrainHeight = WorldMath.getHeight(x, z, terrainParams.scale, terrainParams.amplitude);
        
        // 🔥 悬挂高度修正：把车抬高一点，防止陷入地面或路面 🔥
        // 0.65 是根据法拉利模型大小测试出的合适数值
        const yOffset = 0.65; 
        const targetY = terrainHeight + yOffset;
        
        // 平滑插值 (Lerp) 避免瞬间跳动
        this.mesh.position.y += (targetY - this.mesh.position.y) * 0.2;
    }
}