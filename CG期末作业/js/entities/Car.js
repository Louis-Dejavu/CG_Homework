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
        
        // --- 车辆动力学参数 ---
        this.velocity = 0;
        this.speed = 0.0;
        this.turnSpeed = 0.03;
        this.maxSpeed = 1.8;       // 最大速度
        this.friction = 0.97;      // 摩擦力
        this.acceleration = 0.03;  // 加速度

        // 地形倾斜参数
        this.tiltIntensity = 0.5;      // 倾斜强度 (0-1)
        this.smoothFactor = 0.1;       // 平滑过渡系数

        // 键盘状态
        this.keys = { w: false, a: false, s: false, d: false };

        // 存储四个轮子的引用 (用于旋转动画)
        this.wheels = { fl: null, fr: null, rl: null, rr: null };
        
        // 新增：车辆方向累积角度（用于四元数旋转）
        this.currentRotationY = 0;

        this.initModel();
        this.initInput();
        this.addLights();
    }

    initModel() {
        // 1. 初始化加载器
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();

        // 2. 设置 Draco 解码路径
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        
        // 3. 绑定解码器
        loader.setDRACOLoader(dracoLoader);

        // 4. 加载法拉利模型
        loader.load('./assets/ferrari.glb', (gltf) => {
            const model = gltf.scene;
            
            // --- 模型调整 ---
            model.scale.set(1.15, 1.15, 1.15); 
            // 使用四元数设置初始旋转（180度绕Y轴）
            model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            this.currentRotationY = Math.PI; // 同步初始角度
            
            // 遍历子物体，开启阴影并查找轮子
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // 尝试多种可能的轮子名称匹配模式
            const wheelNamePatterns = [
                { key: 'fl', patterns: ['wheel_FL', 'front_left_wheel', 'frontLeft', 'FL', 'frontLeftWheel'] },
                { key: 'fr', patterns: ['wheel_FR', 'front_right_wheel', 'frontRight', 'FR', 'frontRightWheel'] },
                { key: 'rl', patterns: ['wheel_RL', 'rear_left_wheel', 'rearLeft', 'RL', 'rearLeftWheel'] },
                { key: 'rr', patterns: ['wheel_RR', 'rear_right_wheel', 'rearRight', 'RR', 'rearRightWheel'] }
            ];
            
            // 重置轮子对象
            this.wheels = { fl: null, fr: null, rl: null, rr: null };

            // 添加以下代码使车辆支持材质替换
            model.traverse((child) => {
                if (child.isMesh) {
                    // 保留原有阴影设置
                    child.castShadow = true;
                    child.receiveShadow = true;
            
                    // 为每个材质添加阴影贴图支持
                    if (child.material) {
                        child.material.onBeforeCompile = (shader) => {
                            shader.uniforms.shadowMap = { value: null };
                            shader.uniforms.sunDirection = { value: new THREE.Vector3() };
                            shader.uniforms.sunMatrix = { value: new THREE.Matrix4() };
                    
                            // 在顶点着色器中添加阴影坐标计算
                            shader.vertexShader = shader.vertexShader.replace(
                                'void main() {',
                                `
                                varying vec4 vShadowCoord;
                                uniform mat4 sunMatrix;
                                void main() {
                                    vShadowCoord = sunMatrix * modelMatrix * vec4(position, 1.0);
                                `
                            );
                    
                            // 在片段着色器中添加阴影计算
                            shader.fragmentShader = shader.fragmentShader.replace(
                                'void main() {',
                                `
                                varying vec4 vShadowCoord;
                                uniform sampler2D shadowMap;
                                uniform vec3 sunDirection;
                                
                                float getShadowFactor(sampler2D map, vec4 coord, float bias) {
                                    float shadow = 0.0;
                                    vec3 projCoord = coord.xyz / coord.w;
                                    projCoord = projCoord * 0.5 + 0.5; // 转换到[0,1]范围
                                    
                                    // 检查坐标是否有效
                                    if(projCoord.x < 0.0 || projCoord.x > 1.0 || 
                                       projCoord.y < 0.0 || projCoord.y > 1.0 || 
                                       projCoord.z > 1.0) {
                                        return 0.0;
                                    }
                                    
                                    // PCF软化阴影边缘
                                    vec2 texelSize = 1.0 / vec2(textureSize(map, 0));
                                    for(int x = -1; x <= 1; x++) {
                                        for(int y = -1; y <= 1; y++) {
                                            vec2 offset = vec2(x, y) * texelSize;
                                            float depth = texture2D(map, projCoord.xy + offset).r;
                                            shadow += (projCoord.z - bias) > depth ? 1.0 : 0.0;
                                        }
                                    }
                                    return shadow / 9.0;
                                }
                                
                                void main() {
                                    // 计算动态bias，基于表面法线和光照方向
                                    vec3 safeSunDir = length(sunDirection) > 0.001 ? 
                                        normalize(sunDirection) : vec3(0.0, 1.0, 0.0);
                                    float normalBias = 0.001 * tan(acos(max(dot(normalize(vNormal), safeSunDir), 0.0)));
                                    float bias = max(0.001, normalBias);
                                    
                                    float shadow = getShadowFactor(shadowMap, vShadowCoord, bias) * 0.7;
                                `
                            );
                            
                            // 添加顶点法线varying变量
                            shader.vertexShader = shader.vertexShader.replace(
                                'varying vec4 vShadowCoord;',
                                'varying vec4 vShadowCoord;'
                            );
                            
                            // 在顶点着色器中传递法线
                            shader.vertexShader = shader.vertexShader.replace(
                                'vShadowCoord = sunMatrix * modelMatrix * vec4(position, 1.0);',
                                'vShadowCoord = sunMatrix * modelMatrix * vec4(position, 1.0);\n                                vNormal = normal;'
                            );
                    
                            // 修改原有的gl_FragColor赋值行
                            if (shader.fragmentShader.includes('gl_FragColor = ')) {
                                shader.fragmentShader = shader.fragmentShader.replace(
                                    'gl_FragColor = ',
                                    'gl_FragColor.rgb *= (1.0 - shadow); gl_FragColor = '
                                );
                            } else if (shader.fragmentShader.includes('out_FragColor = ')) {
                                // 处理现代着色器格式
                                shader.fragmentShader = shader.fragmentShader.replace(
                                    'out_FragColor = ',
                                    'out_FragColor.rgb *= (1.0 - shadow); out_FragColor = '
                                );
                            } else {
                                // 如果没有找到直接的赋值，在main函数结束前添加
                                shader.fragmentShader = shader.fragmentShader.replace(
                                    '}',
                                    '\n    gl_FragColor.rgb *= (1.0 - shadow);\n}'
                                );
                            }
                        };
                    }
                }
            });
            
            // 尝试多种匹配模式
            model.traverse((child) => {
                if (child.isMesh) {
                    for (const { key, patterns } of wheelNamePatterns) {
                        for (const pattern of patterns) {
                            if (child.name.includes(pattern) || 
                                child.name.toLowerCase().includes(pattern.toLowerCase())) {
                                if (!this.wheels[key]) {
                                    this.wheels[key] = child;
                                }
                                break;
                            }
                        }
                    }
                }
            });

            this.mesh.add(model);
        }, 
        undefined, 
        (error) => {
            console.error('模型加载失败:', error);
            this.createFallbackCar();
        });

        this.scene.add(this.mesh);
    }

    createFallbackCar() {
        const bodyGeo = new THREE.BoxGeometry(2, 1, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.7;
        body.castShadow = true;
        this.mesh.add(body);
    }

    addLights() {
        const spotLight = new THREE.SpotLight(0xffffff, 100, 80, 0.6, 0.5);
        spotLight.position.set(0, 2, 0);
        spotLight.target.position.set(0, 1, 20);
        
        this.mesh.add(spotLight);
        this.mesh.add(spotLight.target);
    }

    initInput() {
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
    }

    // 计算地形法线（基于高度函数）
    calculateTerrainNormal(x, z, scale, amplitude, delta = 0.1) {
        // 计算四个点的高度
        const h1 = WorldMath.getHeight(x, z, scale, amplitude);
        const h2 = WorldMath.getHeight(x + delta, z, scale, amplitude);
        const h3 = WorldMath.getHeight(x, z + delta, scale, amplitude);
        
        // 计算梯度（高度差除以距离）
        const dx = (h2 - h1) / delta;
        const dz = (h3 - h1) / delta;
        
        // 法线向量：(-dx, 1, -dz) 然后归一化
        const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
        
        return normal;
    }

    update(terrainParams) {
        // 1. --- 物理运动逻辑 ---
        if (this.keys.w) this.speed += this.acceleration;
        if (this.keys.s) this.speed -= this.acceleration;
        
        this.speed = Math.min(Math.max(this.speed, -this.maxSpeed), this.maxSpeed);
        this.speed *= this.friction;

        // 应用位移（注意：translateZ使用局部坐标系，所以旋转后方向正确）
        this.mesh.translateZ(this.speed);

        // 2. --- 转向（使用四元数）---
        // 只有车动的时候才能转
        if (Math.abs(this.speed) > 0.04) {
            const turnDirection = this.speed > 0 ? 1 : -1;
            
            // 计算旋转增量
            let rotationDelta = 0;
            if (this.keys.a) rotationDelta += this.turnSpeed * turnDirection;
            if (this.keys.d) rotationDelta -= this.turnSpeed * turnDirection;
            
            // 累积Y轴旋转角度（允许无限累积）
            this.currentRotationY += rotationDelta;
            
            // 可选：将角度标准化到0-2π范围，避免过大数值
            this.currentRotationY = this.currentRotationY % (Math.PI * 2);
        }

        // 3. --- 轮子动画 ---
        const wheelRotation = this.speed;
        
        if (this.wheels.fl) this.wheels.fl.rotation.x -= wheelRotation;
        if (this.wheels.fr) this.wheels.fr.rotation.x -= wheelRotation;
        if (this.wheels.rl) this.wheels.rl.rotation.x -= wheelRotation;
        if (this.wheels.rr) this.wheels.rr.rotation.x -= wheelRotation;

        // 4. --- 地形贴合 (修复浮空问题) ---
        const x = this.mesh.position.x;
        const z = this.mesh.position.z;
        
        // 计算地形在车辆位置的精确高度
        const terrainHeight = WorldMath.getHeight(x, z, terrainParams.scale, terrainParams.amplitude);
        
        // 减小Y轴偏移值，使车辆更贴近地面
        // 0.45-0.5应该是一个更合适的值，具体取决于车辆模型大小
        const yOffset = 0.25;
        const targetY = terrainHeight + yOffset;
        
        // 增加平滑插值系数，提高贴合速度，使车辆更快响应地形变化
        this.mesh.position.y += (targetY - this.mesh.position.y) * 0.4;

        // 确保车辆不会陷入地面
        if (this.mesh.position.y < terrainHeight + 0.35) {
            this.mesh.position.y = terrainHeight + 0.35;
        }
        // 5. --- 地形倾斜效果 ---
        const terrainNormal = this.calculateTerrainNormal(
            x, z, 
            terrainParams.scale, 
            terrainParams.amplitude
        );
    
        // 创建基础旋转四元数（仅Y轴旋转，即车辆朝向）
        const baseQuaternion = new THREE.Quaternion();
        baseQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.currentRotationY);

        // 车辆当前的前方向（基于基础旋转）
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(baseQuaternion);

        // 计算目标上方向：地形法线
        const targetUp = terrainNormal.clone().normalize();

        // 计算目标前方向：将基础前方向投影到地形平面上
        // 首先计算地形平面的法线（即targetUp）与前方向的叉积得到右方向
        const right = new THREE.Vector3().crossVectors(targetUp, forward).normalize();

        // 重新计算前方向：右方向与地形法线的叉积，确保与前方向正交
        const newForward = new THREE.Vector3().crossVectors(right, targetUp).normalize();

        // 构建目标旋转矩阵（从局部坐标系到世界坐标系）
        const targetRotationMatrix = new THREE.Matrix4();
        targetRotationMatrix.makeBasis(right, targetUp, newForward);

        // 从矩阵中提取目标四元数
        const targetQuaternion = new THREE.Quaternion();
        targetQuaternion.setFromRotationMatrix(targetRotationMatrix);

        // 平滑过渡到目标旋转
        this.mesh.quaternion.slerp(targetQuaternion, this.smoothFactor);
    }
}