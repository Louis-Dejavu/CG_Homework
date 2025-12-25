// js/main.js
import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { SceneManager } from './SceneManager.js';
import { Terrain } from './entities/Terrain.js';
import { Weather } from './entities/Weather.js'; // 假设你保留了 Weather.js
import { Car } from './entities/Car.js';

const sceneManager = new SceneManager();
const clock = new THREE.Clock();

const terrain = new Terrain(sceneManager.scene);
const weather = new Weather(sceneManager.scene); // 需保留之前的天气文件
const car = new Car(sceneManager.scene);

// GUI 设置
const gui = new GUI({ title: '控制台' });
const config = { 
    terrainType: 'Grass',
    weatherType: 1
};

// 地形切换
gui.add(config, 'terrainType', ['Grass', 'Mountain', 'Lake'])
   .name('⛰️ 地貌风格')
   .onChange(val => {
       terrain.setType(val);
       // 切换背景色增加氛围
       if(val === 'Lake') sceneManager.setBackground(0xaaccff);
       else if(val === 'Mountain') sceneManager.setBackground(0xeeeeee);
       else sceneManager.setBackground(0x87CEEB);
   });

// 天气切换
gui.add(config, 'weatherType', { 'Clear': 0, 'Rain': 1, 'Snow': 2 })
   .name('🌧️ 天气')
   .onChange(val => {
       weather.setWeatherType(val);
       // 晴天雾淡，雨天雾浓
       sceneManager.scene.fog.density = (val === 0) ? 0.005 : 0.015;
   });

// 禁用鼠标控制，改为第三人称跟随
sceneManager.controls.enabled = false;

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // 1. 更新实体
    car.update(terrain.params);
    terrain.update(car.mesh.position, time);
    weather.update(time); // 确保 weather 也有 update 方法，且跟随车的位置
    if(weather.system) weather.system.position.copy(car.mesh.position).setY(0);

    // 2. 更新太阳位置 (让它跟着车，保持在远处)
    sceneManager.updateSun(car.mesh.position);

    // 3. 第三人称相机
    const relativeOffset = new THREE.Vector3(0, 6, -12); // 相机在车后上方
    const cameraTarget = relativeOffset.applyMatrix4(car.mesh.matrixWorld);
    sceneManager.camera.position.lerp(cameraTarget, 0.1); // 平滑跟随
    sceneManager.camera.lookAt(car.mesh.position);

    sceneManager.render();
}

animate();