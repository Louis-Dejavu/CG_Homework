var numVertices=0; //生成顶点数组时计数
var points = [];
var colors = [];
var normalsArray =[];
var texCoordsArray = [];//顶点的纹理坐标属性数组texCoordsArray
var texCoord = [
	vec2(0, 0),
	vec2(0, 1),
	vec2(1, 1),
	vec2(1, 0) 
];

// 噪声函数用于创建凹凸效果
function noise(x, y, z) {
    return Math.sin(x * 4.0) * Math.cos(y * 4.0) * Math.sin(z * 4.0) * 0.1;
}

// 计算噪声函数的梯度（用于法线计算）
function gradient(x, y, z) {
    var eps = 0.001;
    var nx = (noise(x+eps, y, z) - noise(x-eps, y, z)) / (2 * eps);
    var ny = (noise(x, y+eps, z) - noise(x, y-eps, z)) / (2 * eps);
    var nz = (noise(x, y, z+eps) - noise(x, y, z-eps)) / (2 * eps);
    return vec3(nx, ny, nz);
}

/**生成立方体顶点******************************
****************************************************/
  // Create a cube
  //    v5----- v6
  //   /|      /|
  //  v1------v2|
  //  | |     | |
  //  | |v4---|-|v7
  //  |/      |/
  //  v0------v3
   
  function colorCube(scale){
	numVertices = 0;
	var vertexMC=scale; //顶点沿轴到原点的最远距离
	var vertices = [
		vec4( -vertexMC, -vertexMC,  vertexMC, 1.0 ), //Z正前面左下角点V0，顺时针四点序号0~3
		vec4( -vertexMC,  vertexMC,  vertexMC, 1.0 ),
		vec4(  vertexMC,  vertexMC,  vertexMC, 1.0 ),
		vec4(  vertexMC, -vertexMC,  vertexMC, 1.0 ),
		vec4( -vertexMC, -vertexMC, -vertexMC, 1.0 ),   //Z负后面左下角点V4，顺时针四点序号4~7
		vec4( -vertexMC,  vertexMC, -vertexMC, 1.0 ),
		vec4(  vertexMC,  vertexMC, -vertexMC, 1.0 ),
		vec4(  vertexMC, -vertexMC, -vertexMC, 1.0 )
	];

	quad( 1, 0, 3, 2 ); //Z正-前 红----》兰    //顺时针0123，逆时针是0321或1032
	quad( 4, 5, 6, 7 ); //Z负-后 兰---》深兰	
    quad( 2, 3, 7, 6 ); //X正-右 黄-----》红
	quad( 5, 4, 0, 1 ); //X负-左 品红-----》深红
    quad( 6, 5, 1, 2 ); //Y正-上 青----》绿
	quad( 3, 0, 4, 7 ); //Y负-下 绿----》深绿
	
    function quad(a, b, c, d) 
	{
		var vertexColors = [
			[ 0.0, 0.0, 0.0, 1.0 ],  // black
			[ 0.0, 0.0, 1.0, 1.0 ],  // blue      //[ 1.0, 0.0, 0.0, 1.0 ],  // red
			[ 1.0, 0.0, 0.0, 1.0 ],  // red       //[ 1.0, 1.0, 0.0, 1.0 ],  // yellow
			[ 0.0, 0.5, 0.0, 1.0 ],  // green        
			[ 0.0, 0.0, 0.5, 1.0 ],  // blue
			[ 0.5, 0.0, 0.0, 1.0 ],  // red        //[ 1.0, 0.0, 1.0, 1.0 ],  // magenta 品红
			[ 0.0, 1.0, 0.0, 1.0 ],  // green     //[ 0.0, 1.0, 1.0, 1.0 ],  // cyan 青
			[ 1.0, 1.0, 1.0, 1.0 ]   // white
		];

		//计算该面的法向量作为每个顶点的法向量
		var t1 = subtract(vertices[b], vertices[a]);
		var t2 = subtract(vertices[c], vertices[b]);
		var v1=vec3(t1[0],t1[1],t1[2]);
		var v2=vec3(t2[0],t2[1],t2[2]);
		var normal = cross(v1, v2);
		var normal = vec4(normal[0],normal[1],normal[2],0.0);//注意向量的最后W=0	
			 points.push(vertices[a]);
		 colors.push(vertexColors[a]);
		 normalsArray.push(normal);
		 texCoordsArray.push(texCoord[1]);

		 points.push(vertices[b]);
		 colors.push(vertexColors[a]);
		 normalsArray.push(normal);
		 texCoordsArray.push(texCoord[0]);

		 points.push(vertices[c]);
		 colors.push(vertexColors[a]);
		 normalsArray.push(normal);
		 texCoordsArray.push(texCoord[3]);

		 points.push(vertices[a]);
		 colors.push(vertexColors[a]);
		 normalsArray.push(normal);
		 texCoordsArray.push(texCoord[1]);

		 points.push(vertices[c]);
		 colors.push(vertexColors[a]);
		 normalsArray.push(normal);
		 texCoordsArray.push(texCoord[3]);

		 points.push(vertices[d]);
		 colors.push(vertexColors[a]);
		 normalsArray.push(normal);
		 texCoordsArray.push(texCoord[2]);  
		 
		 numVertices+=6;//顶点计数
	};
	return numVertices;
}

