# FSS Pattern Lab：五种轮廓生成方法

网站新增五套独立运行的轮廓引擎，并保留原有“智能混合、直线拟合、精确像素”三个兼容模式。

| 方法 | 算法 | 输出 | 限制 |
| --- | --- | --- | --- |
| Potrace 风格 Bézier | 二值轮廓追踪、RDP 分段、保尖角二次 Bézier 平滑 | 采样闭合多段线 | 本站独立实现的 Potrace 风格算法，不是官方 Potrace |
| Marching Squares | 从灰度/颜色场插值亚像素零等值线 | 采样闭合多段线 | 无法恢复像素中不存在的尺寸 |
| RANSAC + 直线/圆弧 | 确定性的内点一致性线段检测，融合圆弧 | 直线、原生 bulge 圆弧 | 自由曲线仍会分段近似 |
| Level Set / SDF | 8 邻域 chamfer 有符号距离场 + 平滑 + 0 等值线 | 采样闭合多段线 | 是 SDF 零水平集提取，并非 PDE 迭代演化 |
| 参数化 CAD / SVG | PNG 识别圆/矩形；SVG 直接提取矢量基元 | 直线、原生圆弧、采样路径 | 不是完整 CAD 布尔/通用 SVG 解析器 |

## SVG 支持与边界

上传 SVG 自动切换参数化模式，不必先将原始矢量图像像素化。可读取已填充的 rect、circle、ellipse、polygon、闭合 polyline，以及 M/L/H/V/C/S/Q/T/A/Z 闭合 path 和常见 translate/scale/rotate/matrix 变换。等比圆形保持原生 DXF 圆弧；自由曲线与椭圆在本版采样为折线。不支持复杂 CSS 继承、遮罩、use/defs、裁切、渐变、笔画转区域或任意布尔运算；重叠填充应在源软件中进行布尔合并。独立嵌套图形按奇偶包含关系解释为孔洞，源图如果包含背景矩形，需删除背景或切换金属颜色识别。

位图轮廓重建后的拓扑核验包括金属连通数量、内部孔洞、细线/狭缝保护和像素覆盖误差；校验失败后自动回退到已有混合重建并报告原因。手动点线编辑、毫米比例设置、离线版、直接 DXF 和 Python 导出保持可用。

原生圆弧以 LWPOLYLINE bulge 保存；LINE 导出与非等比缩放会改用采样线段。Python 代码仍使用采样顶点；SVG 原生自由曲线控制点尚不能完整保留。

## 检查

依次运行：node geometry.test.cjs、node advanced.test.cjs、node codegen.test.cjs。

图片转 DXF 无法保证恢复丢失的 CAD 源几何；需在 CAD/CST 核对斜角、金属线宽、孔径、缝隙和 S 参数。