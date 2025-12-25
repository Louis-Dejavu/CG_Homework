import { WorldMath } from '../MathUtils.js';

export const TerrainShader = {
    vertex: `
        uniform float uTime;
        uniform float uScale;
        uniform float uAmplitude;
        uniform sampler2D uHeightMap;
        // Vertex Shader顶部uniform区域添加：
        uniform mat4 sunMatrix; 
        
        varying float vHeight;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        varying vec4 vShadowCoord;

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
            vShadowCoord = sunMatrix * vec4(vWorldPos, 1.0); 
            
            // 计算UV坐标用于阴影贴图采样
            vUv = position.xz / 200.0 + 0.5; // 将世界坐标转换为0-1的UV坐标

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
        uniform sampler2D uHeightMap;
        uniform float uHeightMapScale;
        uniform float uHeightMapOffset;
        uniform mat4 sunMatrix;
        
        // 光线追踪阴影相关uniforms
        uniform sampler2D shadowMap;
        uniform vec3 sunDirection;
        uniform bool enableRaytracing;
        uniform float shadowIntensity;

        varying vec4 vShadowCoord;
        
        varying float vHeight;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        uniform vec3 fogColor;
        uniform float fogDensity;

        
        float getTerrainHeight(vec2 pos) {
            vec2 uv = pos / 200.0 + 0.5;
            return texture2D(uHeightMap, uv).r * uHeightMapScale + uHeightMapOffset;
        }

        // 改进的阴影计算函数 - 通过高度图访问真实地形数据
        float calculateSimpleShadow(vec3 worldPos, vec3 sunDir) {
            // 基础计算：法线与太阳方向的夹角
            float NdotL = max(dot(normalize(vNormal), normalize(sunDir)), 0.0);
            
            // 初始化阴影值为0（无阴影）
            float shadow = 0.0;
            
            // 只有当太阳在地平线以上时才计算阴影
            if (sunDir.y > 0.1) {
                vec3 normalizedSunDir = normalize(sunDir);
                
                // 增加采样精度
                const int steps = 25; // 增加步数以提高精度
                float maxStepDistance = 40.0; // 增加最大采样距离
                float stepLength = maxStepDistance / float(steps);
                
                // 初始化遮挡检测标志
                bool isOccluded = false;
                float occlusionConfidence = 0.0;
                
                // 解决光线步进中的自阴影问题：添加法线偏移防止表面痤疮
                vec3 rayStart = worldPos + vNormal * 0.1; // 法线偏移，避免自遮挡
                
                // 计算当前点高度（从高度图获取）
                float currentHeight = rayStart.y;
                
                // 沿光源方向步进，检测真实地形高度
                for (int i = 1; i <= steps; i++) {
                    // 计算采样点位置 - 沿光源方向
                    vec3 samplePos = rayStart + normalizedSunDir * float(i) * stepLength;
                    
                    // 从高度图获取采样点的实际地形高度
                    float actualHeight = getTerrainHeight(samplePos.xz);
                    
                    // 计算光线到达该点时的理论高度
                    float theoreticalHeight = currentHeight + float(i) * stepLength * normalizedSunDir.y;
                    
                    // 关键修复：如果实际地形高度高于光线的理论高度，则存在遮挡
                    // 添加一个小的bias来避免自遮挡问题
                    float bias = 0.1;
                    if (actualHeight > theoreticalHeight + bias) {
                        // 计算遮挡置信度，基于高度差
                        float heightDiff = actualHeight - theoreticalHeight;
                        occlusionConfidence = max(occlusionConfidence, heightDiff * 0.2);
                        
                        // 如果高度差超过一定阈值，认为被遮挡
                        if (heightDiff > 0.5) {
                            isOccluded = true;
                            break;
                        }
                    }
                }
                
                // 基于遮挡检测结果设置阴影值
                if (isOccluded) {
                    shadow = 0.8;
                } else {
                    // 即使没有完全遮挡，也要考虑地形起伏的影响
                    shadow = 0.2 * (1.0 - NdotL) + occlusionConfidence;
                }
                
                // 背光面额外处理
                if (NdotL < 0.2) {
                    shadow = max(shadow, 0.6);
                }
            } else {
                // 太阳在水平线以下时，全部区域有较重阴影
                shadow = 0.8;
            }
            
            return clamp(shadow, 0.0, 1.0);
        }
 
        float rayMarchShadow(vec3 origin, vec3 dir, float maxDist) {
            float depth = 0.0;
            for(int i = 0; i < 64; i++) {
                vec3 p = origin + dir * depth;
                if(p.y < getTerrainHeight(p.xz)) return 0.0;
                if(depth > maxDist) break;
                depth += max(0.05, depth * 0.1);
            }
            return 1.0;
        }
 
        float getShadowFactor(sampler2D map, vec4 coord, float bias) {
            vec3 projCoord = coord.xyz / coord.w;
            projCoord = projCoord * 0.5 + 0.5; // 转换到[0,1]范围
    
            // PCF软化阴影边缘
            float shadow = 0.0;
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

        // 优化的光线追踪阴影采样函数 - 改进碰撞检测逻辑
        float sampleRaytracedShadow(vec2 uv) {
            // 基础阴影采样 - 读取阴影贴图
            vec4 shadowData = texture2D(shadowMap, uv);
            float shadow = 1.0 - shadowData.r;
            
            // 添加边缘软化 - 5x5采样，提高阴影质量
            vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
            float softShadow = 0.0;
            int samples = 0;
            
            // 改进的采样模式：随机采样以减少锯齿
            float randomOffset = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
            
            for(int x = -2; x <= 2; x++) {
                for(int y = -2; y <= 2; y++) {
                    // 添加轻微随机偏移以减少阴影走样
                    vec2 jitter = vec2(randomOffset * 0.2);
                    vec2 offset = vec2(x, y) * texelSize + jitter;
                    
                    // 确保采样在有效范围内 - 优化PCF采样，添加边界条件检查
                    if(uv.x + offset.x >= 0.0 && uv.x + offset.x <= 1.0 && 
                       uv.y + offset.y >= 0.0 && uv.y + offset.y <= 1.0) {
                        // 使用双线性采样提高精度
                        float depthSample = texture2D(shadowMap, uv + offset).r;
                        softShadow += 1.0 - depthSample;
                        samples++;
                    }
                }
            }
            
            if(samples > 0) {
                softShadow /= float(samples);
            } else {
                softShadow = shadow;
            }
            
            // 优化的光线步进遮挡检测
            const int raySteps = 32; // 增加采样步数以提高精度
            const int earlyTerminationSteps = 8; // 提前终止步数，用于快速遮挡检测
            float stepSize = 0.008; // 更小的步进大小以提高精度
            float occlusion = 0.0;
            
            // 统一使用正交投影空间的光线方向
            vec2 shadowSpaceLightDir = normalize(vec2(sunDirection.x, sunDirection.z));
            
            // 当前点在阴影贴图中的深度值
            float currentDepth = shadowData.r;
            
            // 动态bias计算，基于表面法线和光照方向
            float normalBias = 0.001 * tan(acos(max(dot(vNormal, normalize(sunDirection)), 0.0)));
            float bias = max(0.001, normalBias);
            
            // 两级步进策略
            // 1. 先进行快速粗采样，检测是否有明显遮挡
            bool earlyTerminate = false;
            for(int i = 1; i <= min(earlyTerminationSteps, raySteps); i++) {
                float t = float(i) * stepSize * 2.0; // 更大的步长
                vec2 samplePos = uv - shadowSpaceLightDir * t;
                
                // 边界条件检查
                if(samplePos.x >= 0.0 && samplePos.x <= 1.0 && 
                   samplePos.y >= 0.0 && samplePos.y <= 1.0) {
                    
                    float sampleDepth = texture2D(shadowMap, samplePos).r;
                    
                    // 修复深度比较错误：使用正确的深度比较逻辑
                    if(currentDepth > sampleDepth + bias) {
                        earlyTerminate = true;
                        occlusion += 0.5; // 提前检测到遮挡，直接增加较大遮挡值
                        break;
                    }
                }
            }
            
            // 2. 如果没有明显遮挡，进行精细采样
            if(!earlyTerminate) {
                // 自适应采样权重，基于距离的高斯分布
                for(int i = 1; i <= raySteps; i++) {
                    float t = float(i) * stepSize;
                    vec2 samplePos = uv - shadowSpaceLightDir * t;
                    
                    // 确保采样位置在有效范围内
                    if(samplePos.x >= 0.0 && samplePos.x <= 1.0 && 
                       samplePos.y >= 0.0 && samplePos.y <= 1.0) {
                        
                        float sampleDepth = texture2D(shadowMap, samplePos).r;
                        
                        // 修复深度比较逻辑
                        float depthAtCollision = sampleDepth + bias;
                        
                        // 改进的遮挡判断逻辑
                        // 使用线性插值在相邻采样点之间进行更精确的碰撞检测
                        if(i < raySteps) {
                            // 获取下一个采样点的深度
                            vec2 nextSamplePos = uv - shadowSpaceLightDir * (float(i+1) * stepSize);
                            if(nextSamplePos.x >= 0.0 && nextSamplePos.x <= 1.0 && 
                               nextSamplePos.y >= 0.0 && nextSamplePos.y <= 1.0) {
                                float nextSampleDepth = texture2D(shadowMap, nextSamplePos).r;
                                
                                // 线性插值计算更精确的碰撞点
                                float nextDepthAtCollision = nextSampleDepth + bias;
                                if((sampleDepth <= currentDepth && nextSampleDepth >= currentDepth) || 
                                   (sampleDepth >= currentDepth && nextSampleDepth <= currentDepth)) {
                                    // 碰撞发生在两个采样点之间，计算精确的碰撞位置
                                    float tCollision = t + stepSize * 
                                        (currentDepth - sampleDepth) / (nextSampleDepth - sampleDepth);
                                    
                                    // 基于精确碰撞位置计算遮挡权重
                                    float weight = exp(-tCollision * 15.0); // 指数衰减权重
                                    occlusion += weight * 0.4;
                                }
                            }
                        }
                    }
                }
            }
            
            // 应用遮挡效果
            occlusion = clamp(occlusion, 0.0, 1.0);
            
            // 结合软阴影和光线步进遮挡结果
            return mix(softShadow, 1.0, 1.0 - occlusion * 0.9);
        }

        // 专门的3x3 PCF采样函数，添加边界条件检查
        float pcfShadow(vec2 uv, float bias) {
            float shadow = 0.0;
            vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
            int validSamples = 0;
            
            // 3x3采样窗口，符合要求的采样模式
            for(int x = -1; x <= 1; x++) {
                for(int y = -1; y <= 1; y++) {
                    vec2 offset = vec2(x, y) * texelSize;
                    
                    // 严格的边界条件检查，防止采样越界
                    if(uv.x + offset.x > 0.0 && uv.x + offset.x < 1.0 && 
                       uv.y + offset.y > 0.0 && uv.y + offset.y < 1.0) {
                        float shadowDepth = texture2D(shadowMap, uv + offset).r;
                        float currentDepth = texture2D(shadowMap, uv).r;
                        
                        // 使用正确的深度比较逻辑
                        if(currentDepth > shadowDepth + bias) {
                            shadow += 1.0;
                        }
                        validSamples++;
                    }
                }
            }
            
            // 只有在有有效采样时才进行平均
            if(validSamples > 0) {
                shadow /= float(validSamples);
            }
            
            return shadow;
        }

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
            vec3 safeSunDir = normalize(sunDirection);
            float diff = max(dot(vNormal, safeSunDir), 0.0); // 移除人工下限
            
            // 物理正确的光照强度：根据太阳高度设置
            float lightIntensity = sunDirection.y;
            
            // 坐标转换
            vec3 shadowCoord = vShadowCoord.xyz / vShadowCoord.w;
            shadowCoord = shadowCoord * 0.5 + 0.5;
 
            // 阴影计算
            float bias = max(0.001, 0.005 * tan(acos(max(dot(vNormal, sunDirection), 0.0))));
            float shadowMapFactor = getShadowFactor(shadowMap, vShadowCoord, bias);
            float rayMarchFactor = rayMarchShadow(vWorldPos + vNormal * 0.1, normalize(sunDirection), 50.0);
  
            // 混合阴影
            float shadow = mix(shadowMapFactor, 1.0 - rayMarchFactor, 0.3);
            shadow *= shadowIntensity;
            
            // 应用阴影
            float shadowFactor = 1.0 - shadow;
            
            // 4. 最终颜色 - 修复光照应用
            // 分离直接光和间接光的计算逻辑
            // 直接光：受阴影影响
            vec3 directLight = surfaceColor * diff * shadowFactor * lightIntensity;
            // 间接光（环境光）：不受阴影影响，提供基础光照
            vec3 ambientLight = surfaceColor * 0.15; // 固定15%的环境光强度
            
            // 合并直接光和间接光
            vec3 finalColor = directLight + ambientLight;
            
            // 5. 雾效
            float depth = length(vWorldPos.xz - cameraPosition.xz);
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * depth * depth );
            vec3 safeFogColor = fogColor.x < 0.0 ? vec3(0.53, 0.8, 0.92) : fogColor;
            
            gl_FragColor = vec4(mix(finalColor, safeFogColor, fogFactor), 1.0);
        }
    `
};