// 创建有凹凸效果的立方体
function bumpyCube(scale, subdivisions) {
	numVertices = 0;
	var vertexMC = scale;
	var subdiv = subdivisions || 10; // 默认细分程度
	
	// 清空数组以确保没有残留数据
	points = [];
	colors = [];
	normalsArray = [];
	texCoordsArray = [];
	
	// 生成前面 (Z+) - 法线方向为(0,0,1)
	generateFace('z', -vertexMC, vertexMC, -vertexMC, vertexMC, vertexMC, 0, 0, 1);
	// 生成后面 (Z-) - 法线方向为(0,0,-1)
	generateFace('z', -vertexMC, vertexMC, -vertexMC, vertexMC, -vertexMC, 0, 0, -1);
	// 生成右面 (X+) - 法线方向为(1,0,0)
	generateFace('x', -vertexMC, vertexMC, -vertexMC, vertexMC, vertexMC, 1, 0, 0);
	// 生成左面 (X-) - 法线方向为(-1,0,0)
	generateFace('x', -vertexMC, vertexMC, -vertexMC, vertexMC, -vertexMC, -1, 0, 0);
	// 生成上面 (Y+) - 法线方向为(0,1,0)
	generateFace('y', -vertexMC, vertexMC, -vertexMC, vertexMC, vertexMC, 0, 1, 0);
	// 生成下面 (Y-) - 法线方向为(0,-1,0)
	generateFace('y', -vertexMC, vertexMC, -vertexMC, vertexMC, -vertexMC, 0, -1, 0);
	
	return numVertices;
}

// 生成细分的面并应用凹凸效果 - 支持x、y、z三个方向
function generateFace(axis, coord1Start, coord1End, coord2Start, coord2End, fixedCoord, nx, ny, nz) {
	var subdiv = 10;
	var step1 = (coord1End - coord1Start) / subdiv;
	var step2 = (coord2End - coord2Start) / subdiv;
	
	for (var i = 0; i < subdiv; i++) {
		for (var j = 0; j < subdiv; j++) {
			// 根据面的方向计算顶点坐标
			var c1_1 = coord1Start + i * step1;
			var c1_2 = coord1Start + (i + 1) * step1;
			var c2_1 = coord2Start + j * step2;
			var c2_2 = coord2Start + (j + 1) * step2;
			
			// 根据面的方向创建三角形
			if (axis === 'z') {
				// Z方向的面 - XY平面
				createBumpyTriangle(
					c1_1, c2_1, fixedCoord,
					c1_2, c2_1, fixedCoord,
					c1_2, c2_2, fixedCoord,
					nx, ny, nz, i, j, subdiv
				);
				createBumpyTriangle(
					c1_1, c2_1, fixedCoord,
					c1_2, c2_2, fixedCoord,
					c1_1, c2_2, fixedCoord,
					nx, ny, nz, i, j, subdiv
				);
			} else if (axis === 'x') {
				// X方向的面 - YZ平面
				createBumpyTriangle(
					fixedCoord, c1_1, c2_1,
					fixedCoord, c1_2, c2_1,
					fixedCoord, c1_2, c2_2,
					nx, ny, nz, i, j, subdiv
				);
				createBumpyTriangle(
					fixedCoord, c1_1, c2_1,
					fixedCoord, c1_1, c2_2,
					fixedCoord, c1_2, c2_2,
					nx, ny, nz, i, j, subdiv
				);
			} else if (axis === 'y') {
				// Y方向的面 - XZ平面
				createBumpyTriangle(
					c1_1, fixedCoord, c2_1,
					c1_2, fixedCoord, c2_1,
					c1_2, fixedCoord, c2_2,
					nx, ny, nz, i, j, subdiv
				);
				createBumpyTriangle(
					c1_1, fixedCoord, c2_1,
					c1_1, fixedCoord, c2_2,
					c1_2, fixedCoord, c2_2,
					nx, ny, nz, i, j, subdiv
				);
			}
		}
	}
}

