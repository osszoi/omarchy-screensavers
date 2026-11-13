#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 origin;
    float aspect;
    float levels;
    float reveal;
    vec4 baseColor;
    vec4 lowColor;
    vec4 midColor;
    vec4 highColor;
};

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 slope(vec2 cell) {
    float turn = hash(cell) * 6.2831853;
    return vec2(cos(turn), sin(turn));
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(slope(i), f);
    float b = dot(slope(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(slope(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(slope(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float terrain(vec2 p) {
    float height = 0.0;
    float weight = 0.5;
    for (int i = 0; i < 4; i++) {
        height += weight * noise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        weight *= 0.5;
    }
    return clamp(0.5 + height * 0.95, 0.0, 1.0);
}

void main() {
    vec2 p = vec2(qt_TexCoord0.x * aspect, qt_TexCoord0.y) * 1.7 + origin;
    float height = terrain(p);
    float scaled = height * levels;
    float level = floor(scaled + 0.5);
    float steep = fwidth(scaled);
    float away = abs(scaled - level) / max(steep, 1e-5);

    float major = 1.0 - step(0.5, mod(level, 4.0));
    float width = mix(0.55, 1.15, major);
    // a flat summit sits on its level everywhere, without this it would fill in solid
    float sloped = smoothstep(0.0008, 0.004, steep);
    float line = (1.0 - smoothstep(width - 0.6, width + 0.6, away)) * sloped;
    float halo = exp(-away * 0.3) * 0.1 * sloped;

    // the map draws itself from the valleys up
    float drawn = smoothstep(0.0, 0.05, reveal - level / levels);

    vec3 tint = height < 0.5 ? mix(lowColor.rgb, midColor.rgb, height * 2.0) : mix(midColor.rgb, highColor.rgb, height * 2.0 - 1.0);
    vec3 color = baseColor.rgb + tint * 0.1 * height * smoothstep(0.0, 0.3, reveal - height);
    color += tint * (line * mix(0.45, 0.95, major) + halo) * drawn;
    fragColor = vec4(color, 1.0) * qt_Opacity;
}
