// js/shaders/WeatherShader.js

// ⚠️ 必须要有 export const
export const WeatherShader = {
    vertex: `
        uniform float uTime;
        uniform float uSpeed;
        uniform float uType; // 0:None, 1:Rain, 2:Snow
        attribute float aRandom;
        
        void main() {
            vec3 pos = position;
            
            // 只有当下雨或下雪时才计算运动
            if(uType > 0.5) {
                // 计算下落距离： 时间 * 速度 + 随机偏移
                float fallDist = uTime * uSpeed + aRandom * 50.0;
                
                // 循环逻辑：让粒子在 0 到 50 的高度区间内循环
                // y轴向下是负数，所以这里我们做一点数学变换让它看起来像从天而降
                pos.y = 50.0 - mod(fallDist, 50.0);
                
                // 如果是雪 (uType == 2)，添加水平飘动
                if(uType > 1.5) {
                    pos.x += sin(uTime + aRandom * 10.0) * 2.0;
                    pos.z += cos(uTime + aRandom * 10.0) * 2.0;
                }
            } else {
                // 晴天把粒子藏到地下
                pos.y = -100.0; 
            }

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            
            // 粒子大小随距离衰减 (透视效果)
            gl_PointSize = (uType > 1.5 ? 10.0 : 4.0) * (20.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragment: `
        uniform vec3 uColor;
        
        void main() {
            // 将粒子绘制成圆形
            vec2 coord = gl_PointCoord - vec2(0.5);
            if(length(coord) > 0.5) discard; // 丢弃圆形以外的像素
            
            gl_FragColor = vec4(uColor, 0.6); // 0.6 透明度
        }
    `
};