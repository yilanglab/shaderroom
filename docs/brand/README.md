# 环面纽结标志

素材：`public/assets/shaderroom-knot.svg`

从项目内置 `(p=2, q=3)` 环面纽结的中心曲线生成平面投影；统一带宽，用三处透明留白表达上下穿插。透明背景、256 × 256 viewBox，无字体、位图或外部依赖。

- 组合字标时，桌面图形显示为 30px，窄屏为 28px，带宽为 viewBox 中的 30 单位，视觉笔画与左半边粗体字标接近；预览展示了 24、32、40、48px。
- SVG 内联到页面时，`currentColor` 跟随文字颜色，适配深浅背景。
- 通过 `<img>` 引用时不会继承外部 `color`；可用 CSS mask 着色，或在设计软件中修改颜色。
- 预览地址：`http://127.0.0.1:3012/docs/brand/knot-preview.html`。

CSS mask 示例：

```css
.brand-knot {
  display: inline-block;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  background: currentColor;
  mask: url('/assets/shaderroom-knot.svg') center / contain no-repeat;
}
```

字标素材：`public/assets/shaderroom-wordmark.svg`，原样保留用户提供的矢量路径。项目左上角及组合预览均使用此字标；图形和字标独立存放。
