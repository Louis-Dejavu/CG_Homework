// js/main.js
import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { SceneManager } from './SceneManager.js';
import { Terrain } from './entities/Terrain.js';
import { Weather } from './entities/Weather.js';
import { Car } from './entities/Car.js';
import { RayTracer } from './RayTracer.js';
// 初始化场景管理器
const sceneManager = new SceneManager();
const clock = new THREE.Clock();

// 初始化实体
const terrain = new Terrain(sceneManager.scene);
const weather = new Weather(sceneManager.scene, sceneManager);
const car = new Car(sceneManager.scene);
const rayTracer = new RayTracer(sceneManager.scene, car, terrain);

// 将RayTracer实例传递给SceneManager
sceneManager.rayTracer = rayTracer;

// GUI 设置
const gui = new GUI({ title: '控制台' });
const config = { 
    terrainType: 'Grass',
    weatherType: 1,
    maxSpeed: car.maxSpeed,
    cameraLocked: true,
    sunAngle: 0.25, // 默认值，对应太阳在天空中较高位置
    sunAutoRotate: true // 太阳是否自动旋转
};

// 地形切换
gui.add(config, 'terrainType', ['Grass', 'Mountain', 'Lake'])
   .name('⛰️ 地貌风格')
   .onChange(val => {
       terrain.setType(val);
   });

// 天气切换
gui.add(config, 'weatherType', { 'Clear': 0, 'Rain': 1, 'Snow': 2 })
   .name('🌧️ 天气')
   .onChange(val => {
       weather.setWeatherType(val);
       // 晴天雾淡，雨天雾浓
       sceneManager.scene.fog.density = (val === 0) ? 0.005 : 0.015;
       // 直接调用SceneManager中的setSkyByWeatherType方法
       sceneManager.setSkyByWeatherType(val);
   });
   

// 速度控制滑动条
gui.add(config, 'maxSpeed', 0, 2, 0.05)
   .name('🚗 最大速度')
   .onChange(val => {
       car.maxSpeed = val;
   });

// 相机锁定/解锁切换
gui.add(config, 'cameraLocked')
   .name('🔒 锁定相机')
   .onChange(val => {
       if (val) {
           // 锁定相机：禁用OrbitControls
           sceneManager.controls.enabled = false;
       } else {
           // 解锁相机：启用OrbitControls，并设置旋转中心为汽车
           sceneManager.controls.enabled = true;
           // 设置OrbitControls的目标为汽车位置
           sceneManager.controls.target.copy(car.mesh.position);
       }
   });

// 太阳时间控制滑动条
gui.add(config, 'sunAngle', 0, 2, 0.01)
   .name('🕒 时间')
   .onChange(val => {
       // 设置太阳角度
       sceneManager.setSunAngle(val);
       // 当手动调整角度时，暂停自动旋转
       config.sunAutoRotate = false;
       sceneManager.stopSunAnimation();
   });

// 太阳自动旋转切换
gui.add(config, 'sunAutoRotate')
   .name('🔄 太阳自动旋转')
   .onChange(val => {
       if (val) {
           sceneManager.startSunAnimation();
       } else {
           sceneManager.stopSunAnimation();
       }
   });

// 初始状态：禁用鼠标控制，默认锁定为第三人称跟随
sceneManager.controls.enabled = false;

// 初始化时设置默认天气的天空效果和太阳位置
sceneManager.setSkyByWeatherType(config.weatherType);
sceneManager.setSunAngle(config.sunAngle); // 设置初始太阳角度

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // 1. 更新实体
    car.update(terrain.params);
    terrain.update(car.mesh.position, time);
    weather.update(time);
    if(weather.system) weather.system.position.copy(car.mesh.position).setY(0);

    // 2. 更新太阳位置
    sceneManager.updateSun(car.mesh.position);
    
    // 3. 更新光线跟踪阴影
    rayTracer.update(sceneManager.renderer, sceneManager.camera, sceneManager.sunMesh.position);

    // 4. 相机控制
    if (config.cameraLocked) {
        // 第三人称相机跟随（锁定状态）
        const relativeOffset = new THREE.Vector3(0, 6, -12); // 相机在车后上方
        const cameraTarget = relativeOffset.applyMatrix4(car.mesh.matrixWorld);
        sceneManager.camera.position.lerp(cameraTarget, 0.1); // 平滑跟随
        sceneManager.camera.lookAt(car.mesh.position);
    } else {
        // 自由相机状态，更新控制器，并始终将旋转中心设置为汽车
        sceneManager.controls.target.copy(car.mesh.position);
        sceneManager.controls.update();
    }

    sceneManager.render();
}

animate();
