import * as THREE from 'three';
import { WeatherShader } from '../shaders/WeatherShader.js';

export class Weather {
    constructor(scene, sceneManager) {
        this.scene = scene;
        this.sceneManager = sceneManager; // 添加对场景管理器的引用
        this.system = null;
        this.params = { speed: 10.0, type: 1 }; // 默认状态
        this.init();
    }

    init() {
        const particleCount = 10000;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const randoms = [];

        for (let i = 0; i < particleCount; i++) {
            positions.push((Math.random() - 0.5) * 100, Math.random() * 50, (Math.random() - 0.5) * 100);
            randoms.push(Math.random());
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 1));

        const material = new THREE.ShaderMaterial({
            vertexShader: WeatherShader.vertex,
            fragmentShader: WeatherShader.fragment,
            uniforms: {
                uTime: { value: 0 },
                uSpeed: { value: this.params.speed },
                uType: { value: this.params.type },
                uColor: { value: new THREE.Color(0x8899aa) }
            },
            transparent: true,
            depthWrite: false
        });

        this.system = new THREE.Points(geometry, material);
        this.scene.add(this.system);
    }

    // 切换天气模式接口
    setWeatherType(type) {
        this.params.type = type;
        this.system.material.uniforms.uType.value = type;
        
        // 根据天气类型更新天空效果
        if (this.sceneManager && this.sceneManager.setSkyByWeatherType) {
            this.sceneManager.setSkyByWeatherType(type);
        }
        
        if (type === 2) { // 雪
            this.params.speed = 2.0;
            this.system.material.uniforms.uColor.value.set(0xffffff);
        } else if (type === 1) { // 雨
            this.params.speed = 20.0;
            this.system.material.uniforms.uColor.value.set(0x8899aa);
        } else if (type === 0) { // 晴朗（添加晴朗天气支持）
            this.params.speed = 0.0; // 晴朗天气时停止粒子运动
            this.system.material.uniforms.uColor.value.set(0x8899aa);
        }
    }

    update(time) {
        if (this.system) {
            this.system.material.uniforms.uTime.value = time;
            this.system.material.uniforms.uSpeed.value = this.params.speed;
        }
    }
}