// 创建带有凹凸效果的三角形
function createBumpyTriangle(x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, i, j, subdiv) {
	// 为每个顶点应用凹凸位移
	var p1 = applyBump(x1, y1, z1, nx, ny, nz);
	var p2 = applyBump(x2, y2, z2, nx, ny, nz);
	var p3 = applyBump(x3, y3, z3, nx, ny, nz);
	
	// 计算平滑法线
	var n1 = calculateSmoothNormal(p1[0], p1[1], p1[2], nx, ny, nz);
	var n2 = calculateSmoothNormal(p2[0], p2[1], p2[2], nx, ny, nz);
	var n3 = calculateSmoothNormal(p3[0], p3[1], p3[2], nx, ny, nz);
	
	// 纹理坐标
	var s1 = i / subdiv;
	var s2 = (i + 1) / subdiv;
	var t1 = j / subdiv;
	var t2 = (j + 1) / subdiv;
	
	// 添加第一个三角形
	points.push(p1);
	colors.push(vec4(0.0, 0.0, 1.0, 1.0)); // 统一使用蓝色
	normalsArray.push(n1);
	texCoordsArray.push(vec2(s1, t1));
	
	points.push(p2);
	colors.push(vec4(0.0, 0.0, 1.0, 1.0)); // 统一使用蓝色
	normalsArray.push(n2);
	texCoordsArray.push(vec2(s2, t1));
	
	points.push(p3);
	colors.push(vec4(0.0, 0.0, 1.0, 1.0)); // 统一使用蓝色
	normalsArray.push(n3);
	texCoordsArray.push(vec2(s2, t2));
	
	numVertices += 3;
}

// 应用凹凸位移
function applyBump(x, y, z, nx, ny, nz) {
	// 计算凹凸位移量
	var displacement = noise(x, y, z);
	// 沿法线方向应用位移
	return vec4(
		x + nx * displacement,
		y + ny * displacement,
		z + nz * displacement,
		1.0
	);
}

// 计算平滑法线
function calculateSmoothNormal(x, y, z, nx, ny, nz) {
	// 获取噪声函数的梯度
	var grad = gradient(x, y, z);
	// 基础法线
	var baseNormal = vec3(nx, ny, nz);
	// 添加梯度到法线以获得平滑效果
	var smoothNormal = normalize(add(baseNormal, grad));
	return vec4(smoothNormal[0], smoothNormal[1], smoothNormal[2], 0.0);
}

function plane(vscale){
	numVertices = 0;
	var scale = vscale;

	var vertices = [
		vec4(scale, -0.5, scale, 1.0),
		vec4(-scale, -0.5, scale, 1.0),
		vec4(-scale, -0.5, -scale, 1.0),

		vec4(scale, -0.5,  scale, 1.0),
		vec4(-scale, -0.5,  -scale, 1.0),
		vec4(scale, -0.5,  -scale, 1.0)
	];

	var planeColors = [
		vec4(1.0, 1.0, 1.0, 1.0),
		vec4(1.0, 1.0, 1.0, 1.0),
		vec4(1.0, 1.0, 1.0, 1.0),
		vec4(1.0, 1.0, 1.0, 1.0),
		vec4(1.0, 1.0, 1.0, 1.0),
		vec4(1.0, 1.0, 1.0, 1.0),
	];

	var planeNormls = [
		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(0.0, 1.0, 0.0, 0.0),

		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(0.0, 1.0, 0.0, 0.0)
	]

	var planeTexCoords = [
		vec2(1,  0.0),
		vec2(0.0,  0.0),
		vec2(0.0, 1),

		vec2(1,  0.0),
		vec2(0.0, 1),
		vec2(1, 1)
	]
	for(var i =0; i<6;++i)
	{
		points.push(vertices[i]);
		colors.push(planeColors[i]);
		normalsArray.push(planeNormls[i]);
		texCoordsArray.push(planeTexCoords[i]);
	}
	return 6;
}