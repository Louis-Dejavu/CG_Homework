import { WorldMath } from '../MathUtils.js';

export const TerrainShader = {
    vertex: `
        uniform float uTime;
        uniform float uScale;
        uniform float uAmplitude;
        
        varying float vHeight;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        ${WorldMath.glslFunction}

        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            
            float h = getWorldHeight(worldPosition.xz, uScale, uAmplitude);
            // 只有非道路区域(幅度正常)才加波浪，防止路面抖动
            if(uAmplitude < 0.5 && abs(worldPosition.x) > 10.0) {
                h += sin(worldPosition.x * 0.5 + uTime) * 0.2;
            }
            
            worldPosition.y = h;
            vHeight = h;
            vWorldPos = worldPosition.xyz;

            // 法线计算
            float offset = 0.1;
            float hX = getWorldHeight(worldPosition.xz + vec2(offset, 0.0), uScale, uAmplitude);
            float hZ = getWorldHeight(worldPosition.xz + vec2(0.0, offset), uScale, uAmplitude);
            vec3 tX = vec3(offset, hX - h, 0.0);
            vec3 tZ = vec3(0.0, hZ - h, offset);
            vNormal = normalize(cross(tZ, tX));

            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    
    fragment: `
        uniform sampler2D uTexture; 
        uniform float uTextureScale;
        
        varying float vHeight;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        uniform vec3 fogColor;
        uniform float fogDensity;

        void main() {
            // 1. 基础纹理采样
            vec2 uv = vWorldPos.xz * uTextureScale;
            vec4 texColor = texture2D(uTexture, uv);
            
            // === 🔥 道路绘制逻辑 ===
            float dist = abs(vWorldPos.x);
            float roadHalfWidth = 6.0;
            
            // 混合因子：0表示完全在路上，1表示完全在草地
            float roadMix = smoothstep(roadHalfWidth - 1.0, roadHalfWidth + 2.0, dist);
            
            // 道路颜色 (深灰沥青)
            vec3 asphaltColor = vec3(0.15, 0.15, 0.17);
            
            // 车道线 (白色虚线)
            // 位于路中间 (dist < 0.5)，且在 Z 轴上周期重复
            if (dist < 0.15 && mod(vWorldPos.z, 6.0) < 3.0) {
                asphaltColor = vec3(0.9, 0.9, 0.9); // 白线
            }

            // 混合草地和道路
            vec3 surfaceColor = mix(asphaltColor, texColor.rgb, roadMix);

            // 2. 光照计算
            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
            float diff = max(dot(vNormal, lightDir), 0.4); 
            
            // 3. 最终颜色
            vec3 finalColor = surfaceColor * diff;

            // 4. 雾效
            float depth = length(vWorldPos.xz - cameraPosition.xz);
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * depth * depth );
            vec3 safeFogColor = vec3(0.53, 0.8, 0.92); 

            gl_FragColor = vec4(mix(finalColor, safeFogColor, fogFactor), 1.0);
        }
    `
};