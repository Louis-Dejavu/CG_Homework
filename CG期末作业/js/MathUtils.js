// 文件路径: js/MathUtils.js

export const WorldMath = {
    // 1. GLSL 代码：嵌入 Vertex Shader
    glslFunction: `
        float getWorldHeight(vec2 xz, float scale, float amplitude) {
            float h = 0.0;
            
            // --- 原有地形算法 ---
            h += sin(xz.x * 0.02 * scale) * 5.0 * amplitude;
            h += cos(xz.y * 0.02 * scale) * 5.0 * amplitude;
            h += sin(xz.x * 0.1 * scale) * 1.0 * amplitude;
            h += cos(xz.y * 0.15 * scale) * 1.0 * amplitude;
            
            // --- 🔥 新增：挖路算法 (Road Carving) ---
            // 定义道路宽度 (左右各 6.0)
            float roadHalfWidth = 6.0; 
            float blendWidth = 4.0;    // 边缘平滑过渡区
            
            // 计算当前点距离道路中心(X=0)的距离
            float dist = abs(xz.x);
            
            // 生成遮罩：道路中心为0，路边逐渐变为1
            // smoothstep(edge0, edge1, x): 如果 x < edge0 返回0，x > edge1 返回1
            float roadMask = smoothstep(roadHalfWidth, roadHalfWidth + blendWidth, dist);
            
            // 将高度乘以遮罩：道路中心高度被强制压为 0 (或接近0)
            return h * roadMask; 
        }
    `,

    // 在MathUtils.js中的WorldMath对象中添加这个方法
    getNormal: (x, z, scale = 1.0, amplitude = 1.0) => {
    // 使用中心差分法计算梯度
        const eps = 0.1;
        const h = WorldMath.getHeight(x, z, scale, amplitude);
        const hx = WorldMath.getHeight(x + eps, z, scale, amplitude);
        const hz = WorldMath.getHeight(x, z + eps, scale, amplitude);
    
        // 计算梯度
        const dx = (hx - h) / eps;
        const dz = (hz - h) / eps;
    
        // 法线向量为 (-dx, 1, -dz)，然后归一化
        const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
        return normal;
    },

    // 2. JS 函数：CPU 端计算高度 (必须逻辑同步)
    getHeight: (x, z, scale = 1.0, amplitude = 1.0) => {
        let h = 0.0;
        h += Math.sin(x * 0.02 * scale) * 5.0 * amplitude;
        h += Math.cos(z * 0.02 * scale) * 5.0 * amplitude;
        h += Math.sin(x * 0.1 * scale) * 1.0 * amplitude;
        h += Math.cos(z * 0.15 * scale) * 1.0 * amplitude;
        
        // --- JS 端同步挖路 ---
        const roadHalfWidth = 6.0;
        const blendWidth = 4.0;
        const dist = Math.abs(x);
        
        // 模拟 GLSL 的 smoothstep
        let roadMask = (dist - roadHalfWidth) / blendWidth;
        roadMask = Math.max(0, Math.min(1, roadMask)); // clamp to 0-1
        // smoothstep 插值曲线: 3t^2 - 2t^3
        roadMask = roadMask * roadMask * (3 - 2 * roadMask);

        return h * roadMask;
    }
};