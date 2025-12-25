// js/RayTracer.js
import * as THREE from 'three';

export class RayTracer {
    constructor(scene, car, terrain) {
        this.scene = scene;
        this.car = car;
        this.terrain = terrain;
        this.directionalLight = null; // 存储方向光引用
        
        // 创建双缓冲阴影贴图系统
        this.resolution = 512;
        this.shadowMapFront = this.createShadowTexture();
        this.shadowMapBack = this.createShadowTexture();
        this.currentFront = true;
        
        // 创建临时场景
        this.tempScene = new THREE.Scene();
        
        // 创建阴影材质
        this.shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.FrontSide
        });

        // 初始化默认阴影贴图（全白，表示无阴影）
        this.initDefaultShadowMap();

        // 查找场景中的方向光
        this.findDirectionalLight();
    }
    
    createShadowTexture() {
        const texture = new THREE.WebGLRenderTarget(
            this.resolution, 
            this.resolution,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
            }
        );
        texture.texture.generateMipmaps = false;
        return texture;
    }

    initDefaultShadowMap() {
        // 创建空白纹理数据
        const emptyData = new Float32Array(this.resolution * this.resolution * 4).fill(1.0);
        this.defaultShadowMap = new THREE.DataTexture(
            emptyData,
            this.resolution,
            this.resolution,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.defaultShadowMap.needsUpdate = true;

        // 初始化地形材质的阴影贴图
        if (this.terrain && this.terrain.mesh && this.terrain.mesh.material) {
            this.terrain.mesh.material.uniforms.shadowMap.value = this.defaultShadowMap;
        }
    }

    findDirectionalLight() {
        // 在场景中查找方向光
        this.scene.traverse((child) => {
            if (child.isDirectionalLight) {
                this.directionalLight = child;
            }
        });
    }
    
    getActiveShadowMap() {
        return this.currentFront ? this.shadowMapFront.texture : this.shadowMapBack.texture;
    }
    
    update(renderer, camera, sunPos) {
        // 参数有效性检查
        if (!renderer || !sunPos) {
            console.warn('RayTracer.update: Missing required parameters');
            return;
        }

        // 确保我们有方向光引用
        if (!this.directionalLight) {
            this.findDirectionalLight();
        }

        // 太阳位置验证
        const carPos = this.car?.mesh?.position;
        if (!carPos) {
            console.warn('RayTracer.update: Car position not available');
            return;
        }
        
        // 计算太阳方向（从地面指向太阳）
        const sunDir = new THREE.Vector3().subVectors(sunPos, carPos);
        if (sunDir.length() < 0.0001) {
            sunDir.set(0, 1, 0); // 默认向上
        } else {
            sunDir.normalize();
        }
        
        // 设置阴影相机
        const shadowCamera = this.setupShadowCamera(sunPos, carPos);
        
        const sunMatrix = new THREE.Matrix4()
            .multiply(shadowCamera.projectionMatrix)
            .multiply(shadowCamera.matrixWorldInverse);
  
        if (this.terrain?.mesh?.material?.uniforms?.sunMatrix) {
            this.terrain.mesh.material.uniforms.sunMatrix.value.copy(sunMatrix);
        }

        // 新增：传递到车辆
        this.updateVehicleShadowMatrix(sunMatrix);
        
        // 交换缓冲区
        this.currentFront = !this.currentFront;
        const writeTarget = this.currentFront ? this.shadowMapFront : this.shadowMapBack;
        
        try {
            // 渲染阴影到非活动缓冲区
            renderer.setRenderTarget(writeTarget);
            renderer.clear();
            this.renderShadowPass(renderer, shadowCamera);
            
            // 恢复默认渲染目标
            renderer.setRenderTarget(null);
            
            // 更新材质和方向光
            this.updateMaterials(sunDir);
            this.updateDirectionalLight(sunDir);
        } catch (error) {
            console.error('Error in RayTracer.update:', error);
            // 确保恢复渲染目标
            renderer.setRenderTarget(null);
        }
    }

    // 新增方法
    updateVehicleShadowMatrix(sunMatrix) {
        if (!this.car?.mesh) return;
    
        this.car.mesh.traverse((child) => {
            if (child.isMesh && child.material?.uniforms?.sunMatrix) {
                child.material.uniforms.sunMatrix.value.copy(sunMatrix);
            }
        });
    }
    
    setupShadowCamera(sunPos, carPos) {
        const shadowCamera = new THREE.OrthographicCamera(
            -40, 40, 40, -40, 0.1, 300
        );
        
        // 安全偏移
        const safeSunPos = sunPos.clone();
        if (Math.abs(safeSunPos.y - carPos.y) < 1.0) {
            safeSunPos.y += 1.0;
        }
        
        shadowCamera.position.copy(safeSunPos);
        shadowCamera.lookAt(carPos);
        shadowCamera.updateMatrixWorld(true);
        return shadowCamera;
    }
    
    renderShadowPass(renderer, shadowCamera) {
        // 清空临时场景
        this.tempScene.children = [];
        
        try {
            // 克隆地形（仅渲染背面）
            if (this.terrain && this.terrain.mesh) {
                const terrainClone = this.terrain.mesh.clone();
                terrainClone.material = this.shadowMaterial;
                this.tempScene.add(terrainClone);
            }
            
            // 克隆小车（仅渲染背面）
            if (this.car && this.car.mesh) {
                const carClone = this.car.mesh.clone();
                carClone.material = this.shadowMaterial;
                this.tempScene.add(carClone);
            }
            
            // 渲染到当前非活动缓冲区
            renderer.render(this.tempScene, shadowCamera);
        } catch (error) {
            console.error('Error in renderShadowPass:', error);
        }
    }
    
    updateMaterials(sunDir) {
        try {
            // 获取活动阴影贴图
            const activeTexture = this.getActiveShadowMap();
            
            // 更新地形材质 - 使用setter方法
            if (this.terrain && typeof this.terrain.setShadowMap === 'function') {
                this.terrain.setShadowMap(activeTexture);
            }
            
            if (this.terrain && typeof this.terrain.setSunDirection === 'function') {
                this.terrain.setSunDirection(sunDir);
            }
            
            // 直接更新作为后备
            if (this.terrain && this.terrain.mesh && this.terrain.mesh.material) {
                const material = this.terrain.mesh.material;
                if (material.uniforms) {
                    material.uniforms.sunDirection.value.copy(sunDir);
                    material.uniforms.shadowMap.value = activeTexture;
                    material.needsUpdate = true;
                }
            }

            // 更新车辆材质的部分添加更健壮的错误处理
            if (this.car && this.car.mesh) {
                this.car.mesh.traverse((child) => {
                    if (child.isMesh && child.material) {
                        try {
                            if (child.material.uniforms) {
                                // 确保每个uniform存在，如果不存在则创建
                                if (!child.material.uniforms.shadowMap) {
                                    child.material.uniforms.shadowMap = { value: null };
                                }
                                if (!child.material.uniforms.sunDirection) {
                                    child.material.uniforms.sunDirection = { value: new THREE.Vector3() };
                                }
                                if (!child.material.uniforms.sunMatrix) {
                                    child.material.uniforms.sunMatrix = { value: new THREE.Matrix4() };
                                }
                                
                                // 更新uniforms值
                                child.material.uniforms.shadowMap.value = activeTexture;
                                child.material.uniforms.sunDirection.value.copy(sunDir);
                                
                                // 尝试从地形材质复制sunMatrix，或者使用默认矩阵
                                if (this.terrain && this.terrain.mesh && this.terrain.mesh.material && 
                                    this.terrain.mesh.material.uniforms && this.terrain.mesh.material.uniforms.sunMatrix) {
                                    child.material.uniforms.sunMatrix.value.copy(this.terrain.mesh.material.uniforms.sunMatrix.value);
                                }
                                
                                child.material.needsUpdate = true;
                            }
                        } catch (err) {
                            console.warn('Failed to update car mesh material uniforms:', err);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error in updateMaterials:', error);
        }
    }

    updateDirectionalLight(sunDir) {
        try {
            // 同步方向光位置
            if (this.directionalLight) {
                // 将方向光位置设置为从原点沿着sunDir方向
                const lightDistance = 1000; // 足够远的距离
                this.directionalLight.position.copy(sunDir).multiplyScalar(lightDistance);
                this.directionalLight.lookAt(0, 0, 0); // 指向场景中心
                this.directionalLight.updateMatrixWorld(true);
            }
        } catch (error) {
            console.error('Error in updateDirectionalLight:', error);
        }
    }
    
    clearShadowMaps() {
        try {
            // 使用默认空白纹理
            if (this.terrain && typeof this.terrain.setShadowMap === 'function') {
                this.terrain.setShadowMap(this.defaultShadowMap);
            }
            
            // 直接设置作为后备
            if (this.terrain && this.terrain.mesh && this.terrain.mesh.material) {
                const material = this.terrain.mesh.material;
                if (material.uniforms) {
                    material.uniforms.shadowMap.value = this.defaultShadowMap;
                    material.needsUpdate = true;
                }
            }
        } catch (error) {
            console.error('Error in clearShadowMaps:', error);
        }
    }
}